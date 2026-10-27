/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { answer, clip, json, only } from "../shared/utility";

const ANIME_STATUS: Record<string, string> = {
    FINISHED: tx("Finished"),
    RELEASING: tx("Airing"),
    NOT_YET_RELEASED: tx("Not yet aired"),
    CANCELLED: tx("Cancelled"),
    HIATUS: tx("On hiatus"),
};

export default definePlugin({
    id: "endcord.anime-lookup",
    name: "AnimeLookup",
    description: tx("Look up an anime's score, episodes and status with /anime"),
    icon: "VideoIcon",
    tags: ["Fun"],
    start: only({
        name: "anime",
        description: tx("Information about an anime"),
        options: [{ name: "title", description: tx("The anime's title"), required: true }],
        run: async ({ title }, ctx) => {
            // AniList: free, no key, and up when MyAnimeList's unofficial API isn't
            const data = await json("https://graphql.anilist.co", {
                method: "POST",
                headers: { "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({
                    query: "query ($q: String) { Media(search: $q, type: ANIME, isAdult: false) { title { romaji english } averageScore episodes status seasonYear genres description(asHtml: false) siteUrl } }",
                    variables: { q: String(title).trim() },
                }),
            }).catch(() => undefined);
            const a = data?.data?.Media;
            if (!a) return answer(ctx, t("No anime called {title} was found.", { title }));
            const name = a.title?.english || a.title?.romaji;
            const synopsis = String(a.description ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
            answer(ctx, [
                `**${name}**${a.title?.romaji && a.title.romaji !== name ? ` (${a.title.romaji})` : ""}`,
                [
                    typeof a.averageScore === "number" ? `⭐ ${(a.averageScore / 10).toFixed(1)}` : undefined,
                    t("{count} episodes", { count: a.episodes ?? "?" }),
                    ANIME_STATUS[a.status] ? t(ANIME_STATUS[a.status]) : a.status,
                    a.seasonYear,
                ].filter(Boolean).join(" · "),
                (a.genres ?? []).join(", "),
                synopsis ? clip(synopsis, 400) : undefined,
                a.siteUrl,
            ].filter(Boolean).join("\n"));
        },
    }),
});
