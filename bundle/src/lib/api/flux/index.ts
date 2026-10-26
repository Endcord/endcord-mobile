// shelter-mod inspired
import { FluxDispatcher } from "@metro/common";

const blockedSym = Symbol.for("bunny.flux.blocked");
const modifiedSym = Symbol.for("bunny.flux.modified");

export const dispatcher = FluxDispatcher;

type Intercept = (payload: Record<string, any> & { type: string; }) => any;

interface Entry {
    cb: Intercept;
    /** Only actions of this type are shown to cb */
    type?: string;
}

let entries: Entry[] = [];
// Discord dispatches hundreds of actions a second; these let the ones no interceptor is for go straight through
let untyped = 0;
const typed = new Map<string, number>();

/**
 * @internal
 */
export function injectFluxInterceptor() {
    const cb = (payload: any) => {
        if (!untyped && !typed.has(payload?.type)) return false;

        for (const entry of entries) {
            // Read every time: an earlier interceptor may have turned the action into another type
            if (entry.type !== undefined && entry.type !== payload.type) continue;

            let res: unknown;
            try {
                res = entry.cb(payload);
            } catch (e) {
                // One broken interceptor must not stop Discord from handling the action
                console.error(`[Endcord] a Flux interceptor failed on ${payload?.type}`, e);
                continue;
            }

            // nullish -> nothing, falsy -> block, object -> modify
            if (res == null) {
                continue;
            } else if (!res) {
                payload[blockedSym] = true;
            } else if (typeof res === "object") {
                Object.assign(payload, res);
                payload[modifiedSym] = true;
            }
        }

        return blockedSym in payload;
    };

    (dispatcher._interceptors ??= []).unshift(cb);

    return () => dispatcher._interceptors &&= dispatcher._interceptors.filter(v => v !== cb);
}

/**
 * Intercept Flux dispatches. Return type affects the end result, where
 * nullish -> nothing, falsy -> block, object -> modify
 *
 * With `type`, only actions of that type reach the callback, and others don't cost anything.
 */
export function intercept(cb: Intercept, options?: { first?: boolean; type?: string; }) {
    const entry: Entry = { cb, type: options?.type };
    // First, for interceptors that must see an action before others change it
    if (options?.first) entries = [entry, ...entries];
    else entries = [...entries, entry];
    if (entry.type === undefined) untyped++;
    else typed.set(entry.type, (typed.get(entry.type) ?? 0) + 1);

    let removed = false;
    return () => {
        if (removed) return;
        removed = true;
        entries = entries.filter(e => e !== entry);
        if (entry.type === undefined) untyped--;
        else if ((typed.get(entry.type) ?? 1) <= 1) typed.delete(entry.type);
        else typed.set(entry.type, typed.get(entry.type)! - 1);
    };
}
