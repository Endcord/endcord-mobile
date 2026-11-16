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

/**
 * Tables come from other people's messages, read as they arrive and every time a channel loads: a line longer than any
 * table row is no row, and a table that would grow past this when its columns are padded stays as it was written
 */
const MAX_TABLE_LINE = 500;
const MAX_TABLE_TEXT = 6000;

/** A table's row, "| a | b |": checked without a regex that backtracks, on a line of any length */
function isRow(line: string): boolean {
    if (line.length > MAX_TABLE_LINE) return false;
    const trimmed = line.trim();
    return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
}

/** The line under a table's header, "|---|:--:|": each cell two dashes or more, with a colon at either end for alignment */
function isSeparator(line: string | undefined): boolean {
    if (line === undefined || line.length > MAX_TABLE_LINE) return false;
    let cells = line.trim();
    if (cells.startsWith("|")) cells = cells.slice(1);
    if (cells.endsWith("|")) cells = cells.slice(0, -1);
    return cells.split("|").every(cell => /^:?-{2,}:?$/.test(cell.trim()));
}

/** GitHub-style tables to aligned monospace text, which Discord's mobile chat can show */
export function renderTables(content: string): string {
    const lines = content.split("\n");
    const out: string[] = [];
    let i = 0;
    let inCode = false;
    while (i < lines.length) {
        if (lines[i].trim().startsWith("```")) inCode = !inCode;
        if (inCode || !isRow(lines[i]) || !isSeparator(lines[i + 1])) {
            out.push(lines[i++]);
            continue;
        }
        const start = i;
        const rows: string[][] = [];
        const align = lines[i + 1].split("|").slice(1, -1).map(c => c.trim().endsWith(":") ? (c.trim().startsWith(":") ? "center" : "right") : "left");
        rows.push(lines[i].split("|").slice(1, -1).map(c => c.trim()));
        i += 2;
        while (i < lines.length && isRow(lines[i])) rows.push(lines[i++].split("|").slice(1, -1).map(c => c.trim()));
        const columns = Math.max(...rows.map(r => r.length));
        const widths = Array.from({ length: columns }, (_, c) => Math.max(...rows.map(r => width(r[c] ?? ""))));
        // Each line is every column at its widest: worked out before any of it is written
        const lineLength = widths.reduce((sum, w) => sum + w, 0) + 3 * Math.max(0, columns - 1);
        if (lineLength * (rows.length + 1) > MAX_TABLE_TEXT) {
            out.push(...lines.slice(start, i));
            continue;
        }
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
