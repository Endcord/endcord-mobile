import { MAX_SIZES, readBytes } from "@lib/utils/safeFetch";

import { NativeFileModule } from "./modules";

/**
 * A path inside the documents directory, as Endcord PC checks the paths it writes: never absolute, never up out of the
 * folder it's in, and without the characters that could make it another path. Names in it come from themes, fonts and
 * plugin repositories, which are data from elsewhere.
 */
export function checkedPath(path: string): string {
    if (typeof path !== "string" || !path || path.startsWith("/") || /[\\\0-\x1f\x7f]/.test(path) || path.split("/").some(part => part === ".." || part === "." || part === "")) {
        throw new Error(`Not a path Endcord may use: ${JSON.stringify(path)}`);
    }
    return path;
}

/**
 * Every file in pyoncord/preloads runs as code when Discord starts, before Endcord: only the developer settings put one
 * there, through writeDocument and on the user's say-so, never the general file functions
 */
function checkedWritePath(path: string): string {
    checkedPath(path);
    if (/^pyoncord\/preloads(\/|$)/i.test(path)) throw new Error(`Not a path Endcord may write: ${JSON.stringify(path)}`);
    return path;
}

/**
 * Discord's writeFile into the documents directory, tried again when it fails. On a fresh install several storages
 * create their folder at the same moment, and the ones that lose the race fail with "Failed to create parent
 * directory" although the folder is there by then; a storage whose first write failed would stay unsaved.
 */
export async function writeDocument(path: string, data: string, encoding: "utf8" | "base64" = "utf8"): Promise<void> {
    checkedPath(path);
    for (let attempt = 1; ; attempt++) {
        try {
            return void await NativeFileModule.writeFile("documents", path, data, encoding);
        } catch (e) {
            if (attempt >= 3) throw e;
        }
    }
}

/**
 * Removes all files in a directory from the path given
 * @param path Path to the targeted directory
 */
export async function clearFolder(path: string, { prefix = "pyoncord/" } = {}) {
    if (typeof NativeFileModule.clearFolder !== "function") throw new Error("'fs.clearFolder' is not supported");
    return void await NativeFileModule.clearFolder("documents", checkedPath(`${prefix}${path}`));
}

/**
 * Remove file from given path, currently no check for any failure
 * @param path Path to the file
 */
export async function removeFile(path: string, { prefix = "pyoncord/" } = {}) {
    if (typeof NativeFileModule.removeFile !== "function") throw new Error("'fs.removeFile' is not supported");
    return void await NativeFileModule.removeFile("documents", checkedPath(`${prefix}${path}`));
}

/**
 * Remove file from given path, currently no check for any failure
 * @param path Path to the file
 */
export async function removeCacheFile(path: string, prefix = "pyoncord/") {
    if (typeof NativeFileModule.removeFile !== "function") throw new Error("'fs.removeFile' is not supported");
    return void await NativeFileModule.removeFile("cache", checkedPath(`${prefix}${path}`));
}

/**
 * Check if the file or directory given by the path exists
 * @param path Path to the file
 */
export async function fileExists(path: string, { prefix = "pyoncord/" } = {}) {
    return await NativeFileModule.fileExists(`${NativeFileModule.getConstants().DocumentsDirPath}/${checkedPath(`${prefix}${path}`)}`);
}

/**
 * A wrapper to write to a file to the documents directory
 * @param path Path to the file
 * @param data String data to write to the file
 */
export async function writeFile(path: string, data: string, { prefix = "pyoncord/" } = {}): Promise<void> {
    if (typeof data !== "string") throw new Error("Argument 'data' must be a string");
    return writeDocument(checkedWritePath(`${prefix}${path}`), data);
}

/**
 * A wrapper to read a file from the documents directory
 * @param path Path to the file
 * @param fallback Fallback data to return if the file doesn't exist, and will be written to the file
 */
export async function readFile(path: string, { prefix = "pyoncord/" } = {}): Promise<string> {
    const file = checkedPath(`${prefix}${path}`);
    try {
        return await NativeFileModule.readFile(`${NativeFileModule.getConstants().DocumentsDirPath}/${file}`, "utf8");
    } catch (err) {
        throw new Error(`An error occured while writing to '${path}'`, { cause: err });
    }
}

/**
 * Download a file from the given URL and save it to the path given
 * @param url URL to download the file from
 * @param path Path to save the file to
 */
export async function downloadFile(url: string, path: string, { prefix = "pyoncord/", maxBytes = MAX_SIZES.font, checkResponse }: {
    prefix?: string;
    maxBytes?: number;
    /** Throws for a response that mustn't be saved, such as one redirected somewhere the file may not come from */
    checkResponse?: (response: Response) => unknown;
} = {}) {
    const file = checkedWritePath(`${prefix}${path}`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file from ${url}: ${response.status}`);
    }
    checkResponse?.(response);

    const arrayBuffer = await readBytes(response, maxBytes);
    const data = Buffer.from(arrayBuffer).toString("base64");

    await writeDocument(file, data, "base64");
}
