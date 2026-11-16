/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's GifProviderSwitcher. PC rewrites the GIF picker's action creators; on the phone the same requests are
 * answered where they leave the app: Discord's GIF picker asks its API for /gifs/search, /gifs/trending-gifs,
 * /gifs/trending and /gifs/suggest, and this plugin answers those from Tenor or Giphy in the shape Discord's API uses,
 * so Discord's own picker, store and sending work unchanged. Klipy (Discord's own provider) can be mixed in, like on
 * PC. When Tenor and Giphy can't be reached, Discord's own request goes through, so the picker never stops working.
 * Not ported: PC's provider badge on each result and the /tenor slash command, which are desktop UI.
 */

import { tx } from "@core/i18n";
import { after, instead } from "@lib/api/patcher";
import safeFetch, { readJson } from "@lib/utils/safeFetch";

import { definePlugin, onSettingChange } from "../api";
import { getStore, moduleAt } from "../common";
import { HTTP } from "../hooks";
import {
    buildUrl, combineResults, DiscordGif, gifEndpoint,
    GIPHY_API, GIPHY_KEY, giphyCategories, giphyLang, giphyResults, giphySuggestions, hasList, parseProviders, perProvider, primaryProvider, Provider, replaceProviderName, requestQuery, Settled, splitId, tagged,
    TENOR_API, TENOR_KEY, tenorCategories, tenorLocale, tenorResults, tenorSuggestions, totalLimit, TrendingCategories,
} from "./providers";

const TIMEOUT = 15_000;
/** A page of results with every format Tenor has is about 150 KB */
const MAX_JSON = 2 * 1024 * 1024;

/** What Discord's HTTP client resolves with */
const reply = (body: unknown) => ({ ok: true, status: 200, headers: {}, body });

type Query = Record<string, string>;

const settle = <T>(promise: Promise<T>): Promise<Settled<T>> => promise.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));

