/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Slash commands that look things up or make things: words, weather, money, games, code packages, Discord's status...
 * Each is a plugin of its own, so only the ones you use are registered. Nothing is sent to chat unless the command is
 * meant to post (jokes, facts, images); lookups answer with a message only you see.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { hex, sha256, utf8 } from "../crypto";
import { botMessage, command, type CommandArgs, copy, insertText, snowflakeTime } from "../hooks";
import { choose } from "../ui/dialogs";

type Run = (args: CommandArgs, ctx: any) => unknown;

/** A plugin's start for a plugin that is just one command */
const only = (def: { name: string; description: string; options?: Parameters<typeof command>[0]["options"]; run: Run; }) =>
    ({ cleanup }: { cleanup: (...fns: Array<() => unknown>) => void; }) => cleanup(command(def));

const json = (url: string, init?: RequestInit) => safeFetch(url, init).then(r => r.json());
const enc = encodeURIComponent;
const clip = (text: string, max = 600) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const number = (n: number) => n.toLocaleString();

/** Answers with a message only you see */
const answer = (ctx: any, text: string) => void botMessage(ctx.channel.id, text);

// Words ----------------------------------------------------------------------------------------------------------------

const Dictionary = definePlugin({
    id: "endcord.dictionary",
    name: "Dictionary",
    description: tx("Look up what an English word means with /define"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility"],
    start: only({
        name: "define",
        description: tx("What an English word means"),
        options: [{ name: "word", description: tx("The word"), required: true }],
        run: async ({ word }, ctx) => {
            const [entry] = await json(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(String(word).trim())}`).catch(() => [undefined]);
            if (!entry) return answer(ctx, t("No definition found for {word}.", { word }));
            const lines = (entry.meanings ?? []).slice(0, 3).flatMap((m: any) => (m.definitions ?? []).slice(0, 2).map((d: any, i: number) =>
                `${i ? "  " : `*${m.partOfSpeech}* `}${d.definition}${d.example ? `\n  > ${d.example}` : ""}`));
            answer(ctx, `**${entry.word}** ${entry.phonetic ?? ""}\n${lines.join("\n")}`);
        },
    }),
});

const UrbanDictionary = definePlugin({
    id: "endcord.urban-dictionary",
    name: "UrbanDictionary",
    description: tx("Look up slang on Urban Dictionary with /urban"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "urban",
        description: tx("What a slang word means, from Urban Dictionary"),
        options: [{ name: "term", description: tx("The word or phrase"), required: true }],
        run: async ({ term }, ctx) => {
            const data = await json(`https://api.urbandictionary.com/v0/define?term=${enc(String(term).trim())}`);
            const top = (data?.list ?? []).sort((a: any, b: any) => b.thumbs_up - a.thumbs_up)[0];
            if (!top) return answer(ctx, t("No definition found for {word}.", { word: term }));
            const strip = (s: string) => s.replace(/\[([^\]]+)\]/g, "$1");
            answer(ctx, `**${top.word}** · 👍 ${number(top.thumbs_up)}\n${clip(strip(top.definition))}${top.example ? `\n> ${clip(strip(top.example), 300).replace(/\n/g, "\n> ")}` : ""}`);
        },
    }),
});

