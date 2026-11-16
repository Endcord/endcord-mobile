/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Animalese's sound, made as Endcord PC makes it: one short sound per letter, each sped up and raised in pitch, placed
 * one after another. PC mixes them with the browser's audio; a phone has none, so here the letters' WAV files are read,
 * mixed and written out as a WAV again, in plain code.
 */

/** The sample rate of what's played: plenty for these voices, and half the size of the letters' own */
export const OUTPUT_RATE = 22050;

/** Letters other alphabets write with a mark, read as the letter they're made from */
const PLAIN: Readonly<Record<string, string>> = {
    "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "á": "a", "à": "a", "â": "a", "ä": "a", "é": "e", "è": "e",
    "ê": "e", "ë": "e", "í": "i", "î": "i", "ï": "i", "ó": "o", "ô": "o", "ú": "u", "û": "u", "ñ": "n",
};

/**
 * Which letter sound each part of a text gets, as PC picks them: 1-26 for a-z, 27 for "sh", 28 for "th", 30 for a
 * comma or question mark, nothing for a letter said just before or anything else
 */
export function letterSounds(text: string): number[] {
    const lower = [...text.toLowerCase()].map(c => PLAIN[c] ?? c);
    const sounds: number[] = [];
    for (let i = 0; i < lower.length; i++) {
        const c = lower[i];
        if (c === "s" && lower[i + 1] === "h") {
            sounds.push(27);
            i++;
        } else if (c === "t" && lower[i + 1] === "h") {
            sounds.push(28);
            i++;
        } else if (c === "h" && (lower[i - 1] === "s" || lower[i - 1] === "t")) {
            continue;
        } else if (c === "," || c === "?") {
            sounds.push(30);
        } else if (c === lower[i - 1]) {
            continue;
        } else if (c >= "a" && c <= "z") {
            sounds.push(c.charCodeAt(0) - 96);
        }
    }
    return sounds;
}

export interface Sound {
    rate: number;
    /** One channel, from -1 to 1 */
    samples: Float32Array;
}

/** The longest letter sound read: the real ones are a quarter of a second */
const MAX_SAMPLES = 10 * 48000;

/**
 * A WAV file's sound, downmixed to one channel: PCM of 8, 16, 24 or 32 bits, or 32-bit float, with whatever chunks
 * come between. A file that isn't one throws; the files come from the internet, so every length is checked
 */
export function parseWav(bytes: Uint8Array): Sound {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (at: number) => at + 4 <= bytes.length ? String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]) : "";
    if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
    let format = 0, channels = 0, rate = 0, bits = 0;
    let data: { at: number; size: number; } | undefined;
    for (let at = 12; at + 8 <= bytes.length;) {
        const id = tag(at);
        const size = view.getUint32(at + 4, true);
        const body = at + 8;
        if (id === "fmt " && size >= 16 && body + 16 <= bytes.length) {
            format = view.getUint16(body, true);
            channels = view.getUint16(body + 2, true);
            rate = view.getUint32(body + 4, true);
            bits = view.getUint16(body + 14, true);
            // WAVE_FORMAT_EXTENSIBLE names its real format further on
            if (format === 0xFFFE && size >= 26 && body + 26 <= bytes.length) format = view.getUint16(body + 24, true);
        } else if (id === "data") {
            data = { at: body, size: Math.min(size, bytes.length - body) };
            break;
        }
        at = body + size + (size & 1);
    }
    if (!data || !channels || channels > 8 || rate < 1000 || rate > 192000) throw new Error("Not a WAV file this can read");
    const width = bits / 8;
    const float = format === 3 && bits === 32;
    if (!float && (format !== 1 || ![1, 2, 3, 4].includes(width))) throw new Error("Not a WAV file this can read");
    const frame = width * channels;
    const count = Math.min(Math.floor(data.size / frame), MAX_SAMPLES);
    const samples = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
            const at = data.at + i * frame + c * width;
            if (float) sum += view.getFloat32(at, true);
            else if (width === 1) sum += (bytes[at] - 128) / 128;
            else if (width === 2) sum += view.getInt16(at, true) / 32768;
            else if (width === 3) sum += ((bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16) << 8 >> 8) / 8388608;
            else sum += view.getInt32(at, true) / 2147483648;
        }
        samples[i] = Math.max(-1, Math.min(1, sum / channels));
    }
    return { rate, samples };
}

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1;

export interface MixOptions {
    /** PC's speed: how quickly the letters follow each other */
    speed: number;
    /** PC's pitch multiplier */
    pitch: number;
    /** Whether the text asks something: its last letters rise */
    question: boolean;
    /** From 0 to 1, for the small variation in each letter's pitch */
    random?: () => number;
}

/**
 * The letters, one after another, as PC places them: each sped up 2.8 times the pitch (and a little more or less), a
 * fixed slot apart, later letters written over earlier ones where they meet. Then the whole is played back at the pitch,
 * as PC's player does
 */
export function mix(sounds: ReadonlyArray<Sound | undefined>, { speed, pitch, question, random = Math.random }: MixOptions): Float32Array {
    // The settings' choices, and nothing a backup could make zero, negative or huge
    speed = clamp(speed, 0.25, 4);
    pitch = clamp(pitch, 0.25, 4);
    const slot = Math.floor(OUTPUT_RATE * (0.09 / speed));
    // The longest a letter can come out: sped up 2.8 times the pitch at the least
    const longest = sounds.reduce((most, sound) => sound ? Math.max(most, Math.ceil(sound.samples.length / (2.8 * pitch * sound.rate / OUTPUT_RATE))) : most, 0);
    // PC's tenth of a second a letter, or as long as it takes for the last one to end when they follow slowly
    const length = Math.max(1, Math.floor(OUTPUT_RATE * sounds.length * 0.1), sounds.length ? slot * (sounds.length - 1) + longest : 0);
    const out = new Float32Array(length);
    let offset = 0;
    for (let i = 0; i < sounds.length; i++) {
        const sound = sounds[i];
        if (sound) {
            let shift = 2.8 * pitch + random() * 0.15;
            if (question && i >= sounds.length * 0.8) shift += (i - sounds.length * 0.8) / (sounds.length * 0.2) * 0.1 + 0.1;
            // How far into the letter each output sample is, in its own samples
            const step = shift * sound.rate / OUTPUT_RATE;
            const outLength = Math.floor(sound.samples.length / step);
            for (let j = 0; j < outLength && offset + j < length; j++) {
                const from = Math.floor(j * step);
                if (from < sound.samples.length) out[offset + j] = sound.samples[from];
            }
        }
        offset += slot;
    }
    // PC plays the whole at the pitch as its speed: the same as taking every pitch-th sample
    if (pitch === 1) return out;
    const played = new Float32Array(Math.max(1, Math.floor(length / pitch)));
    for (let k = 0; k < played.length; k++) played[k] = out[Math.min(length - 1, Math.floor(k * pitch))];
    return played;
}

/** A WAV file of 16-bit mono PCM */
export function encodeWav(samples: Float32Array, rate = OUTPUT_RATE): Uint8Array {
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (at: number, s: string) => {
        for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return bytes;
}
