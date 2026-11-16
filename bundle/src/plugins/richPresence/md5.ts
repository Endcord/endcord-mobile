/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MD5, which the Subsonic API Navidrome speaks asks for: the password is never sent, only md5(password + salt), as
 * Endcord PC does it. Hermes has no crypto module.
 */

import { utf8 } from "../crypto";

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5Hex(text: string): string {
    const data = utf8(text);
    // The message, a 1 bit, zeros, and its length in bits (little-endian), to a multiple of 64 bytes
    const length = ((data.length + 8 >> 6) + 1) * 64;
    const bytes = new Uint8Array(length);
    bytes.set(data);
    bytes[data.length] = 0x80;
    const bits = data.length * 8;
    for (let i = 0; i < 8; i++) bytes[length - 8 + i] = Math.floor(bits / 2 ** (8 * i)) & 0xff;

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const m = new Uint32Array(16);
    for (let chunk = 0; chunk < length; chunk += 64) {
        for (let i = 0; i < 16; i++) {
            const at = chunk + i * 4;
            m[i] = (bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16 | bytes[at + 3] << 24) >>> 0;
        }
        let a = a0, b = b0, c = c0, d = d0;
        for (let i = 0; i < 64; i++) {
            let f: number, g: number;
            if (i < 16) {
                f = b & c | ~b & d;
                g = i;
            } else if (i < 32) {
                f = d & b | ~d & c;
                g = (5 * i + 1) % 16;
            } else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) % 16;
            } else {
                f = c ^ (b | ~d);
                g = 7 * i % 16;
            }
            const sum = (a + f + K[i] + m[g]) >>> 0;
            a = d;
            d = c;
            c = b;
            b = (b + (sum << S[i] | sum >>> 32 - S[i])) >>> 0;
        }
        a0 = (a0 + a) >>> 0;
        b0 = (b0 + b) >>> 0;
        c0 = (c0 + c) >>> 0;
        d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map(word => [0, 8, 16, 24].map(shift => (word >>> shift & 0xff).toString(16).padStart(2, "0")).join("")).join("");
}
