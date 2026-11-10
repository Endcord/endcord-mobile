// Signs a published build: writes endcord-release.json, the SHA-256 and size of each bundle and APK in a folder with a
// sequence number that only goes up, and endcord-release.sig, its ECDSA P-256 / SHA-256 signature. The loaders check
// their bundle against both with the public key they're built with (release-key.pub), and the installer checks the
// loader and the installers it downloads the same way, so whoever can change the files on the server still can't make
// a loader run them or the installer patch them in, or an older signed build again.
//
// With ENDCORD_RELEASE_BASE_URL, each bundle also gets the address it has at that base. The branch's own addresses are
// cached for minutes, each file on its own, so right after a deploy a new manifest can meet an old bundle; an address
// of the commit itself never changes, so a manifest and the bundles it lists always come from the same build.
//
//   ENDCORD_RELEASE_KEY=<PEM private key> node scripts/sign-release.mjs <folder>

import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const [folder] = process.argv.slice(2);
const pem = process.env.ENDCORD_RELEASE_KEY;
if (!folder || !pem) throw new Error("Usage: ENDCORD_RELEASE_KEY=<PEM> node scripts/sign-release.mjs <folder>");

const key = createPrivateKey(pem);
const baseUrl = process.env.ENDCORD_RELEASE_BASE_URL;
/** @type {Record<string, { size: number; sha256: string; url?: string; }>} */
const files = {};
const PUBLISHED = /^(medslol(\.v\d+\.hbc|\.min\.js)|endcord-(xposed|installer|classic-installer)\.apk)$/;
for (const name of readdirSync(folder).filter(n => PUBLISHED.test(n)).sort()) {
    const file = path.join(folder, name);
    files[name] = {
        size: statSync(file).size,
        sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
        ...baseUrl ? { url: new URL(name, baseUrl).href } : {},
    };
}
if (!files["endcord.min.js"]) throw new Error(`No endcord.min.js in ${folder}`);

const manifest = Buffer.from(JSON.stringify({
    format: 1,
    // Seconds since 1970: every build's is higher than the last's
    sequence: Number(process.env.ENDCORD_RELEASE_SEQUENCE ?? Math.floor(Date.now() / 1000)),
    commit: process.env.GITHUB_SHA ?? "local",
    files,
}, null, 4));
const signature = sign("sha256", manifest, key);

// A key that isn't the one the loaders trust would leave every update refused, so a build with it stops here
const trusted = process.env.ENDCORD_RELEASE_PUBLIC_KEY_FILE ?? new URL("../release-key.pub", import.meta.url);
const publicKey = createPublicKey({ key: Buffer.from(readFileSync(trusted, "utf8").trim(), "base64"), format: "der", type: "spki" });
if (!verify("sha256", manifest, publicKey, signature)) throw new Error("This key doesn't match release-key.pub");

writeFileSync(path.join(folder, "endcord-release.json"), manifest);
writeFileSync(path.join(folder, "endcord-release.sig"), signature);
console.log(`Signed ${Object.keys(files).join(", ")}`);
