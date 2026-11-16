import { isSafeObject } from "@lib/utils/safeJson";

// A really basic fetch wrapper which throws on non-ok response codes
export default async function safeFetch(input: RequestInfo | URL, options?: RequestInit, timeout = 10000) {
    const req = await fetch(input, {
        signal: timeoutSignal(timeout),
        ...options
    });

    if (!req.ok) throw new Error(`Request returned non-ok: ${req.status} ${req.statusText}`);
    return req;
}

function timeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(`Timed out after ${ms}ms`), ms);
    return controller.signal;
}

/**
 * Most an addon's files may weigh, as Endcord PC limits what it downloads. React Native reads a reply whole, so these
 * don't save the download, but they keep a server from making the app parse or keep something huge in memory.
 */
export const MAX_SIZES = {
    /** A plugin's or a font pack's manifest, a repository's index */
    json: 4 * 1024 * 1024,
    /** A theme, which can carry its pictures inside */
    theme: 16 * 1024 * 1024,
    /** A plugin's code */
    code: 32 * 1024 * 1024,
    /** One font file */
    font: 32 * 1024 * 1024,
} as const;

const tooLarge = (max: number) => new Error(`The download is larger than ${Math.round(max / 1024 / 1024)} MB`);

/** Refuses before reading when the server says it's too large; the size it says isn't trusted otherwise */
function checkDeclaredSize(res: Response, maxBytes: number) {
    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
}

/** The reply as text, at most about maxBytes of it */
export async function readText(res: Response, maxBytes: number): Promise<string> {
    checkDeclaredSize(res, maxBytes);
    const text = await res.text();
    // Every character is at least a byte
    if (text.length > maxBytes) throw tooLarge(maxBytes);
    return text;
}

/** The reply as JSON, at most maxBytes of it, and refused when a key in it would change an object's prototype */
export async function readJson<T = any>(res: Response, maxBytes = MAX_SIZES.json): Promise<T> {
    const parsed = JSON.parse(await readText(res, maxBytes));
    if (!isSafeObject(parsed)) throw new Error("The download isn't valid: it has a key that isn't allowed");
    return parsed;
}

/** The reply's bytes, at most maxBytes of them */
export async function readBytes(res: Response, maxBytes: number): Promise<ArrayBuffer> {
    checkDeclaredSize(res, maxBytes);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw tooLarge(maxBytes);
    return bytes;
}
