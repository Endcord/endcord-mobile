import { Emitter, EmitterEvent, EmitterListener, EmitterListenerData } from "@core/vendetta/Emitter";
import { writeDocument } from "@lib/api/native/fs";
import { NativeCacheModule, NativeFileModule } from "@lib/api/native/modules";
import { type DurableFile, readDurably, writeDurably } from "@lib/api/storage/durable";
import { Platform } from "react-native";

const emitterSymbol = Symbol.for("vendetta.storage.emitter");
const syncAwaitSymbol = Symbol.for("vendetta.storage.accessor");

export function createProxy(target: any = {}): { proxy: any; emitter: Emitter; } {
    const emitter = new Emitter();

    const childrens = new WeakMap<any, any>();
    const proxiedChildrenSet = new WeakSet<any>();

    function createProxy(target: any, path: string[]): any {
        return new Proxy(target, {
            get(target, prop: string) {
                if ((prop as unknown) === emitterSymbol) return emitter;

                const newPath = [...path, prop];
                const value: any = target[prop];

                if (value !== undefined && value !== null) {
                    emitter.emit("GET", {
                        path: newPath,
                        value,
                    });

                    if (typeof value === "object") {
                        if (proxiedChildrenSet.has(value)) return value;
                        if (childrens.has(value)) return childrens.get(value);

                        const childrenProxy = createProxy(value, newPath);
                        childrens.set(value, childrenProxy);
                        return childrenProxy;
                    }

                    return value;
                }

                return value;
            },

            set(target, prop: string, value) {
                if (typeof value === "object") {
                    if (childrens.has(value)) {
                        target[prop] = childrens.get(value);
                    } else {
                        const childrenProxy = createProxy(value, [...path, prop]);
                        childrens.set(value, childrenProxy);
                        proxiedChildrenSet.add(value);
                        target[prop] = childrenProxy;
                    }
                } else {
                    target[prop] = value;
                }

                emitter.emit("SET", {
                    path: [...path, prop],
                    value: target[prop],
                });
                // we do not care about success, if this actually does fail we have other problems
                return true;
            },

            deleteProperty(target, prop: string) {
                const value = typeof target[prop] === "object" ? childrens.get(target[prop])! : target[prop];
                const success = delete target[prop];
                if (success)
                    emitter.emit("DEL", {
                        value,
                        path: [...path, prop],
                    });
                return success;
            },
        });
    }

    return {
        proxy: createProxy(target, []),
        emitter,
    };
}

export function useProxy<T>(storage: T): T {
    const emitter = (storage as any)?.[emitterSymbol] as Emitter | undefined;
    const [, forceUpdate] = React.useReducer(n => ~n, 0);

    React.useEffect(() => {
        if (!emitter) {
            // A wrapSync storage that is still loading: draw again once it has loaded, then listen to it
            let active = true;
            (storage as any)?.[syncAwaitSymbol]?.(() => active && forceUpdate());
            return () => void (active = false);
        }

        const listener: EmitterListener = (event: EmitterEvent, data: EmitterListenerData) => {
            if (event === "DEL" && data.value === storage) return;
            forceUpdate();
        };

        emitter.on("SET", listener);
        emitter.on("DEL", listener);

        return () => {
            emitter.off("SET", listener);
            emitter.off("DEL", listener);
        };
    }, [emitter]);

    return storage;
}

export async function createStorage<T>(backend: StorageBackend): Promise<Awaited<T>> {
    const data = await backend.get();
    const { proxy, emitter } = createProxy(data);

    const handler = () => backend.set(proxy);
    emitter.on("SET", handler);
    emitter.on("DEL", handler);

    return proxy;
}

export function wrapSync<T extends Promise<any>>(store: T): Awaited<T> {
    let awaited: any = undefined;

    const awaitQueue: (() => void)[] = [];
    const awaitInit = (cb: () => void) => (awaited ? cb() : awaitQueue.push(cb));

    const settle = (v: any) => {
        awaited = v;
        awaitQueue.splice(0).forEach(cb => cb());
    };
    store.then(settle, e => {
        // Whatever waits for this storage would otherwise wait forever. Changes stay in memory for this session, and
        // the stored data is left as it is rather than overwritten with an empty copy.
        console.error("[Endcord] A storage failed to load", e);
        settle({});
    });

    return new Proxy({} as Awaited<T>, {
        ...Object.fromEntries(
            Object.getOwnPropertyNames(Reflect)
                // @ts-expect-error
                .map(k => [k, (t: T, ...a: any[]) => Reflect[k](awaited ?? t, ...a)])
        ),
        get(target, prop, recv) {
            if (prop === syncAwaitSymbol) return awaitInit;
            return Reflect.get(awaited ?? target, prop, recv);
        },
    });
}

