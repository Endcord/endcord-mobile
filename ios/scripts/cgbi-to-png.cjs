// node cgbi-to-png.cjs <in> <out>: an ordinary PNG from one Xcode optimized for iOS (a CgBI chunk, BGRA pixels, deflate
// without its header), which Pillow can't read, for an opaque 8-bit image like Discord's app icon. Anything else is copied.
const fs = require("fs");
const zlib = require("zlib");

const [input, output] = process.argv.slice(2);
const b = fs.readFileSync(input);

const chunks = [];
for (let at = 8; at < b.length;) {
    const length = b.readUInt32BE(at);
    chunks.push({ type: b.toString("latin1", at + 4, at + 8), data: b.subarray(at + 8, at + 8 + length) });
    at += length + 12;
}
if (!chunks.some(c => c.type === "CgBI")) {
    fs.copyFileSync(input, output);
    process.exit();
}

const ihdr = chunks.find(c => c.type === "IHDR").data;
const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error("not 8-bit RGBA without interlacing");

const raw = zlib.inflateRawSync(Buffer.concat(chunks.filter(c => c.type === "IDAT").map(c => c.data)));
const stride = width * 4;
const pixels = Buffer.alloc(height * (stride + 1));

// The filters have to go before red and blue can swap places; every row is left as filter 0
for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1, filter = raw[row - 1];
    for (let x = 0; x < stride; x++) {
        const left = x >= 4 ? pixels[row + x - 4] : 0;
        const up = y ? pixels[row + x - stride - 1] : 0;
        const corner = y && x >= 4 ? pixels[row + x - stride - 5] : 0;
        const estimate = left + up - corner;
        const toLeft = Math.abs(estimate - left), toUp = Math.abs(estimate - up), toCorner = Math.abs(estimate - corner);
        const paeth = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
        pixels[row + x] = raw[row + x] + [0, left, up, (left + up) >> 1, paeth][filter];
    }
}
for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 4) {
        // Its colors are premultiplied, which only opaque pixels don't care about
        if (pixels[row + x + 3] !== 255) throw new Error("not opaque");
        const blue = pixels[row + x];
        pixels[row + x] = pixels[row + x + 2];
        pixels[row + x + 2] = blue;
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = data => {
    let c = 0xffffffff;
    for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4), sum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
};

fs.writeFileSync(output, Buffer.concat([
    b.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
]));
