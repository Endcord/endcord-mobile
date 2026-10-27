/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, json, number, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.npm-lookup",
    name: "NpmLookup",
    description: tx("Look up an npm package's version, licence and downloads with /npm"),
    icon: "PaperIcon",
    tags: ["Utility"],
    start: only({
        name: "npm",
        description: tx("Information about an npm package"),
        options: [{ name: "package", description: tx("The package's name"), required: true }],
        run: async ({ package: name }, ctx) => {
            const id = String(name).trim();
            const [info, downloads] = await Promise.all([
                json(`https://registry.npmjs.org/${id.replace("/", "%2F")}/latest`).catch(() => undefined),
                json(`https://api.npmjs.org/downloads/point/last-week/${id}`).catch(() => undefined),
            ]);
            if (!info?.name) return answer(ctx, t("No package called {name} was found.", { name: id }));
            answer(ctx, [
                `**${info.name}** v${info.version}${info.license ? ` · ${info.license}` : ""}`,
                info.description,
                downloads?.downloads != null ? t("{count} downloads last week", { count: number(downloads.downloads) }) : undefined,
                `https://www.npmjs.com/package/${info.name}`,
            ].filter(Boolean).join("\n"));
        },
    }),
});
