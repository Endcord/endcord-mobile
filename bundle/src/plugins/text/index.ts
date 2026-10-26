/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's text commands: each one turns what you type into something else and sends it.
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { botMessage, command, displayName, getUser } from "../hooks";

const message = (description = tx("Your message")) => ({ name: "message", description, required: true });

/** Maps every code point, so emoji and other characters outside the BMP stay whole */
const mapChars = (text: string, fn: (c: string) => string) => [...text].map(fn).join("");

export function toBold(text: string) {
    return mapChars(text, c => {
        const code = c.codePointAt(0)!;
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
        return c;
    });
}

const BoldText = definePlugin({
    id: "endcord.bold-text",
    name: "BoldText",
    description: tx("/bold turns your message into 𝐮𝐧𝐢𝐜𝐨𝐝𝐞 bold (works where markdown can't)."),
    authors: [ENDCORD_AUTHOR],
    icon: "LettersIcon",
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "bold",
            description: tx("Make your text unicode-bold"),
            options: [message()],
            run: ({ message }) => toBold(message),
        }));
    },
});

const ClapText = definePlugin({
    id: "endcord.clap-text",
    name: "ClapText",
    description: tx("Adds /clap to 👏 put 👏 claps 👏 between 👏 your 👏 words."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "clap",
            description: tx("Put 👏 claps 👏 between 👏 words"),
            options: [message()],
            run: ({ message }) => message.trim().split(/\s+/).join(" 👏 "),
        }));
    },
});

const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", b: "8", g: "9", l: "1" };

const LeetText = definePlugin({
    id: "endcord.leet-text",
    name: "LeetText",
    description: tx("/leet rewrites your message in 1337 5p34k."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "leet",
            description: tx("Convert to leetspeak"),
            options: [message()],
            run: ({ message }) => mapChars(message, c => LEET[c.toLowerCase()] ?? c),
        }));
    },
});

const ReverseText = definePlugin({
    id: "endcord.reverse-text",
    name: "ReverseText",
    description: tx("/reverse flips your message backwards."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "reverse",
            description: tx("Reverse your text"),
            options: [message()],
            run: ({ message }) => [...message].reverse().join(""),
        }));
    },
});

const SpaceOut = definePlugin({
    id: "endcord.space-out",
    name: "SpaceOut",
    description: tx("/spaceout p u t s   s p a c e s   between every letter."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "spaceout",
            description: tx("Space out every letter"),
            options: [message()],
            run: ({ message }) => [...message].join(" "),
        }));
    },
});

const Starify = definePlugin({
    id: "endcord.starify",
    name: "Starify",
    description: tx("Adds /starify to wrap your message in sparkles ｡ﾟ☆."),
    authors: [ENDCORD_AUTHOR],
    icon: "StarIcon",
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "starify",
            description: tx("Decorate your message with sparkles"),
            options: [message()],
            run: ({ message }) => `✦ﾟ｡⋆ ${message} ⋆｡ﾟ✦`,
        }));
    },
});

const VIBES = [
    "✦ the vibes are immaculate ✦",
    "🌴 endless summer, endless mall 🌴",
    "📼 rewinding to a time that never was 📼",
    "🛍️ welcome to the mall, population: you 🛍️",
    "🌅 chasing a sunset that never sets 🌅",
    "💾 saving your aesthetic... done 💾",
    "🪩 disco ball energy detected 🪩",
    "🌊 floating on a sea of neon 🌊",
    "☎️ this call is being routed through 1987 ☎️",
    "🍹 sipping something pink by the fountain 🍹",
];

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

const VibeCheck = definePlugin({
    id: "endcord.vibe-check",
    name: "VibeCheck",
    description: tx("Adds /vibe to drop a random vaporwave mood into chat."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "vibe",
            description: tx("Send a random vaporwave vibe"),
            run: () => pick(VIBES),
        }));
    },
});

/** The same score for the same two names, whichever order they're in */
export function shipScore(a: string, b: string) {
    const key = [a.toLowerCase(), b.toLowerCase()].sort().join("💕");
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h % 101;
}

const ShipCalc = definePlugin({
    id: "endcord.ship-calc",
    name: "ShipCalc",
    description: tx("/ship rates the love between two people."),
    authors: [ENDCORD_AUTHOR],
    icon: "HeartIcon",
    tags: ["Fun"],
    start({ cleanup }) {
        cleanup(command({
            name: "ship",
            description: tx("Calculate a love percentage between two people"),
            options: [
                { name: "a", description: tx("First person"), required: true },
                { name: "b", description: tx("Second person"), required: true },
            ],
            run: ({ a, b }) => {
                const name = (value: string) => {
                    const id = value.match(/^<@!?(\d+)>$/)?.[1];
                    return id ? displayName(getUser(id)) : value;
                };
                const pct = shipScore(name(a), name(b));
                const heart = pct > 80 ? "💞" : pct > 50 ? "💖" : pct > 25 ? "💗" : "💔";
                return `${heart} **${name(a)}** + **${name(b)}** = **${pct}%**`;
            },
        }));
    },
});

