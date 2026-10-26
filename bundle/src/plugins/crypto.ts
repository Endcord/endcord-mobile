/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Small, dependency-free helpers for the plugins that hide or hash text: UTF-8, base64, SHA-256 and a SHA-256 based
 * stream cipher with a check value (so a wrong password is told apart from a right one).
 */

export function utf8(text: string): Uint8Array {
    const out: number[] = [];
    for (const char of text) {
        const c = char.codePointAt(0)!;
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | c >> 6, 0x80 | c & 63);
        else if (c < 0x10000) out.push(0xE0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
        else out.push(0xF0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return Uint8Array.from(out);
}

export function fromUtf8(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const extra = b < 0x80 ? 0 : b >> 5 === 6 ? 1 : b >> 4 === 14 ? 2 : 3;
        let c = extra ? b & 0x3F >> extra : b;
        for (let j = 1; j <= extra; j++) c = c << 6 | bytes[i + j] & 63;
        out += String.fromCodePoint(c);
        i += extra + 1;
    }
    return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const n = bytes[i] << 16 | (bytes[i + 1] ?? 0) << 8 | (bytes[i + 2] ?? 0);
        out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
    }
    return out;
}

export function fromBase64(text: string): Uint8Array {
    const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
    const out: number[] = [];
    let buffer = 0, bits = 0;
    for (const c of clean) {
        buffer = buffer << 6 | B64.indexOf(c);
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push(buffer >> bits & 0xFF);
        }
    }
    return Uint8Array.from(out);
}

const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

export function sha256(data: Uint8Array): Uint8Array {
    const { length } = data;
    const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
    padded.set(data);
    padded[length] = 0x80;
    const bits = length * 8;
    padded[padded.length - 4] = bits >>> 24 & 0xFF;
    padded[padded.length - 3] = bits >>> 16 & 0xFF;
    padded[padded.length - 2] = bits >>> 8 & 0xFF;
    padded[padded.length - 1] = bits & 0xFF;

    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Array<number>(64);
    const rotr = (x: number, n: number) => x >>> n | x << (32 - n);
    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) {
            const j = offset + i * 4;
            w[i] = padded[j] << 24 | padded[j + 1] << 16 | padded[j + 2] << 8 | padded[j + 3];
        }
        for (let i = 16; i < 64; i++) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
            w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
        }
        let [a, b, c, d, e, f, g, hh] = h;
        for (let i = 0; i < 64; i++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const t1 = hh + S1 + (e & f ^ ~e & g) + K[i] + w[i] | 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const t2 = S0 + (a & b ^ a & c ^ b & c) | 0;
            hh = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
        }
        h[0] = h[0] + a | 0; h[1] = h[1] + b | 0; h[2] = h[2] + c | 0; h[3] = h[3] + d | 0;
        h[4] = h[4] + e | 0; h[5] = h[5] + f | 0; h[6] = h[6] + g | 0; h[7] = h[7] + hh | 0;
    }
    const out = new Uint8Array(32);
    h.forEach((v, i) => {
        out[i * 4] = v >>> 24 & 0xFF;
        out[i * 4 + 1] = v >>> 16 & 0xFF;
        out[i * 4 + 2] = v >>> 8 & 0xFF;
        out[i * 4 + 3] = v & 0xFF;
    });
    return out;
}

export const hex = (bytes: Uint8Array) => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");

const concat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) {
        out.set(p, i);
        i += p.length;
    }
    return out;
};

function keystream(key: Uint8Array, salt: Uint8Array, length: number) {
    const out = new Uint8Array(length);
    for (let block = 0; block * 32 < length; block++) {
        const counter = Uint8Array.of(block >>> 24 & 0xFF, block >>> 16 & 0xFF, block >>> 8 & 0xFF, block & 0xFF);
        out.set(sha256(concat(key, salt, counter)).subarray(0, Math.min(32, length - block * 32)), block * 32);
    }
    return out;
}

/** Encrypts text with a password: 8 bytes of salt, 4 of check value, then the text */
export function seal(text: string, password: string): Uint8Array {
    const key = sha256(utf8(password));
    const salt = Uint8Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
    const plain = utf8(text);
    const check = sha256(concat(key, salt, plain)).subarray(0, 4);
    const stream = keystream(key, salt, plain.length);
    return concat(salt, check, plain.map((b, i) => b ^ stream[i]));
}

/** The text, or undefined when the password is wrong or the data isn't sealed */
export function open(data: Uint8Array, password: string): string | undefined {
    if (data.length < 12) return;
    const key = sha256(utf8(password));
    const salt = data.subarray(0, 8), check = data.subarray(8, 12), body = data.subarray(12);
    const stream = keystream(key, salt, body.length);
    const plain = body.map((b, i) => b ^ stream[i]);
    const expected = sha256(concat(key, salt, plain)).subarray(0, 4);
    if (expected.some((b, i) => b !== check[i])) return;
    return fromUtf8(plain);
}
