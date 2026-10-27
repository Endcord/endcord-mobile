/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.minecraft-status",
    name: "MinecraftStatus",
    description: tx("See whether a Minecraft server is online and how many are playing with /mcstatus"),
    icon: "ServerIcon",
    tags: ["Fun", "Utility"],
    start: only({
        name: "mcstatus",
        description: tx("A Minecraft server's status"),
        options: [{ name: "address", description: tx("The server's address"), required: true }],
        run: async ({ address }, ctx) => {
            const host = String(address).trim();
            const s = await json(`https://api.mcsrvstat.us/3/${enc(host)}`);
            if (!s?.online) return answer(ctx, t("{server} is offline.", { server: host }));
            answer(ctx, [
                `🟢 **${host}** · ${s.version ?? ""}`,
                t("{online} of {max} players online", { online: s.players?.online ?? 0, max: s.players?.max ?? "?" }),
                (s.motd?.clean ?? []).join("\n"),
            ].filter(Boolean).join("\n"));
        },
    }),
});
