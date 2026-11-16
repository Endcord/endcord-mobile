/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * RemixRevived's drawing, without React: strokes and shapes in the image's own pixels, as SVG.
 */

export type Tool = "brush" | "line" | "arrow" | "rectangle" | "ellipse";

export interface Point {
    x: number;
    y: number;
}

export interface Mark {
    tool: Tool;
    color: string;
    /** In the image's pixels */
    width: number;
    fill: boolean;
    points: Point[];
}

/** The longest side of the picture sent, which keeps it well under Discord's upload limit */
export const MAX_OUTPUT_SIDE = 1600;
/** Points of one brush stroke kept; a long scribble past this keeps its start */
export const MAX_POINTS = 4000;

export const COLORS = ["#f23f43", "#f0b232", "#23a55a", "#5865f2", "#eb459e", "#ffffff", "#000000"];
/** Stroke widths, as a share of the picture's longer side */
export const SIZES = { thin: 0.006, medium: 0.015, thick: 0.035 };

/** The picture's size in the view: as big as fits in `maxWidth` × `maxHeight`, keeping its shape */
export function fit(width: number, height: number, maxWidth: number, maxHeight: number) {
    if (!(width > 0 && height > 0 && maxWidth > 0 && maxHeight > 0)) return { width: 0, height: 0 };
    const scale = Math.min(maxWidth / width, maxHeight / height);
    return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

/** The size the picture is sent at: its own, with the longer side at most MAX_OUTPUT_SIDE */
export function outputSize(width: number, height: number) {
    const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height, 1));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** A brush stroke as an SVG path */
export function strokePath(points: readonly Point[]): string {
    if (!points.length) return "";
    const [first, ...rest] = points;
    // A tap draws a dot
    if (!rest.length) return `M${round(first.x)} ${round(first.y)}l0.1 0`;
    return `M${round(first.x)} ${round(first.y)}${rest.map(p => `L${round(p.x)} ${round(p.y)}`).join("")}`;
}

/** An arrow from the first point to the last, its head as big as the line is wide */
export function arrowPath(from: Point, to: Point, width: number): string {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const head = Math.max(width * 3, 12);
    const left = { x: to.x - head * Math.cos(angle - Math.PI / 6), y: to.y - head * Math.sin(angle - Math.PI / 6) };
    const right = { x: to.x - head * Math.cos(angle + Math.PI / 6), y: to.y - head * Math.sin(angle + Math.PI / 6) };
    return `M${round(from.x)} ${round(from.y)}L${round(to.x)} ${round(to.y)}M${round(left.x)} ${round(left.y)}L${round(to.x)} ${round(to.y)}L${round(right.x)} ${round(right.y)}`;
}

/** The box two corners make */
export function box(a: Point, b: Point) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Adds a point to a stroke unless it's barely moved, or the stroke is full */
export function addPoint(points: readonly Point[], point: Point, minDistance: number): Point[] {
    const last = points[points.length - 1];
    if (points.length >= MAX_POINTS) return [...points];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < minDistance) return [...points];
    return [...points, point];
}

/** Whether bytes start like a PNG file */
export const isPng = (bytes: Uint8Array) => bytes.length > 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((b, i) => bytes[i] === b);

/** How many bytes base64 stands for */
export function base64Length(base64: string): number {
    const clean = base64.replace(/\s+/g, "");
    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}
