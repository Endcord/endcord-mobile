// node remove-dylib.cjs <file> <dylib path>: takes the load of a dylib out of a thin arm64 Mach-O, moving the load
// commands after it up, for a Discord IPA that comes with another tweak in it. The code signature it had no longer
// matches; cyan signs the app again.
const fs = require("fs");

const [file, dylib] = process.argv.slice(2);
const b = fs.readFileSync(file);
if (b.readUInt32LE(0) !== 0xfeedfacf) throw new Error("not a thin 64-bit Mach-O");
const ncmds = b.readUInt32LE(16), sizeofcmds = b.readUInt32LE(20);
const LOADS = new Set([0xc, 0x80000018]); // LC_LOAD_DYLIB, LC_LOAD_WEAK_DYLIB

let offset = 32, found = -1, foundSize = 0;
for (let i = 0; i < ncmds; i++) {
    const cmd = b.readUInt32LE(offset), size = b.readUInt32LE(offset + 4);
    if (LOADS.has(cmd)) {
        const name = b.toString("utf8", offset + b.readUInt32LE(offset + 8), offset + size).replace(/\0+$/, "");
        if (name === dylib) {
            found = offset;
            foundSize = size;
        }
    }
    offset += size;
}
if (found < 0) throw new Error(`${file} doesn't load ${dylib}`);

const end = 32 + sizeofcmds;
b.copy(b, found, found + foundSize, end);
b.fill(0, end - foundSize, end);
b.writeUInt32LE(ncmds - 1, 16);
b.writeUInt32LE(sizeofcmds - foundSize, 20);
fs.writeFileSync(file, b);
console.log(`removed ${dylib} (${foundSize} bytes)`);
