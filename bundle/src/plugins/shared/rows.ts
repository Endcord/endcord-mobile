/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plugins that add to how messages are drawn. Discord's chat is native, so these change the row Discord builds for
 * it: the text after the time, the name, colors and the content's text nodes.
 *
 * What more than one of these plugins uses.
 */

import { nativeColor, snowflakeTime } from "../hooks";

/** Puts text before the time, which sits right after the name */
export function prependToTimestamp(row: any, text: string) {
    if (typeof row.timestamp === "string" && text && !row.timestamp.startsWith(text)) row.timestamp = `${text}${row.timestamp}`;
}

export const timeOf = (message: any): number => {
    const ts = message.timestamp;
    if (typeof ts?.valueOf === "function" && typeof ts.valueOf() === "number") return ts.valueOf();
    return Date.parse(ts) || snowflakeTime(message.id);
};

/**
 * A function of a setting's text, worked out again only when the text changes; row decorators run for every message
 * drawn, so they don't parse their settings each time
 */
export function cached<T>(fn: (text: string) => T): (text: string) => T {
    let key: string | undefined;
    let value: T;
    return text => {
        if (text !== key) {
            key = text;
            value = fn(text);
        }
        return value;
    };
}

/** "userId = value" lines, as a map */
export function lines(text: string) {
    const map = new Map<string, string>();
    for (const line of text.split("\n")) {
        const index = line.indexOf("=");
        if (index > 0) map.set(line.slice(0, index).trim(), line.slice(index + 1).trim());
    }
    return map;
}

export function setNameColor(row: any, color: string) {
    const native = nativeColor(color);
    if (native === undefined) return;
    // Discord has named this differently between versions
    if ("usernameColor" in row || !("colorString" in row)) row.usernameColor = native;
    if ("colorString" in row) row.colorString = color;
    if ("roleColor" in row) row.roleColor = native;
}
