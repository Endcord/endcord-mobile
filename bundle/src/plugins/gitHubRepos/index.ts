/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addMessageAction, displayName, openUrl } from "../hooks";
import { accountsOf, failed, profileOf } from "../shared/people";
import { choose } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.github-repos",
    name: "GitHubRepos",
    description: tx("See the public GitHub repositories of a message's author from the message menu"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaperIcon",
    tags: ["Friends"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "github-repos",
            icon: "PaperIcon",
            label: () => t("GitHub Repositories"),
            visible: message => !!message.author?.id && !message.author.bot,
            onPress: async message => {
                try {
                    const github = accountsOf(await profileOf(message.author.id)).find(a => a.type === "github");
                    if (!github) {
                        showToast(t("{user} hasn't connected GitHub", { user: displayName(message.author) }), findAssetId("CircleInformationIcon-primary"));
                        return;
                    }
                    const repos: any[] = await safeFetch(`https://api.github.com/users/${encodeURIComponent(github.name)}/repos?sort=updated&per_page=30`).then(r => r.json());
                    choose(`${github.name} · GitHub`, (Array.isArray(repos) ? repos : []).filter(r => !r.fork).map(r => ({
                        label: r.name,
                        subLabel: `★ ${r.stargazers_count}${r.language ? ` · ${r.language}` : ""}${r.description ? ` · ${r.description}` : ""}`.slice(0, 120),
                        value: r.html_url as string,
                    })), openUrl);
                } catch (e) {
                    failed(e);
                }
            },
        }));
    },
});
