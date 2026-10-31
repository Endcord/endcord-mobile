// node insert-dylib.cjs <in> <out> <dylib path>: adds a weak load of the dylib to a thin arm64 Mach-O, in the free
// space after its load commands, like insert_dylib --weak. The code signature it had no longer matches; signers
// sign the app again.
const fs = require("fs");

const [input, output, dylib] = process.argv.slice(2);
const b = Buffer.from(fs.readFileSync(input));
if (b.readUInt32LE(0) !== 0xfeedfacf) throw new Error("not a thin 64-bit Mach-O");
const ncmds = b.readUInt32LE(16), sizeofcmds = b.readUInt32LE(20);

let o = 32, firstData = Infinity;
for (let i = 0; i < ncmds; i++) {
    const cmd = b.readUInt32LE(o), size = b.readUInt32LE(o + 4);
    if ((cmd === 0xc || cmd === 0x80000018) && b.toString("utf8", o + b.readUInt32LE(o + 8), o + size).replace(/\0+$/, "") === dylib) {
        throw new Error("already loads " + dylib);
    }
    if (cmd === 0x19) { // LC_SEGMENT_64: where its sections' data starts
        const nsects = b.readUInt32LE(o + 64);
        for (let s = 0; s < nsects; s++) {
            const sect = o + 72 + s * 80;
            const offset = b.readUInt32LE(sect + 48), flags = b.readUInt32LE(sect + 64);
            const zerofill = (flags & 0xff) === 0x1 || (flags & 0xff) === 0xc || (flags & 0xff) === 0x12;
            if (offset && !zerofill) firstData = Math.min(firstData, offset);
        }
    }
    o += size;
}
if (o !== 32 + sizeofcmds) throw new Error("load commands don't add up");

const name = Buffer.from(dylib + "\0");
const cmdsize = (24 + name.length + 7) & ~7;
if (32 + sizeofcmds + cmdsize > firstData) throw new Error(`no room: ${firstData - 32 - sizeofcmds} bytes free, ${cmdsize} needed`);
const end = 32 + sizeofcmds;
if (!b.subarray(end, end + cmdsize).every(x => x === 0)) throw new Error("the space after the load commands isn't empty");

b.writeUInt32LE(0x80000018, end); // LC_LOAD_WEAK_DYLIB
b.writeUInt32LE(cmdsize, end + 4);
b.writeUInt32LE(24, end + 8); // name offset
b.writeUInt32LE(2, end + 12); // timestamp
b.writeUInt32LE(0x10000, end + 16); // current version 1.0.0
b.writeUInt32LE(0x10000, end + 20); // compatibility version
name.copy(b, end + 24);
b.writeUInt32LE(ncmds + 1, 16);
b.writeUInt32LE(sizeofcmds + cmdsize, 20);
fs.writeFileSync(output, b);
console.log(`added ${dylib} (${cmdsize} bytes; ${firstData - end - cmdsize} bytes still free)`);
