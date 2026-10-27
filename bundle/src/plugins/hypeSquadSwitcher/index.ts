/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { api, botMessage, command, describeError } from "../hooks";

const HOUSES = [tx("Remove Badge"), tx("House Bravery"), tx("House Brilliance"), tx("House Balance")];

async function applyHouse(house: number) {
    if (house === 0) await api("del", "/hypesquad/online");
    else await api("post", "/hypesquad/online", { house_id: house });
}

export default definePlugin({
    id: "endcord.hypesquad-switcher",
    name: "HypeSquadSwitcher",
    description: tx("Easily switch between HypeSquad houses or remove your badge"),
    icon: "MedalIcon",
    tags: ["Customisation"],
    start({ cleanup }) {
        cleanup(command({
            name: "hypesquad",
            description: tx("Apply or remove your HypeSquad badge"),
            options: [{
                name: "house",
                description: tx("The house to join, or none to remove the badge"),
                type: "integer",
                required: true,
                choices: HOUSES.map((label, value) => ({ name: t(label), value })),
            }],
            run: async ({ house }, ctx) => {
                const id = Number(house);
                try {
                    await applyHouse(id);
                    botMessage(ctx.channel.id, id === 0 ? `✅ ${t("HypeSquad badge removed")}` : `✅ ${t("HypeSquad set to {house}", { house: t(HOUSES[id]) })}`);
                } catch (e: any) {
                    botMessage(ctx.channel.id, `❌ ${t("Request failed: {error}", { error: describeError(e) })}`);
                }
            },
        }));
    },
});
