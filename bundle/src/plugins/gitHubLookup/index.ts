/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, json, number, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.github-lookup",
    name: "GitHubLookup",
    description: tx("Look up a GitHub user or repository with /github"),
    icon: "PaperIcon",
    tags: ["Utility"],
    start: only({
        name: "github",
        description: tx("A GitHub user, or a repository as owner/name"),
        options: [{ name: "name", description: tx("A username, or owner/repository"), required: true }],
        run: async ({ name }, ctx) => {
            const id = String(name).trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
            const data = await json(`https://api.github.com/${id.includes("/") ? "repos" : "users"}/${id}`).catch(() => undefined);
            if (!data) return answer(ctx, t("Nothing called {name} was found on GitHub.", { name: id }));
            answer(ctx, id.includes("/")
                ? [`**${data.full_name}**${data.language ? ` · ${data.language}` : ""}`, data.description, `⭐ ${number(data.stargazers_count)} · 🍴 ${number(data.forks_count)} · ${t("{count} open issues", { count: number(data.open_issues_count) })}`, data.html_url].filter(Boolean).join("\n")
                : [`**${data.name ?? data.login}** (${data.login})`, data.bio, t("{repos} public repositories · {followers} followers", { repos: data.public_repos, followers: number(data.followers) }), data.html_url].filter(Boolean).join("\n"));
        },
    }),
});
