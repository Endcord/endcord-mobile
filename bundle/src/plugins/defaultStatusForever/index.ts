/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's DefaultStatusForever: a new custom status lasts until you clear it, unless you pick a time. Discord for
 * Android works out what "Clear after" starts at in custom_status/computeInitialClearAfter; for a new status (when you
 * have none) that becomes "Don't clear". Editing a status you have keeps Discord's choice, which follows when that one
 * runs out. "Don't clear" also moves to the top of the list, as on PC.
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { moduleAt } from "../common";

/** Whether you have a custom status now: text or an emoji */
export function hasCustomStatus(status: any): boolean {
    return !!(status && (status.text || status.emojiName || status.emojiId && status.emojiId !== "0"));
}

/** The list with one value moved first; the same list when it isn't in it */
export function withFirst<T>(list: readonly T[], value: T): T[] {
    const at = list.indexOf(value);
    return at <= 0 ? [...list] : [value, ...list.slice(0, at), ...list.slice(at + 1)];
}

/** The list with a value back after the item it came after in `original` (first when it was first) */
export function putBack<T>(list: readonly T[], value: T, original: readonly T[]): T[] {
    if (!list.includes(value)) return [...list];
    const rest = list.filter(v => v !== value);
    const at = original.indexOf(value);
    if (at === 0) return [value, ...rest];
    const after = at > 0 ? rest.indexOf(original[at - 1]) : -1;
    return after === -1 ? [...rest, value] : [...rest.slice(0, after + 1), value, ...rest.slice(after + 1)];
}

/** Puts an array's items in a new order, in place, since Discord's code holds the array itself */
function reorder<T>(list: T[], items: T[]) {
    list.splice(0, list.length, ...items);
}

const discordOrders = new WeakMap<unknown[], unknown[]>();

/**
 * The "Clear after" choices in Discord's own order, as they were before this plugin or CustomStatusTimeouts changed
 * them, whichever started first: what the last of them to stop puts back
 */
export function discordOrder(options: unknown[]): unknown[] {
    let order = discordOrders.get(options);
    if (!order) discordOrders.set(options, order = [...options]);
    return order;
}

let keepForeverFirst: (() => void) | undefined;

/** "Don't clear" first again while this plugin runs, for when CustomStatusTimeouts has put the list back */
export const arrangeForeverFirst = () => keepForeverFirst?.();

export default definePlugin({
    id: "endcord.default-status-forever",
    name: "DefaultStatusForever",
    description: tx("Make statuses default to last forever"),
    icon: "ClockIcon",
    tags: ["Utility"],
    start({ cleanup, logger }) {
        const constants = moduleAt("modules/custom_status/Constants.tsx");
        const initial = moduleAt("modules/custom_status/utils/computeInitialClearAfter.tsx");
        const forever = constants?.ClearAfterValues?.DONT_CLEAR;
        if (!constants?.ClearAfterValues || !("DONT_CLEAR" in constants.ClearAfterValues) || typeof initial?.default !== "function") {
            throw new Error("Discord's custom status durations weren't found");
        }
        const statusSetting = () => (findByProps("CustomStatusSetting", "StatusSetting") ?? findByProps("CustomStatusSetting"))?.CustomStatusSetting;

        cleanup(instead("default", initial, function (this: any, args, original) {
            const computed = original.apply(this, args);
            // A status you have keeps what Discord works out from when it runs out
            return hasCustomStatus(statusSetting()?.getSetting?.()) ? computed : forever;
        }));

        // The list of choices, when it's the plain values: "Don't clear" first
        const options = constants.ClearAfterOptions;
        if (Array.isArray(options) && options.includes(forever) && !Object.isFrozen(options)) {
            const before = discordOrder(options);
            try {
                const first = () => reorder(options, withFirst(options, forever));
                first();
                keepForeverFirst = first;
                // Back after what it came after in Discord's own order, even when CustomStatusTimeouts added choices
                cleanup(() => {
                    keepForeverFirst = undefined;
                    reorder(options, putBack(options, forever, before));
                });
            } catch (e) {
                logger.warn("Couldn't move \"Don't clear\" to the top", e);
            }
        } else logger.warn("Discord's list of durations isn't the plain values; \"Don't clear\" stays where it is");
    },
});