export default definePlugin({
    id: "endcord.gif-provider-switcher",
    name: "GifProviderSwitcher",
    description: tx("Allows you to use Tenor or Giphy GIF search instead of Klipy"),
    icon: "GifIcon",
    tags: ["Media", "Chat", "Emotes"],
    settings: {
        provider: {
            type: "select",
            label: tx("Providers"),
            description: tx("Where the GIF picker's search, trending GIFs, categories and suggestions come from. Klipy is Discord's own."),
            default: "tenor",
            options: [
                { label: "Tenor", value: "tenor" },
                { label: "Giphy", value: "giphy" },
                { label: "Tenor + Giphy", value: "tenor,giphy" },
                { label: "Tenor + Klipy", value: "tenor,klipy" },
                { label: "Giphy + Klipy", value: "giphy,klipy" },
                { label: "Tenor + Giphy + Klipy", value: "tenor,giphy,klipy" },
            ],
        },
    },
    start({ store, cleanup }) {
        const http = HTTP();
        // Discord calls both the module's functions and its HTTP object's
        const clients = [http, http?.HTTP].filter((c, i, all) => c && typeof c.get === "function" && typeof c.post === "function" && all.indexOf(c) === i);
        if (!clients.length) throw new Error("Discord's HTTP module wasn't found");

        const controllers = new Set<AbortController>();
        let categoryCache: { provider: Provider; value: TrendingCategories; } | undefined;
        cleanup(
            () => {
                for (const controller of controllers) controller.abort();
                controllers.clear();
                categoryCache = undefined;
            },
            onSettingChange(store, () => void (categoryCache = undefined)),
        );

        const providers = () => parseProviders(store.provider);

        async function getJson(url: string) {
            const controller = new AbortController();
            controllers.add(controller);
            const timer = setTimeout(() => controller.abort(), TIMEOUT);
            try {
                const res = await safeFetch(url, { signal: controller.signal }, TIMEOUT);
                return await readJson(res, MAX_JSON);
            } finally {
                clearTimeout(timer);
                controllers.delete(controller);
            }
        }

        // The language Discord asked its own API for, else the app's
        const locale = (q: Query) => q.locale || getStore("LocaleStore")?.locale || "en-US";
        const tenor = (path: string, params: Query, q: Query) => getJson(buildUrl(TENOR_API + path, { key: TENOR_KEY, locale: tenorLocale(locale(q)), ...params }));
        const giphy = (path: string, params: Query, q: Query) => getJson(buildUrl(GIPHY_API + path, { api_key: GIPHY_KEY, lang: giphyLang(locale(q)), ...params }));

        /** One provider's results: a search, or its trending GIFs when there's no query */
        async function results(provider: Provider, query: string | null, count: number, q: Query, fromDiscord: () => Promise<any>): Promise<DiscordGif[]> {
            const limit = String(count);
            if (provider === "tenor") {
                const json = await tenor(query === null ? "/trending" : "/search", query === null ? { limit } : { q: query, limit }, q);
                // An answer without its results is an error, not a search that found nothing
                if (!hasList("tenor", json)) throw new Error("Tenor's answer has no results");
                return tagged("tenor", tenorResults(json, q.media_format));
            }
            if (provider === "giphy") {
                const json = await giphy(query === null ? "/gifs/trending" : "/gifs/search", query === null ? { limit } : { q: query, limit }, q);
                if (!hasList("giphy", json)) throw new Error("Giphy's answer has no results");
                return tagged("giphy", giphyResults(json, q.media_format));
            }
            // Klipy: Discord's own request, as it was going to be made
            const res = await fromDiscord();
            return tagged("klipy", (Array.isArray(res?.body) ? res.body : []).slice(0, count));
        }

        async function list(query: string | null, q: Query, fromDiscord: () => Promise<any>) {
            const chosen = providers();
            const total = totalLimit(q.limit);
            const count = perProvider(total, chosen.length);
            // Discord's own request, made at most once: Klipy's results, and what's shown when the others all failed
            let own: Promise<any> | undefined;
            const discord = () => own ??= fromDiscord();
            const settled: Array<Settled<DiscordGif[]>> = await Promise.all(chosen.map(p => settle(results(p, query, count, q, discord))));
            const shown = combineResults(chosen, settled, total);
            // Tenor and Giphy all failed (unreachable, timed out, an error answer): Discord's own, as without the plugin
            return shown ? reply(shown) : discord();
        }

        async function suggest(q: Query, fromDiscord: () => Promise<any>) {
            const primary = primaryProvider(providers());
            if (primary === "klipy" || !q.q) return fromDiscord();
            const json = await (primary === "tenor"
                ? tenor("/search_suggestions", { q: q.q, limit: "5" }, q)
                : giphy("/gifs/search/tags", { q: q.q, limit: "5" }, q)).catch(() => null);
            // No answer, or an error answer: Discord's own suggestions
            if (!json || !hasList(primary, json)) return fromDiscord();
            return reply(primary === "tenor" ? tenorSuggestions(json) : giphySuggestions(json));
        }

        async function trending(q: Query, fromDiscord: () => Promise<any>) {
            const primary = primaryProvider(providers());
            if (primary === "klipy") return fromDiscord();
            // Loaded once a session, the first time the picker shows its categories
            if (categoryCache?.provider !== primary) {
                const json = await (primary === "tenor" ? tenor("/categories", { type: "featured" }, q) : giphy("/gifs/categories", {}, q)).catch(() => null);
                const value = json && (primary === "tenor" ? tenorCategories(json) : giphyCategories(json));
                // Discord's own categories rather than none
                if (!value) return fromDiscord();
                categoryCache = { provider: primary, value };
            }
            return reply(categoryCache.value);
        }

        // Discord's own requests this plugin lets through, so one client handing it to the other isn't answered twice
        const passing = new WeakSet<object>();

        for (const client of clients) {
            const originalGet = client.get;
            cleanup(instead("get", client, function (this: any, args, original) {
                const request = args[0];
                const kind = gifEndpoint(typeof request === "string" ? request : request?.url);
                if (!kind || kind === "select" || primaryProvider(providers()) === "klipy") return original.apply(this, args);
                if (request && typeof request === "object" && passing.has(request)) return original.apply(this, args);
                const q = requestQuery(request);
                const fromDiscord = () => {
                    if (request && typeof request === "object") passing.add(request);
                    return original.apply(this, args) as Promise<any>;
                };
                if (kind === "search") return q.q ? list(q.q, q, fromDiscord) : fromDiscord();
                if (kind === "trending-gifs") return list(null, q, fromDiscord);
                if (kind === "suggest") return suggest(q, fromDiscord);
                return trending(q, fromDiscord);
            }));
            if (client.get === originalGet) throw new Error("Discord's HTTP module couldn't be changed");

            // Picking a result: told to the service it came from, as Endcord PC does; Giphy has nothing to tell
            cleanup(instead("post", client, function (this: any, args, original) {
                const request = args[0];
                if (gifEndpoint(typeof request === "string" ? request : request?.url) !== "select") return original.apply(this, args);
                const picked = splitId(request?.body?.id);
                if (!picked) return original.apply(this, args);
                if (picked.provider === "klipy") return original.apply(this, [{ ...request, body: { ...request.body, id: picked.id } }, ...args.slice(1)]);
                if (picked.provider === "tenor") tenor("/registershare", { id: picked.id, q: String(request.body.q ?? "").slice(0, 200) }, {}).catch(() => { });
                return Promise.resolve({ ok: true, status: 204, headers: {}, body: null });
            }));
        }

        // "Search Klipy" in the search box, where Discord builds it from its provider's name
        const gifProvider = moduleAt("modules/gif_picker/GifProvider.tsx");
        if (typeof gifProvider?.getSearchPlaceholder === "function") {
            cleanup(after("getSearchPlaceholder", gifProvider, (_args, placeholder) => {
                const chosen = providers();
                return typeof placeholder === "string" && primaryProvider(chosen) !== "klipy" ? replaceProviderName(placeholder, chosen) : placeholder;
            }));
        }
    },
});