export function awaitStorage(...stores: any[]) {
    return Promise.all(
        stores.map(store =>
            new Promise<void>(res => store[syncAwaitSymbol](res)))
    );
}

export interface StorageBackend {
    get: () => unknown | Promise<unknown>;
    set: (data: unknown) => void | Promise<void>;
}

const ILLEGAL_CHARS_REGEX = /[<>:"/\\|?*]/g;

/** Where a document is written: on iOS, Discord's older file module writes from the app's folder rather than Documents */
export const filePathFixer = (file: string): string => Platform.select({
    default: file,
    ios: NativeFileModule.saveFileToGallery ? file : `Documents/${file}`,
});

const getMMKVPath = (name: string): string => {
    if (ILLEGAL_CHARS_REGEX.test(name)) {
        // Replace forbidden characters with hyphens
        name = name.replace(ILLEGAL_CHARS_REGEX, "-").replace(/-+/g, "-");
    }

    return `vd_mmkv/${name}`;
};

export const purgeStorage = async (store: string) => {
    if (await NativeCacheModule.getItem(store)) {
        NativeCacheModule.removeItem(store);
    }

    const mmkvPath = getMMKVPath(store);
    // The storage and the copies kept beside it, so that nothing of it comes back
    for (const path of [mmkvPath, `${mmkvPath}.bak`, `${mmkvPath}.damaged`]) {
        if (await NativeFileModule.fileExists(`${NativeFileModule.getConstants().DocumentsDirPath}/${path}`)) {
            await NativeFileModule.removeFile?.("documents", path);
        }
    }
};

export const createMMKVBackend = (store: string, defaultData = {}) => {
    const mmkvPath = getMMKVPath(store);
    const defaultStr = JSON.stringify(defaultData);

    return createFileBackend(mmkvPath, defaultData, (async () => {
        const path = `${NativeFileModule.getConstants().DocumentsDirPath}/${mmkvPath}`;
        if (await NativeFileModule.fileExists(path)) return;

        let oldData = await NativeCacheModule.getItem(store) ?? defaultStr;

        // From the testing on Android, it seems to return this if the data is too large
        if (oldData === "!!LARGE_VALUE!!") {
            const cachePath = `${NativeFileModule.getConstants().CacheDirPath}/mmkv/${store}`;
            if (await NativeFileModule.fileExists(cachePath)) {
                oldData = await NativeFileModule.readFile(cachePath, "utf8");
            } else {
                console.log(`${store}: Experienced data loss :(`);
                oldData = defaultStr;
            }
        }

        try {
            JSON.parse(oldData);
        } catch {
            console.error(`${store} had an unparseable data while migrating`);
            oldData = defaultStr;
        }

        await writeDocument(filePathFixer(mmkvPath), oldData);
        if (await NativeCacheModule.getItem(store) !== null) {
            NativeCacheModule.removeItem(store);
            console.log(`Successfully migrated ${store} store from MMKV storage to fs`);
        }
    })());
};

/** A storage's file in the documents directory, and the copies kept beside it */
const documentExists = (file: string): Promise<boolean> => Promise.resolve()
    .then(() => NativeFileModule.fileExists(`${NativeFileModule.getConstants().DocumentsDirPath}/${file}`))
    .then(Boolean, () => false);

const durableDocument = (file: string): DurableFile => ({
    read: async suffix => {
        const path = `${NativeFileModule.getConstants().DocumentsDirPath}/${file}${suffix}`;
        return await NativeFileModule.fileExists(path) ? await NativeFileModule.readFile(path, "utf8") : undefined;
    },
    write: (suffix, text) => writeDocument(filePathFixer(file + suffix), text),
});

export const createFileBackend = (file: string, defaultData = {}, migratePromise?: Promise<void>): StorageBackend => {
    return {
        get: async () => {
            await migratePromise;
            // A damaged file comes back from its last good copy, and is kept aside, rather than replaced with an empty
            // storage: that lost every setting in it
            const doc = durableDocument(file);
            const saved = await readDurably(doc, file);
            // A storage is an object: a file that holds only a number or a string is as good as damaged
            if (saved && saved.value !== null && typeof saved.value === "object" && !Array.isArray(saved.value)) return saved.value;

            // Written only where there's no file: one that's there but couldn't be read stays as it is until something
            // changes, and a damaged one is kept as .damaged
            if (!await documentExists(file)) await writeDocument(filePathFixer(file), JSON.stringify(defaultData));
            return JSON.parse(JSON.stringify(defaultData));
        },
        set: async data => {
            await migratePromise;
            await writeDurably(durableDocument(file), file, JSON.stringify(data));
        }
    };
};

