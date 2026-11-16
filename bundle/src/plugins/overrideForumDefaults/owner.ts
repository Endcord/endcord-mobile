/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** The object on a prototype chain that has a method itself, so a patch there reaches every record that inherits it */
export function ownerOf(prototype: any, method: string): any {
    for (let at = prototype, depth = 0; at && at !== Object.prototype && depth < 10; at = Object.getPrototypeOf(at), depth++) {
        if (Object.prototype.hasOwnProperty.call(at, method) && typeof at[method] === "function") return at;
    }
    return undefined;
}

/**
 * The number a select setting stands for: Discord's own constant when it has one, otherwise the number PC uses (the
 * setting's value); a value that isn't one of the choices gives the fallback
 */
export function pickedValue(setting: unknown, constants: Record<string, unknown>, fallback: number): number {
    const key = typeof setting === "string" ? setting : String(setting);
    if (!Object.prototype.hasOwnProperty.call(constants, key)) return fallback;
    const constant = constants[key];
    if (typeof constant === "number" && Number.isInteger(constant)) return constant;
    const number = Number(key);
    return Number.isInteger(number) ? number : fallback;
}
