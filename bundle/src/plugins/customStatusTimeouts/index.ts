/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's CustomStatusTimeouts: more choices of how long a status lasts. Discord for Android has its durations
 * for the custom status' "Clear after" in custom_status' Constants (the list), getClearAfterDuration (how long each
 * lasts) and formatClearAfterOption / formatClearAfterValue (their names); the presets from the settings join them
 * there. Before adding anything the plugin checks that Discord's durations work the way this expects, and turns
 * itself off saying so when they don't. PC's fixed week and month presets aren't added: they were picked for PC's
 * status menu, and longer ones can be added as days.
 */

import { t, tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";

import { definePlugin, onSettingChange } from "../api";
import { moduleAt } from "../common";
import { arrangeForeverFirst, discordOrder } from "../defaultStatusForever";

const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** Marks the values this plugin adds, which carry their length in milliseconds */
const PREFIX = "endcord-timeout-";
/** The longest preset: a year */
const MAX_LENGTH = 366 * DAY;

/** "5, 10, 30" into the numbers in it, positive, whole, each once, at most 20 */
export function parseList(text: string): number[] {
    const numbers = String(text ?? "").slice(0, 500).split(",").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
    return [...new Set(numbers)].slice(0, 20);
}

export interface Preset {
    value: string;
    duration: number;
}

/** The presets for the settings, shortest first */
export function presets(settings: { extraSeconds: string; extraMinutes: string; extraHours: string; extraDays: string; }): Preset[] {
    const all = [
        ...parseList(settings.extraSeconds).map(n => n * SECOND),
        ...parseList(settings.extraMinutes).map(n => n * MINUTE),
        ...parseList(settings.extraHours).map(n => n * HOUR),
        ...parseList(settings.extraDays).map(n => n * DAY),
    ].filter(ms => ms <= MAX_LENGTH);
    return [...new Set(all)].sort((a, b) => a - b).map(duration => ({ value: `${PREFIX}${duration}`, duration }));
}

/** How long one of this plugin's values lasts, or undefined for Discord's own */
export function durationOf(value: unknown): number | undefined {
    if (typeof value !== "string" || !value.startsWith(PREFIX)) return;
    const ms = Number(value.slice(PREFIX.length));
    return Number.isInteger(ms) && ms > 0 && ms <= MAX_LENGTH ? ms : undefined;
}

/** "For 5 Minutes", in the largest unit it's a whole number of */
export function presetLabel(ms: number): string {
    const [count, one, many] = ms % DAY === 0 ? [ms / DAY, "For 1 Day", "For {count} Days"]
        : ms % HOUR === 0 ? [ms / HOUR, "For 1 Hour", "For {count} Hours"]
            : ms % MINUTE === 0 ? [ms / MINUTE, "For 1 Minute", "For {count} Minutes"]
                : [ms / SECOND, "For 1 Second", "For {count} Seconds"];
    return count === 1 ? t(one as string) : t(many as string, { count });
}

// The labels above, for the translations
void [tx("For 1 Day"), tx("For {count} Days"), tx("For 1 Hour"), tx("For {count} Hours"), tx("For 1 Minute"), tx("For {count} Minutes"), tx("For 1 Second"), tx("For {count} Seconds")];

/**
 * Discord's durations and ours in one list, shortest first as on PC, with "Don't clear" first or last. `lengthOf`
 * gives how long each of Discord's lasts; one without a fixed length keeps its place after the one before it. A preset
 * as long as one of Discord's isn't added twice
 */
export function mergeOptions(discord: readonly unknown[], ours: Preset[], lengthOf: (value: unknown) => number | undefined, forever: unknown, foreverOnTop: boolean): unknown[] {
    const merged: Array<{ value: unknown; length: number; }> = [];
    const taken = new Set<number>();
    let last = 0;
    for (const value of discord) {
        if (value === forever) continue;
        const length = lengthOf(value);
        if (length !== undefined) taken.add(length);
        merged.push({ value, length: length ?? last });
        last = length ?? last;
    }
    for (const preset of ours) if (!taken.has(preset.duration)) merged.push({ value: preset.value, length: preset.duration });
    // Stable, so Discord's own keep their order among equals
    const sorted = merged.map((m, i) => ({ ...m, i })).sort((a, b) => a.length - b.length || a.i - b.i).map(m => m.value);
    if (!discord.includes(forever)) return sorted;
    return foreverOnTop ? [forever, ...sorted] : [...sorted, forever];
}

export default definePlugin({
    id: "endcord.custom-status-timeouts",
    name: "CustomStatusTimeouts",
    description: tx("Adds configurable timeout presets to the custom status' \"Clear after\" choices."),
    icon: "TimerIcon",
    tags: ["Utility"],
    settings: {
        showForeverOnTop: { type: "boolean", label: tx("\"Don't clear\" on top"), description: tx("Show the Forever option at the top of the list instead of the bottom."), default: true },
        extraSeconds: { type: "string", label: tx("Seconds"), description: tx("Extra seconds to add, separated by a comma (e.g. 5, 10, 30)"), default: "15, 30, 45" },
        extraMinutes: { type: "string", label: tx("Minutes"), description: tx("Extra minutes to add, separated by a comma (e.g. 5, 10, 30)"), default: "5, 10, 30" },
        extraHours: { type: "string", label: tx("Hours"), description: tx("Extra hours to add, separated by a comma (e.g. 2, 4, 6, 12)"), default: "2, 4, 6, 12" },
        extraDays: { type: "string", label: tx("Days"), description: tx("Extra days to add, separated by a comma (e.g. 1, 2)"), default: "1, 2" },
    },
    start({ store, cleanup }) {
        const constants = moduleAt("modules/custom_status/Constants.tsx");
        const durations = moduleAt("modules/custom_status/utils/getClearAfterDuration.tsx");
        const optionNames = moduleAt("modules/custom_status/utils/formatClearAfterOption.tsx");
        const valueNames = moduleAt("modules/custom_status/utils/formatClearAfterValue.tsx");
        const values = constants?.ClearAfterValues;
        const options: unknown[] | undefined = constants?.ClearAfterOptions;
        if (!values || !Array.isArray(options) || typeof durations?.default !== "function" || typeof optionNames?.default !== "function" || typeof valueNames?.default !== "function") {
            throw new Error("Discord's custom status durations weren't found");
        }

        // Discord's durations must be what this adds to: a list of plain values, an hour lasting an hour, and names
        // that are text. Anything else, and nothing is changed
        const hour = values.HOURS_1;
        const lengthOf = (value: unknown) => {
            try {
                return durations.default(value);
            } catch {
                return undefined;
            }
        };
        let named = false;
        try {
            named = typeof optionNames.default(hour) === "string" && typeof valueNames.default(hour) === "string";
        } catch { }
        if (!options.includes(hour) || !options.every(v => v == null || typeof v === "string" || typeof v === "number") || lengthOf(hour) !== HOUR || !named || Object.isFrozen(options)) {
            throw new Error("Discord's custom status durations work differently in this version");
        }

        // Discord's own order, also when DefaultStatusForever moved "Don't clear" before this started
        const original = discordOrder(options);
        // "Today" lasts until midnight, so however long that is now: it goes just before a day
        const sortLength = (value: unknown) => {
            if (value === values.TODAY) return DAY - 1;
            const length = lengthOf(value);
            return typeof length === "number" && Number.isFinite(length) && length > 0 ? length : undefined;
        };
        const apply = () => options.splice(0, options.length, ...mergeOptions(original, presets(store), sortLength, values.DONT_CLEAR, store.showForeverOnTop) as typeof options);
        apply();

        cleanup(
            // Ours are known by their value; Discord's own go through as they are
            instead("default", durations, function (this: any, args, fn) {
                return durationOf(args[0]) ?? fn.apply(this, args);
            }),
            ...[optionNames, valueNames].map(names => instead("default", names, function (this: any, args, fn) {
                const ms = durationOf(args[0]);
                return ms ? presetLabel(ms) : fn.apply(this, args);
            })),
            () => {
                options.splice(0, options.length, ...original as typeof options);
                // "Don't clear" stays first while DefaultStatusForever runs
                arrangeForeverFirst();
            },
        );

        // Changes show the next time the choices open
        let timer: ReturnType<typeof setTimeout> | undefined;
        cleanup(() => clearTimeout(timer));
        cleanup(onSettingChange(store, () => {
            clearTimeout(timer);
            timer = setTimeout(apply, 500);
        }));
    },
});