const CharInfo = definePlugin({
    id: "endcord.char-info",
    name: "CharInfo",
    description: tx("See the Unicode code points of every character in a text with /charinfo"),
    authors: [ENDCORD_AUTHOR],
    icon: "TextIcon",
    tags: ["Utility"],
    start: only({
        name: "charinfo",
        description: tx("The Unicode code point of each character"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }, ctx) => answer(ctx, [...String(text)].slice(0, 40).map(c =>
            `\`${c.trim() ? c : " "}\` U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join("\n")),
    }),
});

const LoremIpsum = definePlugin({
    id: "endcord.lorem-ipsum",
    name: "LoremIpsum",
    description: tx("Put placeholder text in the message box with /lorem"),
    authors: [ENDCORD_AUTHOR],
    icon: "TextIcon",
    tags: ["Utility"],
    start: only({
        name: "lorem",
        description: tx("Placeholder text, put in the message box"),
        options: [{ name: "sentences", description: tx("How many sentences (1 to 20)"), type: "integer" }],
        run: ({ sentences }, ctx) => {
            const words = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(" ");
            const count = Math.min(Math.max(Number(sentences) || 3, 1), 20);
            const text = Array.from({ length: count }, (_, i) => {
                const length = 6 + (i * 7 + 3) % 9;
                const sentence = Array.from({ length }, (_, j) => words[(i * 11 + j * 5) % words.length]).join(" ");
                return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
            }).join(" ");
            if (!insertText(ctx.channel.id, text)) copy(text);
        },
    }),
});

const Emojify = definePlugin({
    id: "endcord.emojify",
    name: "Emojify",
    description: tx("Write a message in big letter emojis with /emojify"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Fun", "Chat"],
    start: only({
        name: "emojify",
        description: tx("Send text as letter emojis"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }) => {
            const digits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
            return [...String(text).toLowerCase()].map(c =>
                c >= "a" && c <= "z" ? `:regional_indicator_${c}:` : c >= "0" && c <= "9" ? `:${digits[+c]}:` : c === "?" ? ":grey_question:" : c === "!" ? ":grey_exclamation:" : c === " " ? "   " : c,
            ).join(" ").slice(0, 2000);
        },
    }),
});

// Weather, money, places -----------------------------------------------------------------------------------------------

const Weather = definePlugin({
    id: "endcord.weather",
    name: "Weather",
    description: tx("See the weather anywhere with /weather"),
    authors: [ENDCORD_AUTHOR],
    icon: "CloudIcon",
    tags: ["Utility"],
    settings: {
        units: { type: "select", label: tx("Units"), default: "metric", options: [{ label: tx("Metric (°C, km/h)"), value: "metric" }, { label: tx("Imperial (°F, mph)"), value: "imperial" }] },
    },
    start({ store, cleanup }) {
        cleanup(command({
            name: "weather",
            description: tx("The weather in a place"),
            options: [{ name: "place", description: tx("A city or place"), required: true }],
            run: async ({ place }, ctx) => {
                const data = await json(`https://wttr.in/${enc(String(place).trim())}?format=j1`);
                const now = data?.current_condition?.[0];
                if (!now) return answer(ctx, t("No weather found for {place}.", { place }));
                const area = data.nearest_area?.[0];
                const where = [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(", ") || place;
                const metric = store.units === "metric";
                const today = data.weather?.[0];
                answer(ctx, [
                    `**${where}** · ${now.weatherDesc?.[0]?.value ?? ""}`,
                    `🌡 ${metric ? `${now.temp_C}°C` : `${now.temp_F}°F`} (${t("feels like {temp}", { temp: metric ? `${now.FeelsLikeC}°C` : `${now.FeelsLikeF}°F` })})`,
                    today ? `↕ ${metric ? `${today.mintempC}–${today.maxtempC}°C` : `${today.mintempF}–${today.maxtempF}°F`}` : "",
                    `💧 ${now.humidity}% · 💨 ${metric ? `${now.windspeedKmph} km/h` : `${now.windspeedMiles} mph`}`,
                ].filter(Boolean).join("\n"));
            },
        }));
    },
});

const CurrencyConverter = definePlugin({
    id: "endcord.currency-converter",
    name: "CurrencyConverter",
    description: tx("Convert between currencies at today's rates with /currency"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShopIcon",
    tags: ["Utility"],
    start: only({
        name: "currency",
        description: tx("Convert money to another currency"),
        options: [
            { name: "amount", description: tx("How much"), type: "number", required: true },
            { name: "from", description: tx("Currency code, such as USD"), required: true },
            { name: "to", description: tx("Currency code, such as EUR"), required: true },
        ],
        run: async ({ amount, from, to }, ctx) => {
            const a = String(from).trim().toUpperCase(), b = String(to).trim().toUpperCase();
            const data = await json(`https://open.er-api.com/v6/latest/${enc(a)}`).catch(() => undefined);
            const rate = data?.rates?.[b];
            if (typeof rate !== "number") return answer(ctx, t("Couldn't convert {from} to {to}; check the currency codes.", { from: a, to: b }));
            const result = Number(amount) * rate;
            answer(ctx, `${number(Number(amount))} ${a} = **${result.toLocaleString(undefined, { maximumFractionDigits: result < 1 ? 6 : 2 })} ${b}**\n1 ${a} = ${rate} ${b}`);
        },
    }),
});

const CryptoPrices = definePlugin({
    id: "endcord.crypto-prices",
    name: "CryptoPrices",
    description: tx("See a cryptocurrency's price and its change today with /crypto"),
    authors: [ENDCORD_AUTHOR],
    icon: "ShopIcon",
    tags: ["Utility"],
    start: only({
        name: "crypto",
        description: tx("A cryptocurrency's price"),
        options: [{ name: "coin", description: tx("Its name, such as bitcoin"), required: true }],
        run: async ({ coin }, ctx) => {
            const id = String(coin).trim().toLowerCase().replace(/\s+/g, "-");
            const data = await json(`https://api.coingecko.com/api/v3/simple/price?ids=${enc(id)}&vs_currencies=usd,eur&include_24hr_change=true`);
            const price = data?.[id];
            if (!price) return answer(ctx, t("No coin called {coin} was found.", { coin }));
            const change = price.usd_24h_change;
            answer(ctx, `**${id}** · $${number(price.usd)} · €${number(price.eur)}${typeof change === "number" ? ` · ${change >= 0 ? "📈 +" : "📉 "}${change.toFixed(2)}%` : ""}`);
        },
    }),
});

interface Country {
    code: string;
    name: string;
    native?: string;
    capital?: string;
    emoji?: string;
    currency?: string;
    languages?: { name: string; }[];
    continent?: { name: string; };
}

let countries: Promise<Country[]> | undefined;

/** Every country, from a free API that needs no key; fetched once, and again after a failure */
function countryList(): Promise<Country[]> {
    countries ??= safeFetch("https://countries.trevorblades.com/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ countries { code name native capital emoji currency languages { name } continent { name } } }" }),
    }).then(r => r.json()).then(data => {
        const list = data?.data?.countries;
        if (!Array.isArray(list)) throw new Error("No countries came back");
        return list;
    });
    return countries.catch(e => {
        countries = undefined;
        throw e;
    });
}

