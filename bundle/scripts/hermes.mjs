// Precompiles the bundle to Hermes bytecode for the bytecode versions Discord ships, as dist/endcord.v<version>.hbc.
//
// Bytecode starts faster and takes less memory than the plain bundle, which Hermes must parse and compile on every
// start, but it only loads on the exact bytecode version it was compiled for. The loader reads that version from
// Discord's own bundle and asks for the matching file, falling back to endcord.min.js when there isn't one; so a
// version is only listed here with the compiler of the Hermes that Discord builds with.
//
//   node scripts/hermes.mjs [input]       (default: dist/endcord.min.js)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Bytecode version → the hermes-compiler release that emits it, named like Discord's Hermes ("<date>0<version>"), and
 * the npm integrity of its package: what is downloaded is checked against it, so a changed package never builds Endcord
 * @type {Record<string, { release: string; integrity: string; }>}
 */
const COMPILERS = {
    98: {
        release: "250829098.0.15",
        integrity: "sha512-GJiEBl2JgT8FsRcY9DOBYW9L0KGRij58y7FeINJOaqWdYIrf/o3hi8NCsW3CV+XbG1vAwEeuXvwg4+xMJ8cc3g==",
    },
    99: {
        release: "260318099.0.5",
        integrity: "sha512-4Gze+pGTGTUBRmnv6LtdOMo6ZzMMh3hEkvDiWzvuNL5LM0EO5YGhr8xh3fRjFaEqReUwEGjJGcGgEPFe9+E6Gw==",
    },
};

/** @type {Partial<Record<NodeJS.Platform, string>>} */
const BINS = { win32: "win64-bin/hermesc.exe", darwin: "osx-bin/hermesc", linux: "linux64-bin/hermesc" };
const BIN = BINS[process.platform];
if (!BIN) throw new Error(`No hermesc for ${process.platform}`);

const input = process.argv[2] ?? "dist/endcord.min.js";
const cacheDir = path.join(os.tmpdir(), "endcord-hermesc");

/**
 * The compiler of a release, downloaded once from npm into the temp folder
 * @param {{ release: string; integrity: string; }} compiler
 * @param {string} bin The compiler's path inside the package, for this platform
 */
async function download({ release, integrity }, bin) {
    const dir = path.join(cacheDir, release);
    const file = path.join(dir, "package", "hermesc", bin);
    if (existsSync(file)) return file;
    mkdirSync(dir, { recursive: true });

    const tarball = `https://registry.npmjs.org/hermes-compiler/-/hermes-compiler-${release}.tgz`;
    const response = await fetch(tarball);
    if (!response.ok) throw new Error(`Couldn't download ${tarball}: ${response.status}`);
    const data = new Uint8Array(/** @type {ArrayBuffer} */(await response.arrayBuffer()));
    const [algorithm, digest] = integrity.split("-", 2);
    if (createHash(algorithm).update(data).digest("base64") !== digest) {
        throw new Error(`${tarball} doesn't match its pinned ${algorithm}; not using it`);
    }
    writeFileSync(path.join(dir, "package.tgz"), data);
    // From inside the folder: GNU tar on Windows takes "C:\..." for a remote host
    execFileSync("tar", ["-xzf", "package.tgz"], { cwd: dir });
    if (process.platform !== "win32") execFileSync("chmod", ["+x", file]);
    return file;
}

/**
 * The bytecode version in a file's header, or undefined when it isn't Hermes bytecode
 * @param {string} file
 */
function bytecodeVersion(file) {
    const header = readFileSync(file).subarray(0, 12);
    return header.readBigUInt64LE(0) === 0x1F1903C103BC1FC6n ? header.readUInt32LE(8) : undefined;
}

for (const [version, compiler] of Object.entries(COMPILERS)) {
    const out = path.join(path.dirname(input), `endcord.v${version}.hbc`);
    // -O optimizes; not -strict: the bundle runs in sloppy mode as plain JS, and must run the same as bytecode
    execFileSync(await download(compiler, BIN), ["-O", "-emit-binary", "-Wno-undefined-variable", "-out", out, input], { stdio: ["ignore", "inherit", "inherit"] });
    const written = bytecodeVersion(out);
    if (written !== Number(version)) throw new Error(`${out} has bytecode version ${written}, not ${version}`);
    console.log(`✔ ${out} (bytecode ${version}, hermes-compiler ${compiler.release})`);
}
