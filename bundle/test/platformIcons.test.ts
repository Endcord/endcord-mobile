// PlatformIndicators' icons: PC's shapes, colored per status, written as a PNG by Endcord's own encoder (Hermes has no
// zlib). Node's zlib is the reference: what it reads back must be exactly what was written
import { inflateSync } from "zlib";
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";

const { crc32, encodePng, fromBase64, iconsImage, STATUS_COLORS, toBase64, zlib } = await import(SRC + "plugins/platformIndicators/icons.ts");
const { MASK_HEIGHT, MASKS } = await import(SRC + "plugins/platformIndicators/masks.ts");

let seed = 7;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/** A PNG's chunks, each checked against its CRC */
function chunks(png: Uint8Array) {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const out: Array<{ type: string; data: Uint8Array; }> = [];
    for (let at = 8; at < png.length;) {
        const length = view.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
        const data = png.subarray(at + 8, at + 8 + length);
        expect(view.getUint32(at + 8 + length)).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
        out.push({ type, data });
        at += 12 + length;
    }
    return out;
}

describe("the encoder", () => {
    test("CRC-32 is the standard one", () => {
        expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xCBF43926);
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    test("deflate reads back as written: runs, noise, every length a repeat can have", () => {
        const cases: Uint8Array[] = [new Uint8Array(0), new Uint8Array([7]), new Uint8Array(70000)];
        for (let n = 0; n < 300; n++) {
            const data = new Uint8Array(1 + Math.floor(rand() * 3000));
            for (let i = 0; i < data.length;) {
                const value = Math.floor(rand() * 256);
                const run = rand() < 0.5 ? 1 : 1 + Math.floor(rand() * 600);
                data.fill(value, i, i + run);
                i += run;
            }
            cases.push(data);
        }
        for (let length = 1; length <= 300; length++) cases.push(new Uint8Array(length).fill(200));
        for (const data of cases) expect(Buffer.compare(inflateSync(zlib(data)), Buffer.from(data))).toBe(0);
    });

    test("base64 both ways, as the platform's own", () => {
        for (let n = 0; n < 50; n++) {
            const bytes = new Uint8Array(Math.floor(rand() * 100)).map(() => Math.floor(rand() * 256));
            expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
            expect([...fromBase64(Buffer.from(bytes).toString("base64"))]).toEqual([...bytes]);
        }
    });

    test("a palette PNG with see-through pixels", () => {
        const png = encodePng(3, 2, new Uint8Array([0, 1, 2, 2, 1, 0]), new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0]), new Uint8Array([0, 255, 128]));
        const parts = chunks(png);
        expect(parts.map(p => p.type)).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
        expect([...parts[0].data]).toEqual([0, 0, 0, 3, 0, 0, 0, 2, 8, 3, 0, 0, 0]);
        expect([...inflateSync(parts[3].data)]).toEqual([0, 0, 1, 2, 0, 2, 1, 0]);
    });
});

describe("the icons", () => {
    test("every platform PC has, each as tall as the others", () => {
        expect(Object.keys(MASKS).sort()).toEqual(["desktop", "embedded", "mobile", "vr", "web"]);
        for (const mask of Object.values<{ width: number; data: string; }>(MASKS)) {
            expect(fromBase64(mask.data).length).toBe(Math.ceil(mask.width * MASK_HEIGHT / 2));
        }
    });

    test("a row of icons in their statuses' colors, small enough for a chat row", () => {
        const image = iconsImage([{ platform: "desktop", status: "online" }, { platform: "mobile", status: "idle" }, { platform: "web", status: "dnd" }])!;
        const uri = image.uri;
        expect(uri.startsWith("data:image/png;base64,")).toBe(true);
        expect(uri.length).toBeLessThan(4000);
        const parts = chunks(new Uint8Array(Buffer.from(uri.slice(22), "base64")));
        const header = new DataView(parts[0].data.buffer, parts[0].data.byteOffset);
        const width = header.getUint32(0), height = header.getUint32(4);
        expect(height).toBe(MASK_HEIGHT);
        expect([image.width, image.height]).toEqual([width, height]);
        expect(width).toBe(MASKS.desktop.width + MASKS.mobile.width + MASKS.web.width + 2 * 5);
        // Three colors at fifteen levels, after the see-through one
        expect(parts[1].data.length).toBe(3 * (1 + 3 * 15));
        const hex = (i: number) => `#${[...parts[1].data.subarray(i * 3, i * 3 + 3)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
        expect([hex(15), hex(30), hex(45)]).toEqual([STATUS_COLORS.online, STATUS_COLORS.idle, STATUS_COLORS.dnd]);
        const raw = inflateSync(parts[3].data);
        expect(raw.length).toBe((width + 1) * height);
        // Every icon draws something, in its own color only
        const used = (from: number, to: number) => {
            const seen = new Set<number>();
            for (let y = 0; y < height; y++) for (let x = from; x < to; x++) seen.add(raw[y * (width + 1) + 1 + x]);
            seen.delete(0);
            return seen;
        };
        const d = MASKS.desktop.width, m = MASKS.mobile.width;
        expect([...used(0, d)].every(i => i >= 1 && i <= 15)).toBe(true);
        expect([...used(d + 5, d + 5 + m)].every(i => i >= 16 && i <= 30)).toBe(true);
        expect([...used(d + 10 + m, width)].every(i => i >= 31 && i <= 45)).toBe(true);
        expect(used(0, d).size).toBeGreaterThan(5);
    });

    test("nothing to show is no image; an unknown status is drawn as offline", () => {
        expect(iconsImage([])).toBeNull();
        expect(iconsImage([{ platform: "toaster" as any, status: "online" }])).toBeNull();
        const parts = chunks(new Uint8Array(Buffer.from(iconsImage([{ platform: "vr", status: "weird" }])!.uri.slice(22), "base64")));
        expect(`#${[...parts[1].data.subarray(45, 48)].map(v => v.toString(16).padStart(2, "0")).join("")}`).toBe(STATUS_COLORS.offline);
    });
});