/** + - * / % and parentheses, without eval */
export function calculate(expression: string): number {
    const tokens = expression.match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/%()]/gi) ?? [];
    if (tokens.join("") !== expression.replace(/\s+/g, "")) throw new Error("Invalid expression");
    let i = 0;
    const peek = () => tokens[i];
    const take = () => tokens[i++];

    function primary(): number {
        const token = take();
        if (token === "(") {
            const value = sum();
            if (take() !== ")") throw new Error("Missing )");
            return value;
        }
        if (token === "-") return -primary();
        if (token === "+") return primary();
        const n = Number(token);
        if (token === undefined || Number.isNaN(n)) throw new Error("Expected a number");
        return n;
    }
    function product(): number {
        let value = primary();
        while (peek() === "*" || peek() === "/" || peek() === "%") {
            const op = take();
            const right = primary();
            value = op === "*" ? value * right : op === "/" ? value / right : value % right;
        }
        return value;
    }
    function sum(): number {
        let value = product();
        while (peek() === "+" || peek() === "-") value = take() === "+" ? value + product() : value - product();
        return value;
    }

    const result = sum();
    if (i !== tokens.length) throw new Error("Unexpected input");
    return result;
}

const Calculator = definePlugin({
    id: "endcord.calculator",
    name: "Calculator",
    description: tx("/calc does quick maths right in the chat box."),
    authors: [ENDCORD_AUTHOR],
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "calc",
            description: tx("Evaluate a maths expression (+ - * / % and parentheses)"),
            options: [message(tx("The expression, like (2 + 3) * 4"))],
            run: ({ message: expression }, ctx) => {
                if (!/^[\d\s+\-*/().%eE]+$/.test(expression)) {
                    botMessage(ctx.channel.id, t("Only numbers and + - * / % ( ) are allowed."));
                    return;
                }
                let result: number;
                try {
                    result = calculate(expression);
                } catch {
                    result = NaN;
                }
                if (!Number.isFinite(result)) {
                    botMessage(ctx.channel.id, t("Couldn't work that one out."));
                    return;
                }
                return `\`${expression.trim()}\` = **${Number(result.toPrecision(12))}**`;
            },
        }));
    },
});

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

