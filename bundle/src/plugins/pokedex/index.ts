/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.pokedex",
    name: "Pokedex",
    description: tx("Look up a Pokémon's types and stats with /pokemon"),
    icon: "GameControllerIcon",
    tags: ["Fun"],
    start: only({
        name: "pokemon",
        description: tx("A Pokémon's types and stats"),
        options: [{ name: "name", description: tx("Its name or number"), required: true }],
        run: async ({ name }, ctx) => {
            const p = await json(`https://pokeapi.co/api/v2/pokemon/${enc(String(name).trim().toLowerCase())}`).catch(() => undefined);
            if (!p) return answer(ctx, t("No Pokémon called {name} was found.", { name }));
            const stats = (p.stats ?? []).map((s: any) => `${s.stat.name} ${s.base_stat}`).join(" · ");
            answer(ctx, [
                `**#${p.id} ${p.name[0].toUpperCase()}${p.name.slice(1)}** · ${(p.types ?? []).map((x: any) => x.type.name).join(" / ")}`,
                `${p.height / 10} m · ${p.weight / 10} kg`,
                stats,
                p.sprites?.other?.["official-artwork"]?.front_default ?? p.sprites?.front_default,
            ].filter(Boolean).join("\n"));
        },
    }),
});
