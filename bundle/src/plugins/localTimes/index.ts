/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's LocalTimes: a time with a time zone in a message, like "8pm EST" or "14:00 UTC", is shown in your own
 * time zone under it. PC adds a line with a clock icon under the message; Discord's chat on the phone is drawn
 * natively from the message's text, so here the same line is added to the end of the message's text, after a 🕒.
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { onMessageRow, textNode } from "../hooks";
import { timeOf } from "../shared/rows";
import { findTimes, type FoundTime } from "./times";

/** Times found per message, so a message drawn again isn't searched again; only so many are kept */
const found = new Map<string, { content: string; sentAt: number; times: FoundTime[]; }>();
const MAX_CACHED = 500;

function timesOf(message: any, content: string): FoundTime[] {
    const sentAt = timeOf(message);
    const cached = found.get(message.id);
    if (cached && cached.content === content && cached.sentAt === sentAt) return cached.times;
    const times = findTimes(content, sentAt);
    if (found.size >= MAX_CACHED) found.clear();
    found.set(message.id, { content, sentAt, times });
    return times;
}

const formats = new Map<string, Intl.DateTimeFormat>();

/** In Discord's language, as PC writes them */
function formatter(withDay: boolean) {
    const locale: string | undefined = getStore("LocaleStore")?.locale || undefined;
    const key = `${locale}|${withDay}`;
    let format = formats.get(key);
    if (!format) {
        const options: Intl.DateTimeFormatOptions = withDay ? { weekday: "short", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" };
        try {
            format = new Intl.DateTimeFormat(locale, options);
        } catch {
            // A language this phone's clock doesn't know
            format = new Intl.DateTimeFormat(undefined, options);
        }
        formats.set(key, format);
    }
    return format;
}

export default definePlugin({
    id: "endcord.local-times",
    name: "LocalTimes",
    description: tx("When a message has a time with a time zone in it, like \"8pm EST\" or \"14:00 UTC\", shows that time in your own time zone under it."),
    icon: "ClockIcon",
    tags: ["Chat", "Utility"],
    start({ cleanup }) {
        cleanup(
            () => found.clear(),
            onMessageRow("local-times", (row, message) => {
                const { content } = message;
                if (typeof content !== "string" || !Array.isArray(row.content) || !/\d/.test(content)) return;
                const times = timesOf(message, content);
                if (!times.length) return;
                const sentDay = new Date(timeOf(message)).toDateString();
                const line = times.map(time => t("{time} is {local} for you", {
                    time: time.text,
                    local: formatter(new Date(time.at).toDateString() !== sentDay).format(time.at),
                })).join("  ·  ");
                row.content = [...row.content, textNode(`\n🕒 ${line}`)];
            }),
        );
    },
});
