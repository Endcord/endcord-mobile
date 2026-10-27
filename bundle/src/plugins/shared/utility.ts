/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Slash commands that look things up or make things: words, weather, money, games, code packages, Discord's status...
 * Each is a plugin of its own, so only the ones you use are registered. Nothing is sent to chat unless the command is
 * meant to post (jokes, facts, images); lookups answer with a message only you see.
 *
 * What more than one of these plugins uses.
 */

import { safeFetch } from "@lib/utils";

import { hex, sha256, utf8 } from "../crypto";
import { botMessage, command, type CommandArgs } from "../hooks";

type Run = (args: CommandArgs, ctx: any) => unknown;

/** A plugin's start for a plugin that is just one command */
export const only = (def: { name: string; description: string; options?: Parameters<typeof command>[0]["options"]; run: Run; }) =>
    ({ cleanup }: { cleanup: (...fns: Array<() => unknown>) => void; }) => cleanup(command(def));

export const json = (url: string, init?: RequestInit) => safeFetch(url, init).then(r => r.json());

export const enc = encodeURIComponent;

export const clip = (text: string, max = 600) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

export const number = (n: number) => n.toLocaleString();

/** Answers with a message only you see */
export const answer = (ctx: any, text: string) => void botMessage(ctx.channel.id, text);

export interface Country {
    code: string;
    name: string;
    native?: string;
    capital?: string;
    emoji?: string;
    currency?: string;
    languages?: { name: string; }[];
    continent?: { name: string; };
}

/** The country with that name, local name or code; or else the first whose name starts with, then contains it */
export function findCountry(list: Country[], query: string): Country | undefined {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return undefined;
    const names = (c: Country) => [c.name, c.native ?? ""].map(n => n.toLocaleLowerCase());
    return list.find(c => c.code.toLowerCase() === q || names(c).includes(q))
        ?? list.find(c => names(c).some(n => n.startsWith(q)))
        ?? list.find(c => names(c).some(n => n.includes(q)));
}

/** Random bytes; the secure source when the app has one */
export function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    const cryptoApi = (globalThis as any).crypto;
    if (typeof cryptoApi?.getRandomValues === "function") return cryptoApi.getRandomValues(bytes);
    // Otherwise mixed through SHA-256 with the time, so it isn't Math.random alone
    let pool = sha256(utf8(`${Date.now()}:${Math.random()}:${performance.now?.() ?? 0}`));
    for (let i = 0; i < length; i++) {
        if (i % 32 === 0 && i) pool = sha256(utf8(`${hex(pool)}:${Math.random()}`));
        bytes[i] = pool[i % 32] ^ Math.floor(Math.random() * 256);
    }
    return bytes;
}
