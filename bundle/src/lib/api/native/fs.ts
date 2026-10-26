import { NativeFileModule } from "./modules";

/**
 * Discord's writeFile into the documents directory, tried again when it fails. On a fresh install several storages
 * create their folder at the same moment, and the ones that lose the race fail with "Failed to create parent
 * directory" although the folder is there by then; a storage whose first write failed would stay unsaved.
 */
export async function writeDocument(path: string, data: string, encoding: "utf8" | "base64" = "utf8"): Promise<void> {
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
    return void await NativeFileModule.clearFolder("documents", `${prefix}${path}`);
}

/**
 * Remove file from given path, currently no check for any failure
 * @param path Path to the file
 */
export async function removeFile(path: string, { prefix = "pyoncord/" } = {}) {
    if (typeof NativeFileModule.removeFile !== "function") throw new Error("'fs.removeFile' is not supported");
    return void await NativeFileModule.removeFile("documents", `${prefix}${path}`);
}

/**
 * Remove file from given path, currently no check for any failure
 * @param path Path to the file
 */
export async function removeCacheFile(path: string, prefix = "pyoncord/") {
    if (typeof NativeFileModule.removeFile !== "function") throw new Error("'fs.removeFile' is not supported");
    return void await NativeFileModule.removeFile("cache", `${prefix}${path}`);
}

/**
 * Check if the file or directory given by the path exists
 * @param path Path to the file
 */
export async function fileExists(path: string, { prefix = "pyoncord/" } = {}) {
    return await NativeFileModule.fileExists(`${NativeFileModule.getConstants().DocumentsDirPath}/${prefix}${path}`);
}

/**
 * A wrapper to write to a file to the documents directory
 * @param path Path to the file
 * @param data String data to write to the file
 */
export async function writeFile(path: string, data: string, { prefix = "pyoncord/" } = {}): Promise<void> {
    if (typeof data !== "string") throw new Error("Argument 'data' must be a string");
    return writeDocument(`${prefix}${path}`, data);
}

/**
 * A wrapper to read a file from the documents directory
 * @param path Path to the file
 * @param fallback Fallback data to return if the file doesn't exist, and will be written to the file
 */
export async function readFile(path: string, { prefix = "pyoncord/" } = {}): Promise<string> {
    try {
        return await NativeFileModule.readFile(`${NativeFileModule.getConstants().DocumentsDirPath}/${prefix}${path}`, "utf8");
    } catch (err) {
        throw new Error(`An error occured while writing to '${path}'`, { cause: err });
    }
}

/**
 * Download a file from the given URL and save it to the path given
 * @param url URL to download the file from
 * @param path Path to save the file to
 */
export async function downloadFile(url: string, path: string, { prefix = "pyoncord/" } = {}) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download file from ${url}: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");

    await writeDocument(`${prefix}${path}`, data, "base64");
}
