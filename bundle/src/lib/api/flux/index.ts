// shelter-mod inspired
import { FluxDispatcher } from "@metro/common";

const blockedSym = Symbol.for("bunny.flux.blocked");
const modifiedSym = Symbol.for("bunny.flux.modified");

export const dispatcher = FluxDispatcher;

type Intercept = (payload: Record<string, any> & { type: string; }) => any;
let intercepts: Intercept[] = [];

/**
 * @internal
 */
export function injectFluxInterceptor() {
    const cb = (payload: any) => {
        for (const intercept of intercepts) {
            let res: unknown;
            try {
                res = intercept(payload);
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
 */
export function intercept(cb: Intercept, options?: { first?: boolean; }) {
    // First, for interceptors that must see an action before others change it
    if (options?.first) intercepts.unshift(cb);
    else intercepts.push(cb);

    return () => {
        intercepts = intercepts.filter(i => i !== cb);
    };
}
