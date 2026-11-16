import { Emitter } from "@core/vendetta/Emitter";
import { Observable, ObserverOptions } from "@gullerya/object-observer";
import { fileExists, readFile, removeFile, writeFile } from "@lib/api/native/fs";
import { debounce } from "es-toolkit";

import { type DurableFile, readDurably, writeDurably } from "./durable";

const storageInitErrorSymbol = Symbol.for("bunny.storage.initError");
const storagePromiseSymbol = Symbol.for("bunny.storage.promise");

const _loadedStorage = {} as Record<string, any>;

type Flush = () => Promise<void>;

/** Finishes a storage's pending write, by path: the last backend that saved it holds it */
const flushers = new Map<string, Flush>();

/** A storage's file and the copies kept beside it, in Endcord's folder */
const durableFile = (filePath: string): DurableFile => ({
    read: async suffix => await fileExists(filePath + suffix) ? await readFile(filePath + suffix) : undefined,
    write: (suffix, text) => writeFile(filePath + suffix, text),
});

function createFileBackend<T extends object>(filePath: string) {
    let writing: Promise<void> = Promise.resolve();
    const write = debounce((data: T) => {
        writing = writeDurably(durableFile(filePath), filePath, JSON.stringify(data))
            .catch(e => console.error(`[Endcord] Couldn't save ${filePath}`, e));
    }, 500);
    const flush = () => {
        write.flush();
        return writing;
    };

    return {
        /**
         * The saved contents, or undefined when the file is damaged and has no good copy: a storage that can't be read
         * starts over rather than leaving everything that waits for it waiting forever, Discord's start included
         */
        get: async () => (await readDurably<T>(durableFile(filePath), filePath))?.value,
        set: async (data: T) => {
            if (!data || typeof data !== "object") {
                throw new Error("data needs to be an object");
            }

            write(data);
            flushers.set(filePath, flush);
        },
        exists: async () => {
            return await fileExists(filePath);
        }
    };
}

export function useObservable(observables: Observable[], opts?: ObserverOptions) {
    if (observables.some((o: any) => o?.[storageInitErrorSymbol])) throw new Error(
        "An error occured while initializing the storage",
    );

    if (observables.some(o => !Observable.isObservable(o))) {
        throw new Error("Argument passed isn't an Observable");
    }

    const [, forceUpdate] = React.useReducer(n => ~n, 0);

    React.useEffect(() => {
        const listener = () => forceUpdate();

        observables.forEach(o => Observable.observe(o, listener, opts));

        return () => {
            observables.forEach(o => Observable.unobserve(o, listener));
        };
    }, []);
}

export async function updateStorage<T extends object = {}>(path: string, value: T): Promise<void> {
    _loadedStorage[path] = value;
    createFileBackend<T>(path).set(value);
}

export function createStorageAndCallback<T extends object = {}>(
    path: string,
    cb: (proxy: T) => void,
    {
        dflt = {} as T,
        nullIfEmpty = false
    } = {}
) {
    let emitter: Emitter;

    const callback = (data: any) => {
        const proxy = new Proxy(Observable.from(data), {
            get(target, prop, receiver) {
                if (prop === Symbol.for("vendetta.storage.emitter")) {
                    if (emitter) return emitter;
                    emitter = new Emitter();

                    Observable.observe(target, changes => {
                        for (const change of changes) {
                            emitter.emit(change.type !== "delete" ? "SET" : "DEL", {
                                path: change.path,
                                value: change.value
                            });
                        }
                    });

                    return emitter;
                }

                return Reflect.get(target, prop, receiver);
            },
        });

        const handler = () => backend.set(proxy);
        Observable.observe(proxy, handler);

        cb(proxy);
    };

    const backend = createFileBackend<T>(path);
    if (_loadedStorage[path]) {
        callback(_loadedStorage[path]);
    } else {
        let called = false;
        const empty = () => _loadedStorage[path] = nullIfEmpty ? null : dflt;
        const done = (data: any) => {
            if (called) return;
            called = true;
            try {
                callback(data);
            } catch (e) {
                // Whatever waits for this storage would otherwise wait forever
                console.error(`[Endcord] The storage ${path} couldn't be opened; it starts empty`, e);
                callback(empty());
            }
        };
        backend.exists().then(async exists => {
            if (!exists) {
                if (nullIfEmpty) {
                    done(_loadedStorage[path] = null);
                } else {
                    _loadedStorage[path] = dflt;
                    await backend.set(dflt);
                    done(dflt);
                }
            } else {
                const saved: unknown = await backend.get();
                // A storage is an object: a file that holds only a number or a string is as good as damaged
                if (saved !== null && typeof saved === "object" && !Array.isArray(saved)) done(_loadedStorage[path] = saved);
                else done(empty());
            }
        }).catch(e => {
            console.error(`[Endcord] The storage ${path} couldn't be opened; it starts empty`, e);
            done(empty());
        });
    }
}

type StorageOptions<T extends object> = Parameters<typeof createStorageAndCallback<T>>[2];

export async function createStorageAsync<T extends object = {}>(
    path: string,
    opts: StorageOptions<T> = {}
): Promise<T> {
    return new Promise(r => createStorageAndCallback(path, r, opts));
}

export const createStorage = <T extends object = {}>(
    path: string,
    opts: StorageOptions<T> = {}
): T => {
    const promise = new Promise(r => resolvePromise = r);
    let awaited: any, resolved: boolean, error: any, resolvePromise: (val?: unknown) => void;

    createStorageAndCallback(path, proxy => {
        awaited = proxy;
        resolved = true;
        resolvePromise();
    }, opts);

    const check = () => {
        if (resolved) return true;
        throw new Error(`Attempted to access storage without initializing: ${path}`);
    };

    return new Proxy({} as any, {
        ...Object.fromEntries(
            Object.getOwnPropertyNames(Reflect)
                .map(k => [k, (t: T, ...a: any[]) => {
                    // @ts-expect-error
                    return check() && Reflect[k](awaited, ...a);
                }])
        ),
        get(target, prop, recv) {
            if (prop === storageInitErrorSymbol) return error;
            if (prop === storagePromiseSymbol) return promise;
            return check() && Reflect.get(awaited ?? target, prop, recv);
        },
    });
};

export async function preloadStorageIfExists(path: string): Promise<boolean> {
    if (_loadedStorage[path]) return true;

    const backend = createFileBackend(path);
    if (await backend.exists()) {
        const saved = await backend.get();
        // Damaged beyond repair: as if it weren't there
        if (saved === undefined) return false;
        _loadedStorage[path] = saved;
        return true;
    }

    return false;
}

export async function purgeStorage(path: string) {
    await removeFile(path);
    // Its copies too, so that nothing of a removed storage comes back
    for (const suffix of [".bak", ".damaged"]) {
        if (await fileExists(path + suffix).catch(() => false)) await removeFile(path + suffix).catch(() => { });
    }
    delete _loadedStorage[path];
}

/** Saves now what storages would save in a moment, for a reload that must not lose the latest changes */
export async function flushStorages() {
    await Promise.all([...flushers.values()].map(flush => flush()));
}

export function awaitStorage(...proxies: any[]) {
    return Promise.all(proxies.map(proxy => proxy[storagePromiseSymbol]));
}

/** @internal */
export function getPreloadedStorage<T extends object = {}>(path: string): T | undefined {
    return _loadedStorage[path];
}
