// @ts-nocheck
/* eslint-disable no-restricted-syntax */
/**
 * Draws PlatformIndicators' icons from Endcord PC's own (src/plugins/platformIndicators/index.tsx there: the same SVG
 * paths, view boxes and sizes) as alpha masks. Discord's chat rows and profile badges show images rather than SVG, so
 * the plugin colors these with each platform's status and puts them together into a PNG as it runs
 * (src/plugins/platformIndicators/icons.ts).
 *
 *   node scripts/platform-icons.mjs
 *
 * Writes src/plugins/platformIndicators/masks.ts. Draws with CanvasKit (Skia), already here for react-native-skia.
 */
import { writeFileSync } from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src/plugins/platformIndicators/masks.ts");
const require = createRequire(import.meta.url);
const CanvasKitInit = require("canvaskit-wasm/bin/canvaskit.js");
const CK = await CanvasKitInit({ locateFile: file => path.join(root, "node_modules/canvaskit-wasm/bin", file) });

/** Pixels per unit of PC's icon sizes (20 there): 48 px, sharp at three times a 16 dp icon */
const SCALE = 2.4;
const HEIGHT = Math.round(20 * SCALE);

// Endcord PC's icons, as its Icon() draws them: a box of width × height (20 × 20 unless given) and a view box fitted
// into it, centered, as an SVG does by default
const ICONS = {
    desktop: { d: "M4 2.5c-1.103 0-2 .897-2 2v11c0 1.104.897 2 2 2h7v2H7v2h10v-2h-4v-2h7c1.103 0 2-.896 2-2v-11c0-1.103-.897-2-2-2H4Zm16 2v9H4v-9h16Z" },
    web: { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93Zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39Z" },
    mobile: { d: "M 187 0 L 813 0 C 916.277 0 1000 83.723 1000 187 L 1000 1313 C 1000 1416.277 916.277 1500 813 1500 L 187 1500 C 83.723 1500 0 1416.277 0 1313 L 0 187 C 0 83.723 83.723 0 187 0 Z M 125 1000 L 875 1000 L 875 250 L 125 250 Z M 500 1125 C 430.964 1125 375 1180.964 375 1250 C 375 1319.036 430.964 1375 500 1375 C 569.036 1375 625 1319.036 625 1250 C 625 1180.964 569.036 1125 500 1125 Z", viewBox: [0, 0, 1000, 1500], width: 17, height: 17 },
    embedded: { d: "M14.8 2.7 9 3.1V47h3.3c1.7 0 6.2.3 10 .7l6.7.6V2l-4.2.2c-2.4.1-6.9.3-10 .5zm1.8 6.4c1 1.7-1.3 3.6-2.7 2.2C12.7 10.1 13.5 8 15 8c.5 0 1.2.5 1.6 1.1zM16 33c0 6-.4 10-1 10s-1-4-1-10 .4-10 1-10 1 4 1 10zm15-8v23.3l3.8-.7c2-.3 4.7-.6 6-.6H43V3h-2.2c-1.3 0-4-.3-6-.6L31 1.7V25z", viewBox: [0, 0, 50, 50] },
    vr: { d: "M8.46 8.64a1 1 0 0 1 1 1c0 .44-.3.8-.72.92l-.11.07c-.08.06-.2.19-.2.41a.99.99 0 0 1-.98.86h-.06a1 1 0 0 1-.94-1.05l.02-.32c.05-1.06.92-1.9 1.99-1.9ZM15.55 5a5.5 5.5 0 0 1 5.15 3.67h.3a2 2 0 0 1 2 2v3.18a2 2 0 0 1-2 1.99h-.2A4.54 4.54 0 0 1 16.55 19a4.45 4.45 0 0 1-3.6-1.83 1.2 1.2 0 0 0-1.9 0 4.44 4.44 0 0 1-3.9 1.82 4.54 4.54 0 0 1-3.94-3.15H3a2 2 0 0 1-2-2v-3.18c0-1.1.9-1.99 2-1.99h.3A5.5 5.5 0 0 1 8.46 5h7.09Zm-7.1 2C6.6 7 5.06 8.5 4.97 10.41l-.02.66v3.18c0 1.43 1.05 2.66 2.34 2.74.85.06 1.63-.32 2.14-1.01a3.2 3.2 0 0 1 2.57-1.3c1 0 1.97.48 2.57 1.3.5.69 1.3 1.08 2.14 1.01 1.3-.08 2.34-1.31 2.34-2.74l-.02-3.84a3.54 3.54 0 0 0-3.49-3.43H8.45Z", viewBox: [0, 4, 24, 16], width: 20, height: 20 },
};

/** The icon's alpha, 0 to 15 per pixel, two pixels to a byte (high nibble first), and its width */
function draw({ d, viewBox = [0, 0, 24, 24], width = 20, height = 20 }) {
    const boxW = Math.round(width * SCALE), boxH = Math.round(height * SCALE);
    const surface = CK.MakeSurface(boxW, HEIGHT);
    if (!surface) throw new Error("CanvasKit couldn't make a surface");
    const canvas = surface.getCanvas();
    canvas.clear(CK.TRANSPARENT);
    const [minX, minY, vbW, vbH] = viewBox;
    const scale = Math.min(boxW / vbW, boxH / vbH);
    canvas.translate((boxW - vbW * scale) / 2, (HEIGHT - boxH) / 2 + (boxH - vbH * scale) / 2);
    canvas.scale(scale, scale);
    canvas.translate(-minX, -minY);
    const shape = CK.Path.MakeFromSVGString(d);
    if (!shape) throw new Error("An icon's path couldn't be read");
    const paint = new CK.Paint();
    paint.setAntiAlias(true);
    paint.setColor(CK.BLACK);
    canvas.drawPath(shape, paint);
    const pixels = canvas.readPixels(0, 0, {
        width: boxW, height: HEIGHT, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB,
    });
    const levels = new Uint8Array(boxW * HEIGHT);
    for (let i = 0; i < levels.length; i++) levels[i] = Math.round(pixels[i * 4 + 3] / 17);
    const packed = new Uint8Array(Math.ceil(levels.length / 2));
    for (let i = 0; i < levels.length; i++) packed[i >> 1] |= i & 1 ? levels[i] : levels[i] << 4;
    shape.delete();
    paint.delete();
    surface.delete();
    return { width: boxW, data: Buffer.from(packed).toString("base64") };
}

const masks = Object.fromEntries(Object.entries(ICONS).map(([platform, icon]) => [platform, draw(icon)]));
const lines = [
    "// Made by scripts/platform-icons.mjs from Endcord PC's PlatformIndicators icons (GPL-3.0-or-later, like this file):",
    "// each one's alpha, 0 to 15 a pixel, two pixels to a byte, high nibble first, rows top to bottom. Don't edit by hand.",
    "",
    `export const MASK_HEIGHT = ${HEIGHT};`,
    "",
    "export const MASKS: Readonly<Record<string, { width: number; data: string; }>> = {",
    ...Object.entries(masks).map(([platform, { width, data }]) => `    ${platform}: { width: ${width}, data: "${data}" },`),
    "};",
    "",
];
writeFileSync(out, lines.join("\n"));
console.log(`Wrote ${path.relative(root, out)}: ${Object.entries(masks).map(([p, m]) => `${p} ${m.width}×${HEIGHT}`).join(", ")}`);
