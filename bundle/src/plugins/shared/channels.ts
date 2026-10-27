/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins for getting around chats and reading them: notes, jumps, who's waiting for an answer, tables and badges.
 *
 * What more than one of the ChannelNotes, Ghosted, AntiSnitch, MarkdownTables and UserVoiceShow plugins uses.
 */

import { displayName, getChannel, getUser } from "../hooks";

export const preview = (text: string, length = 80) => {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

export const ids = (text: string) => new Set(text.split(/[\s,]+/).filter(Boolean));

export const channelName = (id: string) => {
    const channel = getChannel(id);
    if (!channel) return id;
    if (channel.guild_id) return `#${channel.name}`;
    return channel.name || displayName(getUser(channel.recipients?.[0]));
};

const width = (s: string) => [...s].length;

/** GitHub-style tables to aligned monospace text, which Discord's mobile chat can show */
export function renderTables(content: string): string {
    const lines = content.split("\n");
    const out: string[] = [];
    let i = 0;
    let inCode = false;
    while (i < lines.length) {
        if (lines[i].trim().startsWith("```")) inCode = !inCode;
        const isTable = !inCode && /^\s*\|.*\|\s*$/.test(lines[i]) && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] ?? "");
        if (!isTable) {
            out.push(lines[i++]);
            continue;
        }
        const rows: string[][] = [];
        const align = lines[i + 1].split("|").slice(1, -1).map(c => c.trim().endsWith(":") ? (c.trim().startsWith(":") ? "center" : "right") : "left");
        rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++].split("|").slice(1, -1).map(c => c.trim()));
        const columns = Math.max(...rows.map(r => r.length));
        const widths = Array.from({ length: columns }, (_, c) => Math.max(...rows.map(r => width(r[c] ?? ""))));
        const pad = (cell: string, c: number) => {
            const space = widths[c] - width(cell);
            if (align[c] === "right") return " ".repeat(space) + cell;
            if (align[c] === "center") return " ".repeat(Math.floor(space / 2)) + cell + " ".repeat(Math.ceil(space / 2));
            return cell + " ".repeat(space);
        };
        const line = (r: string[]) => widths.map((_, c) => pad(r[c] ?? "", c)).join(" │ ");
        out.push("```", line(rows[0]), widths.map(w => "─".repeat(w)).join("─┼─"), ...rows.slice(1).map(line), "```");
    }
    return out.join("\n");
}
