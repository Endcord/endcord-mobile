const {
    after: _after,
    before: _before,
    instead: _instead
} = require("spitroast");

/** @internal */
export const _patcherDelaySymbol = Symbol.for("bunny.api.patcher.delay");

type Unpatcher = () => boolean;
type DelayCallback = (callback: (target: any) => void) => unknown;
type Thenable = { then: typeof Promise.prototype.then };

interface PatchFn<Callback> {
    (func: string, parent: any, callback: Callback, once?: boolean): Unpatcher;
    await(func: string, parent: Promise<unknown>, callback: Callback, once?: boolean): Unpatcher;
}

type BeforeFn = PatchFn<(args: any[]) => unknown | unknown[]>;
type InsteadFn = PatchFn<(args: any[], origFunc: Function) => unknown>;
type AfterFn = PatchFn<(args: any[], ret: any) => unknown>;

type PatchType = "before" | "instead" | "after";

/**
 * A patch's callback that can't break what it patches: when it throws, the function runs as if it weren't patched
 * (for an instead patch that hadn't called the original yet), and the error is logged. One broken patch would
 * otherwise throw out of Discord's own function, taking down every avatar or message that goes through it.
 */
function guard(type: PatchType, func: string, callback: Function) {
    if (typeof callback !== "function") return callback;
    if (type === "instead") {
        return function (this: any, args: any[], original: Function) {
            let called = false;
            const tracked = function (this: any, ...originalArgs: any[]) {
                called = true;
                return original.apply(this, originalArgs);
            };
            try {
                return callback.call(this, args, tracked);
            } catch (e) {
                if (called) throw e;
                console.error(`[Endcord] A patch of ${func} failed, so it ran unpatched`, e);
                return original.apply(this, args);
            }
        };
    }
    // Two fixed arguments (before: args; after: args, result) rather than rest ones: some patched functions, like
    // the JSX runtime's, run thousands of times a frame
    return function (this: any, args: any[], result?: any) {
        try {
            return callback.call(this, args, result);
        } catch (e) {
            console.error(`[Endcord] A patch of ${func} failed, so it was skipped`, e);
            // Leaves the arguments (before) or the result (after) as they were
            return undefined;
        }
    };
}

function create(type: PatchType, rawFn: Function) {
    const fn = function (this: any, ...args: any[]) {
        args[2] = guard(type, String(args[0]), args[2]);
        return rawFn.apply(this, args);
    };

    function patchFn(this: any, ...args: any[]) {
        if (typeof args[1][_patcherDelaySymbol] === "function") {
            const delayCallback: DelayCallback = args[1][_patcherDelaySymbol];

            let cancel = false;
            let unpatch = () => cancel = true;

            delayCallback(target => {
                if (cancel) return;
                args[1] = target;
                unpatch = fn.apply(this, args);
            });

            return () => unpatch();
        }

        return fn.apply(this, args);
    }

    function promisePatchFn(this: any, ...args: [any, Thenable, ...any]) {
        const thenable = args[1];
        if (!thenable || !("then" in thenable)) throw new Error("target is not a then-able object");

        let cancel = false;
        let unpatch = () => cancel = true;

        thenable.then(target => {
            if (cancel) return;
            args[1] = target;
            unpatch = patchFn.apply(this, args);
        });

        return () => unpatch();
    }

    return Object.assign(patchFn, { await: promisePatchFn });
}

export const after = create("after", _after) as AfterFn;
export const before = create("before", _before) as BeforeFn;
export const instead = create("instead", _instead) as InsteadFn;

/** @internal */
export default { after, before, instead };