/** The country with that name, local name or code; or else the first whose name starts with, then contains it */
export function findCountry(list: Country[], query: string): Country | undefined {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return undefined;
    const names = (c: Country) => [c.name, c.native ?? ""].map(n => n.toLocaleLowerCase());
    return list.find(c => c.code.toLowerCase() === q || names(c).includes(q))
        ?? list.find(c => names(c).some(n => n.startsWith(q)))
        ?? list.find(c => names(c).some(n => n.includes(q)));
}

const CountryInfo = definePlugin({
    id: "endcord.country-info",
    name: "CountryInfo",
    description: tx("Look up a country's capital, population, languages and currency with /country"),
    authors: [ENDCORD_AUTHOR],
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    start: only({
        name: "country",
        description: tx("Facts about a country"),
        options: [{ name: "name", description: tx("The country, or its two-letter code"), required: true }],
        run: async ({ name }, ctx) => {
            const c = findCountry(await countryList(), String(name));
            if (!c) return answer(ctx, t("No country called {name} was found.", { name }));
            // The World Bank's latest count; countries it doesn't track show without one
            const population = await json(`https://api.worldbank.org/v2/country/${enc(c.code)}/indicator/SP.POP.TOTL?format=json&mrnev=1`)
                .then(data => data?.[1]?.[0]).catch(() => undefined);
            answer(ctx, [
                `${c.emoji ?? ""} **${c.name}**${c.native && c.native !== c.name ? ` (${c.native})` : ""}`,
                `${t("Capital")}: ${c.capital || "—"}`,
                `${t("Population")}: ${typeof population?.value === "number" ? `${number(population.value)} (${population.date})` : "—"}`,
                `${t("Region")}: ${c.continent?.name || "—"}`,
                `${t("Languages")}: ${(c.languages ?? []).map(l => l.name).join(", ") || "—"}`,
                `${t("Currency")}: ${c.currency?.split(",").join(", ") || "—"}`,
            ].join("\n"));
        },
    }),
});

const Holidays = definePlugin({
    id: "endcord.holidays",
    name: "Holidays",
    description: tx("See a country's next public holidays with /holidays"),
    authors: [ENDCORD_AUTHOR],
    icon: "CalendarIcon",
    tags: ["Utility"],
    start: only({
        name: "holidays",
        description: tx("The next public holidays in a country"),
        options: [{ name: "country", description: tx("Two-letter country code, such as TR or US"), required: true }],
        run: async ({ country }, ctx) => {
            const code = String(country).trim().toUpperCase();
            const days: any[] = await json(`https://date.nager.at/api/v3/NextPublicHolidays/${enc(code)}`).catch(() => []);
            if (!days.length) return answer(ctx, t("No holidays were found for {country}.", { country: code }));
            answer(ctx, days.slice(0, 8).map(d => `📅 <t:${Math.floor(Date.parse(`${d.date}T12:00:00Z`) / 1000)}:D> · **${d.localName}**${d.localName !== d.name ? ` (${d.name})` : ""}`).join("\n"));
        },
    }),
});

