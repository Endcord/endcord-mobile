// Precompiles the bundle to Hermes bytecode for the bytecode versions Discord ships, as dist/endcord.v<version>.hbc.
//
// Bytecode starts faster and takes less memory than the plain bundle, which Hermes must parse and compile on every
// start, but it only loads on the exact bytecode version it was compiled for. The loader reads that version from
// Discord's own bundle and asks for the matching file, falling back to endcord.min.js when there isn't one; so a
// version is only listed here with the compiler of the Hermes that Discord builds with.
//
//   node scripts/hermes.mjs [input]       (default: dist/endcord.min.js)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Bytecode version → the hermes-compiler release that emits it, named like Discord's Hermes ("<date>0<version>") */
const COMPILERS = {
    98: "250829098.0.15",
    99: "260318099.0.5",
};

const BIN = { win32: "win64-bin/hermesc.exe", darwin: "osx-bin/hermesc", linux: "linux64-bin/hermesc" }[process.platform];
if (!BIN) throw new Error(`No hermesc for ${process.platform}`);

const input = process.argv[2] ?? "dist/endcord.min.js";
const cacheDir = path.join(os.tmpdir(), "endcord-hermesc");

/** The compiler for a release, downloaded once from npm into the temp folder */
async function compiler(version) {
    const dir = path.join(cacheDir, version);
    const bin = path.join(dir, "package", "hermesc", BIN);
    if (existsSync(bin)) return bin;
    mkdirSync(dir, { recursive: true });
    const meta = await fetch(`https://registry.npmjs.org/hermes-compiler/${version}`).then(r => r.json());
    const tarball = meta?.dist?.tarball;
    if (!tarball) throw new Error(`hermes-compiler@${version} isn't on npm`);
    writeFileSync(path.join(dir, "package.tgz"), Buffer.from(await fetch(tarball).then(r => r.arrayBuffer())));
    // From inside the folder: GNU tar on Windows takes "C:\..." for a remote host
    execFileSync("tar", ["-xzf", "package.tgz"], { cwd: dir });
    if (process.platform !== "win32") execFileSync("chmod", ["+x", bin]);
    return bin;
}

/** The bytecode version in a file's header, or undefined when it isn't Hermes bytecode */
function bytecodeVersion(file) {
    const header = readFileSync(file).subarray(0, 12);
    return header.readBigUInt64LE(0) === 0x1F1903C103BC1FC6n ? header.readUInt32LE(8) : undefined;
}

for (const [version, release] of Object.entries(COMPILERS)) {
    const out = path.join(path.dirname(input), `endcord.v${version}.hbc`);
    // -O optimizes; not -strict: the bundle runs in sloppy mode as plain JS, and must run the same as bytecode
    execFileSync(await compiler(release), ["-O", "-emit-binary", "-Wno-undefined-variable", "-out", out, input], { stdio: ["ignore", "inherit", "inherit"] });
    const written = bytecodeVersion(out);
    if (written !== Number(version)) throw new Error(`${out} has bytecode version ${written}, not ${version}`);
    console.log(`✔ ${out} (bytecode ${version}, hermes-compiler ${release})`);
}
