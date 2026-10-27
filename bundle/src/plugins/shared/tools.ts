/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Utilities: your own commands, exports and backups, previews, and small conveniences.
 *
 * What more than one of the FakeMessage, ClearMyMessages, ExportDM and PreviewMessage plugins uses.
 */



export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function rawUser(user: any) {
    return {
        id: user.id,
        username: user.username,
        global_name: user.globalName ?? user.global_name ?? null,
        discriminator: user.discriminator ?? "0",
        avatar: user.avatar ?? null,
        bot: !!user.bot,
    };
}