const GoogleThat = definePlugin({
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

// MoreCommands --------------------------------------------------------------------------------------------------------

const UWU_ENDINGS = ["rawr x3", "OwO", "UwU", "o.O", "-.-", ">w<", "(⑅˘꒳˘)", "(ꈍᴗꈍ)", "(˘ω˘)", "(U ᵕ U❁)", "σωσ", "òωó", "(///ˬ///✿)", "(U ﹏ U)", "( ͡o ω ͡o )", "ʘwʘ", ":3", ":3", ":3", "XD", "nyaa~~", "mya", ">_<", "😳", "🥺", "😳😳😳", "rawr", "^^", "^^;;", "(ˆ ﻌ ˆ)♡", "^•ﻌ•^", "/(^•ω•^)", "(✿oωo)"];
const UWU_WORDS: Array<[RegExp, string]> = [["small", "smol"], ["cute", "kawaii"], ["fluff", "floof"], ["love", "luv"], ["stupid", "baka"], ["what", "nani"], ["meow", "nya"], ["hello", "hewwo"]]
    .map(([from, to]) => [new RegExp(`\\b${from}\\b`, "gi"), to]);

export function uwuify(text: string) {
    const words = text.match(/\S+|\s+/g) ?? [];
    const out = words.map(word => {
        if (/^\s+$/.test(word) || word.startsWith("https://") || [...word].every(c => c === word[0])) return word;
        let replaced = word;
        for (const [re, to] of UWU_WORDS) replaced = replaced.replace(re, to);
        return replaced !== word ? replaced : word.replace(/n(?=[aeo])/g, "ny").replace(/l|r/g, "w");
    });
    return `${out.join("")} ${pick(UWU_ENDINGS)}`;
}

const MORSE: Record<string, string> = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
    N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", " ": "/",
};
const FROM_MORSE = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function morse(text: string) {
    if (/^[.\-/ ]+$/.test(text)) {
        const raw = text.split(" ").map(code => FROM_MORSE[code] ?? "").join("").toLowerCase();
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return [...text.toUpperCase()].map(c => MORSE[c] ?? "").filter(Boolean).join(" ");
}

const mock = (text: string) => [...text].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join("");

// Discord has /shrug, /tableflip and /unflip already
const KAOMOJI: Array<[string, string]> = [
    ["lenny", "( ͡° ͜ʖ ͡°)"],
    ["dissatisfaction", "＞﹏＜"], ["smug", "ಠ_ಠ"], ["happy", "ヽ(´▽`)/"], ["crying", "ಥ_ಥ"], ["angry", "ヽ(｀Д´)ﾉ"],
    ["joy", "<(￣︶￣)>"], ["blush", "૮ ˶ᵔ ᵕ ᵔ˶ ა"], ["confused", "(•ิ_•ิ)?"], ["sleeping", "(ᴗ_ᴗ)"], ["laughing", "o(≧▽≦)o"],
    ["peace", "✌(◕‿-)✌"], ["uwu", "(>⩊<)"], ["comfy", "(─‿‿─)♡"], ["music", "(￣▽￣)/♫•¨•.¸¸♪"], ["stars", ".𖥔 ݁ ˖๋ ࣭ ⭑"],
];

const MoreCommands = definePlugin({
    id: "endcord.more-commands",
    name: "MoreCommands",
    description: tx("Adds various fun and useful commands"),
    authors: [ENDCORD_AUTHOR],
    icon: "SlashBoxIcon",
    tags: ["Fun", "Utility"],
    start({ cleanup }) {
        const optionalMessage = { name: "message", description: tx("Your message") };
        cleanup(
            command({
                name: "choose",
                description: tx("Randomly chooses from provided options"),
                options: [{ name: "choices", description: tx("Comma-separated list of choices"), required: true }],
                run: ({ choices }) => t("I choose: {choice}", { choice: pick(String(choices).split(",").map(c => c.trim()).filter(Boolean)) }),
            }),
            command({
                name: "rolldice",
                description: tx("Roll a die with the specified number of sides"),
                options: [{ name: "sides", description: tx("How many sides (default 6)"), type: "integer" }],
                run: ({ sides }) => {
                    const n = Math.max(2, Math.min(Number(sides) || 6, 1_000_000));
                    return t("You rolled a {roll}!", { roll: Math.floor(Math.random() * n) + 1 });
                },
            }),
            command({
                name: "flipcoin",
                description: tx("Flips a coin and returns heads or tails"),
                run: () => t("The coin landed on: {side}", { side: Math.random() < 0.5 ? t("Heads") : t("Tails") }),
            }),
            command({
                name: "ask",
                description: tx("Ask a yes/no question and get an answer"),
                options: [message(tx("Your question"))],
                run: ({ message }) => `${message} - ${pick([t("Yes"), t("No"), t("Maybe"), t("Ask again later"), t("Definitely not"), t("It is certain")])}`,
            }),
            command({
                name: "randomnumber",
                description: tx("Generates a random number between two values"),
                options: [
                    { name: "min", description: tx("Minimum value"), type: "integer", required: true },
                    { name: "max", description: tx("Maximum value"), type: "integer", required: true },
                ],
                run: ({ min, max }) => {
                    const [lo, hi] = [Number(min), Number(max)].sort((a, b) => a - b);
                    return t("Random number between {min} and {max}: {number}", { min: lo, max: hi, number: Math.floor(Math.random() * (hi - lo + 1)) + lo });
                },
            }),
            command({
                name: "randomanimal",
                description: tx("Get a random cat or dog picture"),
                options: [{ name: "animal", description: tx("Pick your animal"), required: true, choices: [{ name: "cat", value: "cat" }, { name: "dog", value: "dog" }] }],
                run: async ({ animal }) => {
                    const res = await fetch(`https://api.the${animal === "dog" ? "dog" : "cat"}api.com/v1/images/search`);
                    const [image] = await res.json();
                    if (!image?.url) throw new Error(t("No picture came back"));
                    return image.url;
                },
            }),
            command({
                name: "wordcount",
                description: tx("Counts the number of words in a message"),
                options: [message()],
                run: ({ message }, ctx) => void botMessage(ctx.channel.id, t("The message contains {count} words.", { count: String(message).trim().split(/\s+/).filter(Boolean).length })),
            }),
            command({
                name: "gettime",
                description: tx("Returns the current time"),
                run: () => `> **${t("Current Time")}**: <t:${Math.floor(Date.now() / 1000)}:F>`,
            }),
            command({
                name: "mock",
                description: tx("mOcK PeOpLe"),
                options: [message()],
                run: ({ message }) => mock(message),
            }),
            command({
                name: "uwuify",
                description: tx("uwuifies your messages"),
                options: [message()],
                run: ({ message }) => uwuify(message),
            }),
            command({
                name: "morse",
                description: tx("Translate to or from Morse code"),
                options: [{ name: "text", description: tx("Text to convert"), required: true }],
                run: ({ text }) => morse(text),
            }),
            command({
                name: "slap",
                description: tx("Slap someone/something."),
                options: [{ name: "victim", description: tx("Thing to slap"), required: true }],
                run: ({ victim }) => t("<@{me}> slaps {victim} around a bit with a large trout", { me: currentUserId() ?? "", victim }),
            }),
            command({
                name: "echo",
                description: tx("Sends a message as Clyde (locally)"),
                options: [message()],
                run: ({ message }, ctx) => void botMessage(ctx.channel.id, message),
            }),
            ...KAOMOJI.map(([name, face]) => command({
                name,
                description: face,
                options: [optionalMessage],
                run: ({ message }) => `${message ? `${message} ` : ""}${face}`,
            })),
        );
    },
});

export default [BoldText, ClapText, LeetText, ReverseText, SpaceOut, Starify, VibeCheck, ShipCalc, Calculator, GoogleThat, MoreCommands];
