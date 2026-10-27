/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { command } from "../hooks";

const ENGINES: Record<string, string> = {
    Google: "https://www.google.com/search?q=",
    Bing: "https://www.bing.com/search?q=",
    Yahoo: "https://search.yahoo.com/search?p=",
    DuckDuckGo: "https://duckduckgo.com/?q=",
    Baidu: "https://www.baidu.com/s?wd=",
    Yandex: "https://yandex.com/search/?text=",
    Ecosia: "https://www.ecosia.org/search?q=",
    Ask: "https://www.ask.com/web?q=",
    AOL: "https://search.aol.com/aol/search?q=",
    LetMeGoogleThatForYou: "https://letmegooglethat.com/?q=",
};

export default definePlugin({
    id: "endcord.google-that",
    name: "GoogleThat",
    description: tx("Send a web search link for anything with /googlethat"),
    authors: [ENDCORD_AUTHOR],
    icon: "MagnifyingGlassIcon",
    tags: ["Utility"],
    settings: {
        defaultEngine: {
            type: "select",
            label: tx("The search engine to use"),
            default: "Google",
            options: Object.keys(ENGINES).map(name => ({ label: name, value: name })),
        },
        hyperlink: {
            type: "boolean",
            label: tx("Hyperlink"),
            description: tx("If the sent link should hyperlink with the query as the label"),
            default: false,
        },
        embed: {
            type: "boolean",
            label: tx("Embed"),
            description: tx("If the sent link should render an embed"),
            default: true,
        },
        customEngineURL: {
            type: "string",
            label: tx("Custom search engine"),
            description: tx("The URL of the Engine you wish to use"),
            placeholder: "https://example.com/search?q=",
            default: "",
        },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "googlethat",
            description: tx("Send a search link"),
            options: [{ name: "input", description: tx("What to search for"), required: true }],
            run: ({ input }) => {
                const base = store.customEngineURL.trim() || ENGINES[store.defaultEngine] || ENGINES.Google;
                const url = base + encodeURIComponent(input);
                if (store.hyperlink) return store.embed ? `[${input}](${url})` : `[${input}](<${url}>)`;
                return store.embed ? url : `<${url}>`;
            },
        }));
    },
});
