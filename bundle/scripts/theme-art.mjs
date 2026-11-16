// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Draws the chat wallpaper of the built-in Endcord theme: the sleeping panda from the logo with its sparks and the pixel
 * ENDCORD letters, faint, over a dot grid, all on a transparent ground so the theme's own background shows through in
 * dark and light. Pixel art from Endcord PC (src/components/EndcordIcons.tsx and settings/SpecialCard.tsx there).
 *
 *   node scripts/theme-art.mjs
 *
 * Writes src/lib/addons/themes/builtin/endcord-wallpaper.png, a PNG with a palette of a few colors, so it stays small
 * in the bundle.
 */
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { deflateSync } from "zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/lib/addons/themes/builtin/endcord-wallpaper.png");

const WIDTH = 480, HEIGHT = 800;

const SLEEPING_PANDA = [
    "..kkk.......kkk..",
    ".kKKKk.....kKKKk.",
    ".KKKKKWWWWWKKKKK.",
    "..KKKWWWWWWWKKK..",
    "..WWWWWWWWWWWWW..",
    ".WWWWWWWWWWWWWWw.",
    ".WWKKKWWWWWKKKWw.",
    "WWKKKKKWWWKKKKKWw",
    "WWKEEEKWWWKEEEKWw",
    "WWWKKKWWWWWKKKWWw",
    "WWPPWWWKKKWWWPPWw",
    "WWPPWWWWKWWWWPPWw",
    ".WWWWWWKWKWWWWWw.",
    "..WWWWWWWWWWWWw..",
    "...wWWWWWWWWWw...",
    ".....wwwwwww.....",
];
const SPARKS = [
    "............#.................",
    "...c.......###.........c......",
    "............#.....cc..........",
    ".......................#......",
    "dddddddd..ccccc...dd..###..ddd",
    ".......................#......",
    "..dddd.......c.....ddddd......",
    "........c........c..........c.",
];
const LETTERS = {
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
    D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
    O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
};
const letterRows = LETTERS.E.map((_, y) => [..."ENDCORD"].map(letter => LETTERS[letter][y]).join(".") + ".");
// Ice letters, each with a cobalt pixel to its lower right, like the letters in the logo
const WORDMARK = [...letterRows, ".".repeat(letterRows[0].length)].map((row, y, all) =>
    [...row].map((cell, x) => cell === "#" ? "#" : all[y - 1]?.[x - 1] === "#" ? "s" : ".").join(""));

// [r, g, b, alpha]: faint, so text over it reads as well as without it
const COLORS = {
    clear: [0, 0, 0, 0],
    o: [0x9c, 0xcb, 0xff, 14],
    K: [0x23, 0x2c, 0x40, 40],
    k: [0x4a, 0x5a, 0x80, 40],
    W: [0xf3, 0xf6, 0xfb, 30],
    w: [0xc9, 0xd3, 0xe4, 26],
    E: [0xff, 0xff, 0xff, 34],
    P: [0xf4, 0xa6, 0xb8, 34],
    "#": [0x9c, 0xcb, 0xff, 30],
    s: [0x3d, 0x74, 0xe0, 30],
    c: [0x3d, 0x74, 0xe0, 26],
    d: [0x33, 0x45, 0x6a, 34],
};
const keys = Object.keys(COLORS);
const index = Object.fromEntries(keys.map((key, i) => [key, i]));

const pixels = new Uint8Array(WIDTH * HEIGHT); // palette indices, all clear

function draw(rows, size, left, top) {
    rows.forEach((row, y) => [...row].forEach((cell, x) => {
        if (cell === ".") return;
        for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
            const px = left + x * size + dx, py = top + y * size + dy;
            if (px >= 0 && py >= 0 && px < WIDTH && py < HEIGHT) pixels[py * WIDTH + px] = index[cell];
        }
    }));
}

// The dot grid, every 24 pixels
for (let y = 12; y < HEIGHT; y += 24) for (let x = 12; x < WIDTH; x += 24) draw(["o"], 2, x, y);

const PANDA = 12, SPARK = 5, LETTER = 5;
const pandaWidth = 17 * PANDA, pandaHeight = SLEEPING_PANDA.length * PANDA;
const sparksWidth = SPARKS[0].length * SPARK, sparksHeight = SPARKS.length * SPARK;
const wordWidth = WORDMARK[0].length * LETTER, wordHeight = WORDMARK.length * LETTER;
const total = sparksHeight + 24 + pandaHeight + 36 + wordHeight;
// In the middle, which is what a phone held upright or sideways keeps when it crops the picture to fill the chat
let top = Math.round((HEIGHT - total) / 2);
// Clear the grid under the art, so the dots don't show through the panda
const clearTop = top - 12, clearBottom = top + total + 12;
const clearLeft = Math.round((WIDTH - Math.max(pandaWidth, sparksWidth, wordWidth)) / 2) - 12;
for (let y = clearTop; y < clearBottom; y++) for (let x = clearLeft; x < WIDTH - clearLeft; x++) pixels[y * WIDTH + x] = 0;
draw(SPARKS, SPARK, Math.round((WIDTH - sparksWidth) / 2), top);
top += sparksHeight + 24;
draw(SLEEPING_PANDA, PANDA, Math.round((WIDTH - pandaWidth) / 2), top);
top += pandaHeight + 36;
draw(WORDMARK, LETTER, Math.round((WIDTH - wordWidth) / 2), top);

// ---- PNG, 8-bit palette with transparency ----
const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = bytes => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 3; // indexed color
const palette = Buffer.from(keys.flatMap(key => COLORS[key].slice(0, 3)));
const alpha = Buffer.from(keys.map(key => COLORS[key][3]));
const raw = Buffer.alloc((WIDTH + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
    raw[y * (WIDTH + 1)] = 0; // no filter
    raw.set(pixels.subarray(y * WIDTH, (y + 1) * WIDTH), y * (WIDTH + 1) + 1);
}
const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("tRNS", alpha),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(out, png);
console.log(`${path.relative(root, out)}: ${WIDTH}x${HEIGHT}, ${png.length} bytes`);