const Earthquakes = definePlugin({
    id: "endcord.earthquakes",
    name: "Earthquakes",
    description: tx("See the latest strong earthquakes around the world, or near a place, with /earthquakes"),
    authors: [ENDCORD_AUTHOR],
    icon: "GlobeEarthIcon",
    tags: ["Utility"],
    start: only({
        name: "earthquakes",
        description: tx("The latest earthquakes"),
        options: [{ name: "place", description: tx("Only ones whose location mentions this, such as Turkey") }],
        run: async ({ place }, ctx) => {
            const data = await json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson");
            const filter = String(place ?? "").trim().toLowerCase();
            const quakes = (data?.features ?? [])
                .filter((f: any) => !filter || String(f.properties?.place ?? "").toLowerCase().includes(filter))
                .slice(0, 10);
            if (!quakes.length) return answer(ctx, t("No earthquakes of magnitude 2.5 or more in the last day."));
            answer(ctx, quakes.map((f: any) => `**M${Number(f.properties.mag).toFixed(1)}** · ${f.properties.place} · <t:${Math.floor(f.properties.time / 1000)}:R>`).join("\n"));
        },
    }),
});

// Code and the web -----------------------------------------------------------------------------------------------------

const NpmLookup = definePlugin({
    id: "endcord.npm-lookup",
    name: "NpmLookup",
    description: tx("Look up an npm package's version, licence and downloads with /npm"),
    authors: [ENDCORD_AUTHOR],
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

const GitHubLookup = definePlugin({
    id: "endcord.github-lookup",
    name: "GitHubLookup",
    description: tx("Look up a GitHub user or repository with /github"),
    authors: [ENDCORD_AUTHOR],
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

const ShortenURL = definePlugin({
    id: "endcord.shorten-url",
    name: "ShortenURL",
    description: tx("Shorten a link with /shorten; the short link goes in the message box"),
    authors: [ENDCORD_AUTHOR],
    icon: "LinkIcon",
    tags: ["Utility"],
    start: only({
        name: "shorten",
        description: tx("Make a link shorter"),
        options: [{ name: "url", description: tx("The link"), required: true }],
        run: async ({ url }, ctx) => {
            const short = (await safeFetch(`https://is.gd/create.php?format=simple&url=${enc(String(url).trim())}`).then(r => r.text())).trim();
            if (!/^https?:\/\//.test(short)) return answer(ctx, short || t("That link couldn't be shortened."));
            if (!insertText(ctx.channel.id, short)) copy(short);
        },
    }),
});

const QRCode = definePlugin({
    id: "endcord.qr-code",
    name: "QRCode",
    description: tx("Send a QR code of any text or link with /qr"),
    authors: [ENDCORD_AUTHOR],
    icon: "QrCodeIcon",
    tags: ["Utility"],
    start: only({
        name: "qr",
        description: tx("Send a QR code"),
        options: [{ name: "text", description: tx("The text or link it holds"), required: true }],
        run: ({ text }) => `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&format=png&data=${enc(String(text))}`,
    }),
});

const DiscordStatus = definePlugin({
    id: "endcord.discord-status",
    name: "DiscordStatus",
    description: tx("Check whether Discord itself is having problems with /discordstatus"),
    authors: [ENDCORD_AUTHOR],
    icon: "ServerIcon",
    tags: ["Utility"],
    start: only({
        name: "discordstatus",
        description: tx("Whether Discord is having problems"),
        run: async (_, ctx) => {
            const data = await json("https://discordstatus.com/api/v2/summary.json");
            const broken = (data?.components ?? []).filter((c: any) => c.status && c.status !== "operational" && !c.group);
            const incidents = (data?.incidents ?? []).slice(0, 3);
            answer(ctx, [
                `**${data?.status?.description ?? "?"}**`,
                ...broken.map((c: any) => `⚠️ ${c.name}: ${c.status.replace(/_/g, " ")}`),
                ...incidents.map((i: any) => `🔧 ${i.name} (${i.status})`),
                "https://discordstatus.com",
            ].join("\n"));
        },
    }),
});

const SnowflakeInfo = definePlugin({
    id: "endcord.snowflake-info",
    name: "SnowflakeInfo",
    description: tx("See when any Discord ID (a user, message, server...) was made with /snowflake"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Utility"],
    start: only({
        name: "snowflake",
        description: tx("When a Discord ID was made"),
        options: [{ name: "id", description: tx("The ID"), required: true }],
        run: ({ id }, ctx) => {
            const value = String(id).trim().match(/\d{15,21}/)?.[0];
            if (!value) return answer(ctx, t("That isn't a Discord ID."));
            const time = Math.floor(snowflakeTime(value) / 1000);
            // The low 22 bits, from the decimal digits, since the ID is too big for a number
            let low = 0;
            for (const digit of value) low = (low * 10 + Number(digit)) % 4194304;
            answer(ctx, [
                `**${value}**`,
                `${t("Made")}: <t:${time}:F> (<t:${time}:R>)`,
                `Worker ${low >> 17 & 31} · Process ${low >> 12 & 31} · Increment ${low & 4095}`,
            ].join("\n"));
        },
    }),
});

const Hash = definePlugin({
    id: "endcord.hash",
    name: "Hash",
    description: tx("Get the SHA-256 hash of a text with /sha256"),
    authors: [ENDCORD_AUTHOR],
    icon: "LockIcon",
    tags: ["Utility"],
    start: only({
        name: "sha256",
        description: tx("The SHA-256 hash of a text"),
        options: [{ name: "text", description: tx("The text"), required: true }],
        run: ({ text }, ctx) => {
            const digest = hex(sha256(utf8(String(text))));
            answer(ctx, `\`${digest}\``);
            copy(digest);
        },
    }),
});

/** Random bytes; the secure source when the app has one */
function randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    const cryptoApi = (globalThis as any).crypto;
    if (typeof cryptoApi?.getRandomValues === "function") return cryptoApi.getRandomValues(bytes);
    // Otherwise mixed through SHA-256 with the time, so it isn't Math.random alone
    let pool = sha256(utf8(`${Date.now()}:${Math.random()}:${performance.now?.() ?? 0}`));
    for (let i = 0; i < length; i++) {
        if (i % 32 === 0 && i) pool = sha256(utf8(`${hex(pool)}:${Math.random()}`));
        bytes[i] = pool[i % 32] ^ Math.floor(Math.random() * 256);
    }
    return bytes;
}

const PasswordGenerator = definePlugin({
    id: "endcord.password-generator",
    name: "PasswordGenerator",
    description: tx("Make a strong random password with /passwordgen; only you see it, and it is copied"),
    authors: [ENDCORD_AUTHOR],
    icon: "LockIcon",
    tags: ["Utility", "Privacy"],
    start: only({
        name: "passwordgen",
        description: tx("Make a random password"),
        options: [
            { name: "length", description: tx("How many characters (8 to 128)"), type: "integer" },
            { name: "symbols", description: tx("Include symbols"), type: "boolean" },
        ],
        run: ({ length, symbols }, ctx) => {
            const size = Math.min(Math.max(Number(length) || 20, 8), 128);
            const chars = `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789${symbols === false ? "" : "!@#$%^&*-_=+?"}`;
            // Rejection sampling, so every character is equally likely
            const out: string[] = [];
            while (out.length < size) {
                for (const b of randomBytes(size * 2)) {
                    if (b < 256 - 256 % chars.length) out.push(chars[b % chars.length]);
                    if (out.length === size) break;
                }
            }
            const password = out.join("");
            answer(ctx, `||\`${password}\`||`);
            copy(password, t("Password copied"));
        },
    }),
});

const UUIDGenerator = definePlugin({
    id: "endcord.uuid-generator",
    name: "UUIDGenerator",
    description: tx("Make a random UUID with /uuid and copy it"),
    authors: [ENDCORD_AUTHOR],
    icon: "IdIcon",
    tags: ["Utility"],
    start: only({
        name: "uuid",
        description: tx("Make a random UUID"),
        run: (_, ctx) => {
            const b = randomBytes(16);
            b[6] = b[6] & 0x0F | 0x40;
            b[8] = b[8] & 0x3F | 0x80;
            const h = hex(b);
            const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
            answer(ctx, `\`${uuid}\``);
            copy(uuid);
        },
    }),
});

const ColorInfo = definePlugin({
    id: "endcord.color-info",
    name: "ColorInfo",
    description: tx("See a color's RGB and HSL values, or get a random one, with /color"),
    authors: [ENDCORD_AUTHOR],
    icon: "PaintPaletteIcon",
    tags: ["Utility"],
    start: only({
        name: "color",
        description: tx("A color's values; leave it out for a random color"),
        options: [{ name: "hex", description: tx("Such as #5865F2") }],
        run: ({ hex: input }, ctx) => {
            let value = String(input ?? "").trim().replace(/^#/, "");
            if (/^[\da-f]{3}$/i.test(value)) value = [...value].map(c => c + c).join("");
            if (!input) value = hex(randomBytes(3));
            if (!/^[\da-f]{6}$/i.test(value)) return answer(ctx, t("That isn't a hex color; try something like #5865F2."));
            const [r, g, b] = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
            const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
            const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
            const hue = !d ? 0 : max === r / 255 ? 60 * ((g - b) / 255 / d % 6) : max === g / 255 ? 60 * ((b - r) / 255 / d + 2) : 60 * ((r - g) / 255 / d + 4);
            answer(ctx, `**#${value.toUpperCase()}**\nRGB ${r}, ${g}, ${b}\nHSL ${Math.round((hue + 360) % 360)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%\nhttps://singlecolorimage.com/get/${value}/96x96`);
        },
    }),
});

const Countdown = definePlugin({
    id: "endcord.countdown",
    name: "Countdown",
    description: tx("See how long is left until a date with /countdown"),
    authors: [ENDCORD_AUTHOR],
    icon: "ClockIcon",
    tags: ["Utility"],
    start: only({
        name: "countdown",
        description: tx("How long until a date"),
        options: [{ name: "date", description: tx("Such as 2027-01-01 or 2027-01-01 18:30"), required: true }],
        run: ({ date }, ctx) => {
            const when = Date.parse(String(date).trim().replace(" ", "T"));
            if (Number.isNaN(when)) return answer(ctx, t("Write the date like 2027-01-01 or 2027-01-01 18:30."));
            let left = Math.abs(when - Date.now()) / 1000;
            const days = Math.floor(left / 86400); left %= 86400;
            const hours = Math.floor(left / 3600); left %= 3600;
            const minutes = Math.floor(left / 60);
            const span = t("{days} days, {hours} hours, {minutes} minutes", { days, hours, minutes });
            answer(ctx, `<t:${Math.floor(when / 1000)}:F>\n${when >= Date.now() ? t("{span} left", { span }) : t("{span} ago", { span })}`);
        },
    }),
});

// Games and fun --------------------------------------------------------------------------------------------------------

const Pokedex = definePlugin({
    id: "endcord.pokedex",
    name: "Pokedex",
    description: tx("Look up a Pokémon's types and stats with /pokemon"),
    authors: [ENDCORD_AUTHOR],
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

const ANIME_STATUS: Record<string, string> = {
    FINISHED: tx("Finished"),
    RELEASING: tx("Airing"),
    NOT_YET_RELEASED: tx("Not yet aired"),
    CANCELLED: tx("Cancelled"),
    HIATUS: tx("On hiatus"),
};

const AnimeLookup = definePlugin({
    id: "endcord.anime-lookup",
    name: "AnimeLookup",
    description: tx("Look up an anime's score, episodes and status with /anime"),
    authors: [ENDCORD_AUTHOR],
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

const SteamLookup = definePlugin({
    id: "endcord.steam-lookup",
    name: "SteamLookup",
    description: tx("Look up a game's price on Steam with /steam"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "steam",
        description: tx("A game on the Steam store"),
        options: [{ name: "game", description: tx("The game's name"), required: true }],
        run: async ({ game }, ctx) => {
            const items: any[] = (await json(`https://store.steampowered.com/api/storesearch/?term=${enc(String(game).trim())}&l=english&cc=us`))?.items ?? [];
            if (!items.length) return answer(ctx, t("No game called {game} was found on Steam.", { game }));
            answer(ctx, items.slice(0, 4).map(g => {
                const price = g.price ? `$${(g.price.final / 100).toFixed(2)}${g.price.initial > g.price.final ? ` (-${Math.round(100 - g.price.final / g.price.initial * 100)}%)` : ""}` : t("Free");
                return `**${g.name}** · ${price}${g.metascore ? ` · Metacritic ${g.metascore}` : ""}\nhttps://store.steampowered.com/app/${g.id}`;
            }).join("\n"));
        },
    }),
});

const MinecraftStatus = definePlugin({
    id: "endcord.minecraft-status",
    name: "MinecraftStatus",
    description: tx("See whether a Minecraft server is online and how many are playing with /mcstatus"),
    authors: [ENDCORD_AUTHOR],
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

const MinecraftSkin = definePlugin({
    id: "endcord.minecraft-skin",
    name: "MinecraftSkin",
    description: tx("Send a Minecraft player's skin with /mcskin"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Fun"],
    start: only({
        name: "mcskin",
        description: tx("Send a Minecraft player's skin"),
        options: [{ name: "player", description: tx("The player's name"), required: true }],
        run: ({ player }) => `https://mc-heads.net/body/${enc(String(player).trim())}/right`,
    }),
});

function decodeEntities(text: string) {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", eacute: "é", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };
    return text.replace(/&(#x?[\da-f]+|\w+);/gi, (m, e: string) =>
        e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : named[e.toLowerCase()] ?? m);
}

const Trivia = definePlugin({
    id: "endcord.trivia",
    name: "Trivia",
    description: tx("Answer a random trivia question with /trivia"),
    authors: [ENDCORD_AUTHOR],
    icon: "CircleQuestionIcon",
    tags: ["Fun"],
    start: only({
        name: "trivia",
        description: tx("A random trivia question to answer"),
        run: async (_, ctx) => {
            const q = (await json("https://opentdb.com/api.php?amount=1&type=multiple"))?.results?.[0];
            if (!q) return answer(ctx, t("No question came back; try again in a few seconds."));
            const right = decodeEntities(q.correct_answer);
            const options = [right, ...q.incorrect_answers.map(decodeEntities)].sort(() => Math.random() - 0.5);
            choose(decodeEntities(q.question), options.map(o => ({ label: o, value: o })), picked => {
                if (picked === right) showToast(t("Correct!"), findAssetId("CheckmarkLargeIcon"));
                else showToast(t("Wrong, it was {answer}", { answer: right }), findAssetId("CircleXIcon-primary"));
            });
        },
    }),
});

const RockPaperScissors = definePlugin({
    id: "endcord.rock-paper-scissors",
    name: "RockPaperScissors",
    description: tx("Play rock, paper, scissors with /rps and send the result"),
    authors: [ENDCORD_AUTHOR],
    icon: "GameControllerIcon",
    tags: ["Fun"],
    start: only({
        name: "rps",
        description: tx("Play rock, paper, scissors"),
        options: [{ name: "choice", description: tx("Your move"), required: true, choices: [{ name: "🪨 rock", value: "0" }, { name: "📄 paper", value: "1" }, { name: "✂️ scissors", value: "2" }] }],
        run: ({ choice }) => {
            const moves = ["🪨", "📄", "✂️"];
            const mine = Number(choice), theirs = randomBytes(1)[0] % 3;
            const result = mine === theirs ? t("It's a tie!") : (mine - theirs + 3) % 3 === 1 ? t("I win!") : t("I lose!");
            return `${moves[mine]} vs ${moves[theirs]} · ${result}`;
        },
    }),
});

const Xkcd = definePlugin({
    id: "endcord.xkcd",
    name: "Xkcd",
    description: tx("Send an xkcd comic, the latest, a random one or a number, with /xkcd"),
    authors: [ENDCORD_AUTHOR],
    icon: "ImageIcon",
    tags: ["Fun"],
    start: only({
        name: "xkcd",
        description: tx("Send an xkcd comic"),
        options: [{ name: "number", description: tx("The comic's number; 0 for a random one"), type: "integer" }],
        run: async ({ number: n }) => {
            const latest = await json("https://xkcd.com/info.0.json");
            const wanted = n === 0 ? 1 + Math.floor(Math.random() * latest.num) : Number(n) || latest.num;
            const comic = wanted === latest.num ? latest : await json(`https://xkcd.com/${wanted}/info.0.json`);
            return `**xkcd #${comic.num}: ${comic.safe_title}**\n${comic.img}`;
        },
    }),
});

const Jokes = definePlugin({
    id: "endcord.jokes",
    name: "Jokes",
    description: tx("Send a random joke with /joke"),
    authors: [ENDCORD_AUTHOR],
    icon: "ReactionIcon",
    tags: ["Fun"],
    start: only({
        name: "joke",
        description: tx("Send a random joke"),
        options: [{ name: "kind", description: tx("What kind"), choices: [{ name: "programming", value: "Programming" }, { name: "pun", value: "Pun" }, { name: "misc", value: "Misc" }, { name: "spooky", value: "Spooky" }] }],
        run: async ({ kind }) => {
            const j = await json(`https://v2.jokeapi.dev/joke/${kind ?? "Programming,Misc,Pun,Spooky"}?safe-mode`);
            return j.type === "twopart" ? `${j.setup}\n||${j.delivery}||` : j.joke;
        },
    }),
});

const Advice = definePlugin({
    id: "endcord.advice",
    name: "Advice",
    description: tx("Send a random piece of advice with /advice"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Fun"],
    start: only({
        name: "advice",
        description: tx("Send a random piece of advice"),
        run: async () => `💡 ${(await json(`https://api.adviceslip.com/advice?t=${Date.now()}`))?.slip?.advice}`,
    }),
});

const RandomFacts = definePlugin({
    id: "endcord.random-facts",
    name: "RandomFacts",
    description: tx("Send a random fact with /fact"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Fun"],
    start: only({
        name: "fact",
        description: tx("Send a random fact"),
        run: async () => `🧠 ${(await json("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en"))?.text}`,
    }),
});

const CatFacts = definePlugin({
    id: "endcord.cat-facts",
    name: "CatFacts",
    description: tx("Send a random fact about cats with /catfact"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Fun"],
    start: only({
        name: "catfact",
        description: tx("Send a fact about cats"),
        run: async () => `🐱 ${(await json("https://catfact.ninja/fact"))?.fact}`,
    }),
});

const Quotes = definePlugin({
    id: "endcord.quotes",
    name: "Quotes",
    description: tx("Send a random famous quote with /quote"),
    authors: [ENDCORD_AUTHOR],
    icon: "ChatIcon",
    tags: ["Fun"],
    start: only({
        name: "quote",
        description: tx("Send a random famous quote"),
        run: async () => {
            const [q] = await json("https://zenquotes.io/api/random");
            return `> ${q.q}\n— ${q.a}`;
        },
    }),
});

const BoredActivity = definePlugin({
    id: "endcord.bored-activity",
    name: "BoredActivity",
    description: tx("Get an idea of something to do with /bored"),
    authors: [ENDCORD_AUTHOR],
    icon: "SparklesIcon",
    tags: ["Fun"],
    start: only({
        name: "bored",
        description: tx("An idea of something to do"),
        run: async (_, ctx) => {
            const a = await json("https://bored-api.appbrewery.com/random");
            answer(ctx, `🎯 **${a.activity}** · ${a.type}${a.participants > 1 ? ` · ${t("{count} people", { count: a.participants })}` : ""}`);
        },
    }),
});

const RecipeFinder = definePlugin({
    id: "endcord.recipe-finder",
    name: "RecipeFinder",
    description: tx("Find a recipe for a dish with /recipe"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "recipe",
        description: tx("A recipe for a dish"),
        options: [{ name: "dish", description: tx("The dish, in English"), required: true }],
        run: async ({ dish }, ctx) => {
            const meal = (await json(`https://www.themealdb.com/api/json/v1/1/search.php?s=${enc(String(dish).trim())}`))?.meals?.[0];
            if (!meal) return answer(ctx, t("No recipe for {dish} was found.", { dish }));
            const ingredients = Array.from({ length: 20 }, (_, i) => [meal[`strMeasure${i + 1}`], meal[`strIngredient${i + 1}`]])
                .filter(([, ingredient]) => ingredient?.trim())
                .map(([measure, ingredient]) => `• ${`${measure ?? ""} ${ingredient}`.trim()}`);
            answer(ctx, [
                `**${meal.strMeal}** · ${[meal.strArea, meal.strCategory].filter(Boolean).join(" · ")}`,
                ingredients.join("\n"),
                clip(String(meal.strInstructions ?? ""), 700),
                meal.strSource || meal.strYoutube,
            ].filter(Boolean).join("\n"));
        },
    }),
});

const SpaceLaunches = definePlugin({
    id: "endcord.space-launches",
    name: "SpaceLaunches",
    description: tx("See the next rocket launches with /launches"),
    authors: [ENDCORD_AUTHOR],
    icon: "FlashIcon",
    tags: ["Fun"],
    start: only({
        name: "launches",
        description: tx("The next rocket launches"),
        run: async (_, ctx) => {
            const launches: any[] = (await json("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=5&mode=list"))?.results ?? [];
            if (!launches.length) return answer(ctx, t("No launches came back; try again later."));
            answer(ctx, launches.map(l => `🚀 **${l.name}** · <t:${Math.floor(Date.parse(l.net) / 1000)}:R>\n   ${l.location ?? l.pad ?? ""} · ${l.status?.abbrev ?? ""}`).join("\n"));
        },
    }),
});

export default [
    Dictionary, UrbanDictionary, CharInfo, LoremIpsum, Emojify, Weather, CurrencyConverter, CryptoPrices, CountryInfo, Holidays, Earthquakes,
    NpmLookup, GitHubLookup, ShortenURL, QRCode, DiscordStatus, SnowflakeInfo, Hash, PasswordGenerator, UUIDGenerator, ColorInfo, Countdown,
    Pokedex, AnimeLookup, SteamLookup, MinecraftStatus, MinecraftSkin, Trivia, RockPaperScissors, Xkcd, Jokes, Advice, RandomFacts, CatFacts,
    Quotes, BoredActivity, RecipeFinder, SpaceLaunches,
];
