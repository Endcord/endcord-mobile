/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId } from "../common";
import { botMessage, command } from "../hooks";
import { message, morse, pick, uwuify } from "../shared/text";

const mock = (text: string) => [...text].map((c, i) => i % 2 ? c.toUpperCase() : c.toLowerCase()).join("");

// Discord has /shrug, /tableflip and /unflip already
const KAOMOJI: Array<[string, string]> = [
    ["lenny", "( ͡° ͜ʖ ͡°)"],
    ["dissatisfaction", "＞﹏＜"], ["smug", "ಠ_ಠ"], ["happy", "ヽ(´▽`)/"], ["crying", "ಥ_ಥ"], ["angry", "ヽ(｀Д´)ﾉ"],
    ["joy", "<(￣︶￣)>"], ["blush", "૮ ˶ᵔ ᵕ ᵔ˶ ა"], ["confused", "(•ิ_•ิ)?"], ["sleeping", "(ᴗ_ᴗ)"], ["laughing", "o(≧▽≦)o"],
    ["peace", "✌(◕‿-)✌"], ["uwu", "(>⩊<)"], ["comfy", "(─‿‿─)♡"], ["music", "(￣▽￣)/♫•¨•.¸¸♪"], ["stars", ".𖥔 ݁ ˖๋ ࣭ ⭑"],
];

export default definePlugin({
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
