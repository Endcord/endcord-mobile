// Endcord PC's local fakes, permissions, forwards and fun plugins on mobile. Their pure logic, with
// Discord's modules mocked away: what they show, what they keep from being sent, and how they handle other people's text
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (m, k) => values && k in values ? String(values[k]) : m),
    tx: (s: string) => s,
}));
mock.module(SRC + "plugins/api.ts", () => ({ definePlugin: (definition: any) => definition, onSettingChange: () => () => { } }));
mock.module(SRC + "lib/api/patcher.ts", () => ({ after: () => () => true, before: () => () => true, instead: () => () => true }));
mock.module(SRC + "plugins/common.tsx", () => ({
    currentUserId: () => "1",
    getStore: () => undefined,
    moduleAt: () => undefined,
    subscribe: () => () => { },
    onAction: () => () => { },
    afterRender: () => null,
}));
mock.module(SRC + "plugins/profileBadges.ts", () => ({
    extendProfileBadges: () => () => { },
    isPluginBadge: (badge: any) => typeof badge?.id === "string" && badge.id.startsWith("endcord-"),
    linkedBadge: (id: string, description: string, uri: string) => ({ id, description, icon: "dummy", iconSrc: uri }),
}));
mock.module(SRC + "plugins/shared/profiles.ts", () => ({ redrawProfiles: () => { } }));
mock.module(SRC + "plugins/hooks.tsx", () => ({
    appendToTimestamp: () => { },
    getChannel: () => undefined,
    getGuild: () => undefined,
    onMessageRow: () => () => { },
    RowOrder: { REPLACE: -20, ADJUST: -10, ADD: 0, OVERRIDE: 10, HIDE: 100 },
    // What pcProfilePlugins.test.ts's mock of the same module has: run together, the first mock's names are the module's
    api: async () => undefined,
    redrawChannel: () => { },
}));

const fakeNitroAge = await import(SRC + "plugins/fakeNitroAge/index.ts");
const { fakeCount } = await import(SRC + "plugins/fakeRequestCount/index.ts");
const friends = await import(SRC + "plugins/fakeFriends/logic.ts");
const server = await import(SRC + "plugins/fakeServer/logic.ts");

describe("FakeNitroAge", () => {
    const { chosenMonths, isNitroBadge, monthsBefore, NITRO_TIERS, tierIcon } = fakeNitroAge;

    test("the badge's tier is the highest that many months earn", () => {
        expect(tierIcon(0)).toBe(NITRO_TIERS[0].icon);
        expect(tierIcon(1)).toBe(NITRO_TIERS[1].icon);
        expect(tierIcon(2)).toBe(NITRO_TIERS[1].icon);
        expect(tierIcon(5)).toBe(NITRO_TIERS[2].icon);
        expect(tierIcon(12)).toBe(NITRO_TIERS[4].icon);
        expect(tierIcon(48)).toBe(NITRO_TIERS[6].icon);
        expect(tierIcon(72)).toBe(NITRO_TIERS[8].icon);
        expect(tierIcon(999)).toBe(NITRO_TIERS[8].icon);
    });

    test("months back keep the day, or the month's last one", () => {
        const at = (s: string) => new Date(`${s}T12:00:00`);
        const day = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        expect(day(monthsBefore(1, at("2026-03-31")))).toBe("2026-2-28");
        expect(day(monthsBefore(1, at("2024-03-31")))).toBe("2024-2-29");
        expect(day(monthsBefore(12, at("2026-11-14")))).toBe("2025-11-14");
        expect(day(monthsBefore(14, at("2026-01-15")))).toBe("2024-11-15");
        expect(day(monthsBefore(72, at("2026-11-14")))).toBe("2020-11-14");
    });

    test("the settings' months: a preset, or the custom number in PC's range", () => {
        expect(chosenMonths("24", 5)).toBe(24);
        expect(chosenMonths("custom", 5)).toBe(5);
        expect(chosenMonths("custom", 0)).toBe(1);
        expect(chosenMonths("custom", 5000)).toBe(999);
        expect(chosenMonths("custom", Number.NaN)).toBe(12);
        expect(chosenMonths("junk", 3)).toBe(12);
    });

    test("Discord's Nitro badges are told from the others", () => {
        for (const id of ["premium", "premium_tenure_1_month_v2", "premium_tenure_24_month_v2", "premium_tenure_72_months"]) expect(isNitroBadge({ id })).toBe(true);
        for (const id of ["guild_booster_lvl1", "early_supporter", "hypesquad", "premium_early_supporter", "", undefined]) expect(isNitroBadge({ id })).toBe(false);
        expect(isNitroBadge({ id: "nitro_default" }, "nitro_default")).toBe(true);
        expect(isNitroBadge(null)).toBe(false);
    });
});

describe("FakeRequestCount", () => {
    test("the number asked for, alone or on top of the real one, in PC's range", () => {
        expect(fakeCount(4, 3, false)).toBe(3);
        expect(fakeCount(4, 3, true)).toBe(7);
        expect(fakeCount(4, -5, false)).toBe(0);
        expect(fakeCount(4, 123456, false)).toBe(9999);
        expect(fakeCount(4, 2.6, false)).toBe(3);
        expect(fakeCount(undefined, 3, true)).toBe(3);
        expect(fakeCount(Number.NaN, Number.NaN, true)).toBe(0);
    });
});

describe("FakeFriends", () => {
    const { FRIEND, INCOMING, relationshipTarget, urlOf, userIdOf, withFakeIds, withFakeSinces, withFakeTypes } = friends;
    const ID = "123456789012345678", OTHER = "223456789012345678";

    test("requests about someone are told by their address", () => {
        expect(relationshipTarget(`/users/@me/relationships/${ID}`)).toBe(ID);
        expect(relationshipTarget(`https://discord.com/api/v9/users/@me/relationships/${ID}`)).toBe(ID);
        expect(relationshipTarget(`/users/@me/relationships/${ID}/ignore`)).toBe(ID);
        expect(relationshipTarget(`/users/@me/relationships/${ID}?x=1`)).toBe(ID);
        expect(relationshipTarget("/users/@me/relationships")).toBeUndefined();
        expect(relationshipTarget(`/users/@me/relationships/${ID}9999`)).toBeUndefined();
        expect(relationshipTarget(`/users/${ID}/profile`)).toBeUndefined();
        expect(relationshipTarget(`/users/@me/relationships/${ID}`.padEnd(600, "x"))).toBeUndefined();
        expect(relationshipTarget(42)).toBeUndefined();
        expect(urlOf("/a")).toBe("/a");
        expect(urlOf({ url: "/b", body: {} })).toBe("/b");
        expect(urlOf(undefined)).toBeUndefined();
    });

    test("the user an action is about, however Discord passes them", () => {
        expect(userIdOf(ID)).toBe(ID);
        expect(userIdOf({ userId: ID, context: {} })).toBe(ID);
        expect(userIdOf({ user: { id: ID } })).toBe(ID);
        expect(userIdOf({ id: ID })).toBe(ID);
        expect(userIdOf("__proto__")).toBeUndefined();
        expect(userIdOf({ userId: 5 })).toBeUndefined();
        expect(userIdOf(null)).toBeUndefined();
    });

    test("relationship maps get the fakes, as the same kind of collection, never over a real one", () => {
        const real = new Map([[OTHER, 1]]);
        const map = withFakeTypes(real, [[ID, "pending"], [OTHER, "pending"]]) as Map<string, number>;
        expect(map).not.toBe(real);
        expect(real.size).toBe(1);
        expect(map.get(ID)).toBe(INCOMING);
        expect(map.get(OTHER)).toBe(FRIEND);
        const object = withFakeTypes({ [OTHER]: 2 }, [[ID, "friend"]]) as Record<string, number>;
        expect(object).toEqual({ [OTHER]: 2, [ID]: FRIEND });
        // Shapes this doesn't know are left as Discord made them
        const records = new Map([[OTHER, { type: 1 }]]);
        expect(withFakeTypes(records, [[ID, "friend"]])).toBe(records);
        expect(withFakeTypes(real, [])).toBe(real);
        expect(withFakeTypes(null, [[ID, "friend"]])).toBeNull();
        const empty = withFakeTypes(new Map(), [[ID, "friend"]]) as Map<string, number>;
        expect(empty.get(ID)).toBe(FRIEND);
    });

    test("dates and ID lists get the fakes too", () => {
        const since = "2026-11-14T10:00:00.000Z";
        expect((withFakeSinces(new Map([[OTHER, "x"]]), [[ID, { state: "friend", since }]]) as Map<string, string>).get(ID)).toBe(since);
        expect(withFakeSinces({ [ID]: "real" }, [[ID, { state: "friend", since }]])).toEqual({ [ID]: "real" });
        const ids = [OTHER];
        expect(withFakeIds(ids, [ID, OTHER])).toEqual([OTHER, ID]);
        expect(withFakeIds(ids, [OTHER])).toBe(ids);
        expect(withFakeIds(undefined, [ID])).toBeUndefined();
    });

    test("blocking or ignoring someone is told from the rest, so it's never answered with a fake", () => {
        const { isBlockOrIgnore } = friends;
        expect(isBlockOrIgnore("put", { url: `/users/@me/relationships/${ID}`, body: { type: 2 } })).toBe(true);
        expect(isBlockOrIgnore("put", { url: `https://discord.com/api/v9/users/@me/relationships/${ID}`, body: { type: "2" } })).toBe(true);
        expect(isBlockOrIgnore("put", { url: `/users/@me/relationships/${ID}`, body: {} })).toBe(false);
        expect(isBlockOrIgnore("put", { url: `/users/@me/relationships/${ID}`, body: { type: 1 } })).toBe(false);
        expect(isBlockOrIgnore("patch", { url: `/users/@me/relationships/${ID}`, body: { type: 2 } })).toBe(false);
        expect(isBlockOrIgnore("put", `/users/@me/relationships/${ID}/ignore`)).toBe(true);
        expect(isBlockOrIgnore("del", { url: `/users/@me/relationships/${ID}/ignore?x=1` })).toBe(true);
        expect(isBlockOrIgnore("del", { url: `/users/@me/relationships/${ID}` })).toBe(false);
        expect(isBlockOrIgnore("put", undefined)).toBe(false);
    });
});

describe("FakeServer", () => {
    const { addFeatures, guildTarget, realFeatures, toCount, withInvite, withMemberList, withProfile } = server;
    const ID = "123456789012345678";

    test("badges are features, in the kind of collection Discord used", () => {
        const set = addFeatures(new Set(["COMMUNITY"]), { verified: true });
        expect(set instanceof Set && [...set]).toEqual(["COMMUNITY", "VERIFIED"]);
        expect(addFeatures(["VERIFIED"], { verified: true, partnered: true })).toEqual(["VERIFIED", "PARTNERED"]);
        expect([...addFeatures(undefined, { partnered: true })]).toEqual(["PARTNERED"]);
    });

    test("counts typed in keep their digits, up to PC's largest", () => {
        expect(toCount("250,000")).toBe(250000);
        expect(toCount("  ")).toBeUndefined();
        expect(toCount("abc")).toBeUndefined();
        expect(toCount("9".repeat(30))).toBe(99_999_999);
    });

    test("cards and invites show the fake counts", () => {
        expect(withProfile({ name: "x", memberCount: 5 }, { members: 9, verified: true })).toEqual({ name: "x", memberCount: 9, features: ["VERIFIED"] });
        expect(withProfile({ features: new Set(["A"]) }, { partnered: true }).features).toEqual(new Set(["A", "PARTNERED"]));
        const invite = withInvite({ code: "a", guild: { id: ID, features: ["COMMUNITY"] }, approximate_member_count: 3 }, { partnered: true, online: 7 });
        expect(invite.guild.features).toEqual(["COMMUNITY", "PARTNERED"]);
        expect(invite.approximate_member_count).toBe(3);
        expect(invite.approximate_presence_count).toBe(7);
    });

    test("the member list's headers add up to the fake counts", () => {
        const props = {
            groups: [{ id: "role", count: 3 }, { id: "online", count: 10 }, { id: "offline", count: 50 }],
            rows: [{ type: "GROUP", id: "role", count: 3 }, { type: "MEMBER" }, { type: "GROUP", id: "online", count: 10 }, { type: "GROUP", id: "offline", count: 50 }],
        };
        const out = withMemberList(props, { members: 1000, online: 100 });
        expect(out.groups.map((g: any) => g.count)).toEqual([3, 97, 900]);
        expect(out.rows.filter((r: any) => r.type === "GROUP").map((r: any) => r.count)).toEqual([3, 97, 900]);
        expect(props.groups[1].count).toBe(10);
        expect(withMemberList(props, { verified: true })).toBe(props);
        // More shown under roles than the fake online count: never below zero
        expect(withMemberList(props, { online: 1 }).groups[1].count).toBe(0);
        expect(withMemberList({ rows: [] }, { members: 5 })).toEqual({ rows: [] });
    });

    test("a server save sends only the real badges", () => {
        expect(guildTarget(`/guilds/${ID}`)).toBe(ID);
        expect(guildTarget(`https://discord.com/api/v9/guilds/${ID}/`)).toBe(ID);
        expect(guildTarget(`/guilds/${ID}/roles`)).toBeUndefined();
        expect(guildTarget(undefined)).toBeUndefined();
        expect(realFeatures(["COMMUNITY", "VERIFIED", "PARTNERED"], f => f === "PARTNERED")).toEqual(["COMMUNITY", "PARTNERED"]);
        expect(realFeatures(["VERIFIED"], () => false)).toEqual([]);
    });
});

const audio = await import(SRC + "plugins/animalese/audio.ts");
const trivia = await import(SRC + "plugins/triviaAI/payload.ts");
const forwards = await import(SRC + "plugins/betterForwards/index.ts");

describe("BetterForwards", () => {
    const { forwardSource, shortName } = forwards;
    const G = "123456789012345678", C = "223456789012345678";

    test("forwards are told from replies, and where they came from is read safely", () => {
        expect(forwardSource({ messageReference: { type: 1, guild_id: G, channel_id: C } })).toEqual({ guildId: G, channelId: C });
        expect(forwardSource({ message_reference: { guild_id: G }, message_snapshots: [{}] })).toEqual({ guildId: G, channelId: undefined });
        expect(forwardSource({ messageReference: { type: 0, guild_id: G } })).toBeUndefined();
        expect(forwardSource({ messageReference: { type: 1, guild_id: "__proto__" } })).toEqual({ guildId: undefined, channelId: undefined });
        expect(forwardSource({})).toBeUndefined();
        expect(forwardSource(null)).toBeUndefined();
    });

    test("server names stay on one short line", () => {
        expect(shortName("  My\nServer  ")).toBe("My Server");
        expect(shortName("x".repeat(100))!.length).toBe(60);
        expect(shortName("   ")).toBeUndefined();
        expect(shortName(5)).toBeUndefined();
    });
});

describe("Animalese", () => {
    const { encodeWav, letterSounds, mix, OUTPUT_RATE, parseWav } = audio;

    test("letters get PC's sounds, with sh, th, repeats and punctuation as PC reads them", () => {
        expect(letterSounds("abz")).toEqual([1, 2, 26]);
        expect(letterSounds("she thinks")).toEqual([27, 5, 28, 9, 14, 11, 19]);
        expect(letterSounds("hello")).toEqual([8, 5, 12, 15]);
        expect(letterSounds("ok, why?")).toEqual([15, 11, 30, 23, 8, 25, 30]);
        expect(letterSounds("Şüphe ığdır")).toEqual(letterSounds("suphe igdir"));
        expect(letterSounds("123 !!! 😀")).toEqual([]);
    });

    /** A WAV as the letters come: 16-bit mono 44.1 kHz, with a JUNK chunk before its format */
    function wav16(samples: number[], { rate = 44100, channels = 1, junk = true } = {}) {
        const data = new Uint8Array(samples.length * 2);
        const dv = new DataView(data.buffer);
        samples.forEach((s, i) => dv.setInt16(i * 2, s, true));
        const parts: number[] = [];
        const str = (s: string) => [...s].forEach(c => parts.push(c.charCodeAt(0)));
        const u32 = (n: number) => parts.push(n & 255, n >> 8 & 255, n >> 16 & 255, n >>> 24);
        const u16 = (n: number) => parts.push(n & 255, n >> 8 & 255);
        str("RIFF");
        u32(0);
        str("WAVE");
        if (junk) {
            str("JUNK");
            u32(3);
            parts.push(0, 0, 0, 0);
        }
        str("fmt ");
        u32(16);
        u16(1);
        u16(channels);
        u32(rate);
        u32(rate * 2 * channels);
        u16(2 * channels);
        u16(16);
        str("data");
        u32(data.length);
        data.forEach(b => parts.push(b));
        return Uint8Array.from(parts);
    }

    test("WAV files are read whatever chunks come first, and anything else is refused", () => {
        const sound = parseWav(wav16([0, 16384, -32768, 32767]));
        expect(sound.rate).toBe(44100);
        expect([...sound.samples].map(s => Math.round(s * 1000) / 1000)).toEqual([0, 0.5, -1, 1]);
        const stereo = parseWav(wav16([16384, -16384, 8192, 8192], { channels: 2, junk: false }));
        expect([...stereo.samples]).toEqual([0, 0.25]);
        expect(() => parseWav(new Uint8Array(10))).toThrow();
        expect(() => parseWav(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "))).toThrow();
        // A data chunk that says it's longer than the file is read as far as the file goes
        const whole = wav16([1000, 2000, 3000], { junk: false });
        expect(parseWav(whole.subarray(0, whole.length - 2)).samples.length).toBe(2);
    });

    test("what's written reads back as written", () => {
        const samples = Float32Array.from([0, 0.5, -0.5, 1, -1]);
        const back = parseWav(encodeWav(samples));
        expect(back.rate).toBe(OUTPUT_RATE);
        expect([...back.samples].map(s => Math.round(s * 100) / 100)).toEqual([0, 0.5, -0.5, 1, -1]);
    });

    test("letters are placed a slot apart, sped up, in a sound as long as PC's", () => {
        const tone: any = { rate: 44100, samples: new Float32Array(11324).fill(0.5) };
        const out = mix([tone, tone, undefined, tone], { speed: 1, pitch: 1, question: false, random: () => 0 });
        expect(out.length).toBe(Math.floor(OUTPUT_RATE * 4 * 0.1));
        const slot = Math.floor(OUTPUT_RATE * 0.09);
        // Each letter is 0.257 s, 2.8 times as fast: about 2020 samples at 22050 Hz
        const letterLength = Math.floor(11324 / (2.8 * 44100 / OUTPUT_RATE));
        expect(out[0]).toBe(0.5);
        expect(out[slot + letterLength - 1]).toBe(0.5);
        expect(out[slot + letterLength + 10]).toBe(0);
        // The third letter has no sound: quiet until the fourth
        expect(out[3 * slot - 10]).toBe(0);
        expect(out[3 * slot]).toBe(0.5);
        // A higher pitch plays the whole faster, as PC's player does
        expect(mix([tone, tone], { speed: 1, pitch: 1.5, question: false, random: () => 0 }).length).toBe(Math.floor(Math.floor(OUTPUT_RATE * 0.2) / 1.5));
        expect(mix([], { speed: 1, pitch: 1, question: false }).length).toBe(1);
    });

    test("slow letters all fit: the sound lasts until the last one ends", () => {
        // Ten letters, each its own level, to tell which made it into the sound
        const letters = Array.from({ length: 10 }, (_, i) => ({ rate: 44100, samples: new Float32Array(11025).fill((i + 1) / 20) }));
        for (const speed of [0.5, 0.75, 1, 1.5]) {
            const out = mix(letters, { speed, pitch: 1, question: false, random: () => 0 });
            const heard = new Set([...out].filter(Boolean).map(v => Math.round(v * 20)));
            expect([...heard].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }
        // Speeds and pitches no setting offers are held to a sane range
        expect(mix(letters.slice(0, 2), { speed: 0, pitch: -1, question: false }).length).toBeGreaterThan(1);
        expect(mix(letters.slice(0, 2), { speed: 1e9, pitch: Number.NaN, question: false }).length).toBeLessThan(OUTPUT_RATE);
    });
});

describe("TriviaAI", () => {
    const { answerOf, buildChat, hasContent, isDiscordImage, messageContent, previousMessages, systemPrompt } = trivia;
    const options = { myId: "1", supportImages: true, passMessageAuthorName: true, treatSelfAsAssistant: false };

    test("a message's text, embeds and pictures, each part held to a length", () => {
        expect(messageContent({ content: "hi", embeds: [], attachments: [] }, false)).toBe("hi");
        expect(messageContent({ content: "", embeds: [{ rawTitle: "T", rawDescription: "D", fields: [{ rawName: "a", rawValue: "b" }], footer: { text: "f" } }] }, false))
            .toBe("## T\nD\n**a**: b\n_f_");
        const withImage = messageContent({
            content: "q",
            attachments: [{ content_type: "image/png", proxy_url: "https://media.discordapp.net/a.png" }, { content_type: "text/plain", url: "https://x/y" }],
            embeds: [{ image: { url: "http://insecure/x.png" } }],
        }, true);
        expect(withImage).toEqual([{ type: "text", text: "q" }, { type: "image_url", image_url: { url: "https://media.discordapp.net/a.png" } }]);
        expect((messageContent({ content: "x".repeat(10000) }, false) as string).length).toBe(4000);
        const many = messageContent({ attachments: Array.from({ length: 10 }, (_, i) => ({ content_type: "image/png", url: `https://cdn.discordapp.com/${i}.png` })) }, true) as any[];
        expect(many.length).toBe(4);
        expect(messageContent({ content: "  " }, false)).toBeNull();
    });

    test("whether there's anything to answer", () => {
        expect(hasContent({ content: "x" }, false)).toBe(true);
        expect(hasContent({ content: " ", embeds: [{}] }, false)).toBe(true);
        expect(hasContent({ attachments: [{ content_type: "image/jpeg" }] }, false)).toBe(false);
        expect(hasContent({ attachments: [{ content_type: "image/jpeg" }] }, true)).toBe(true);
    });

    test("the chat says who wrote what, as PC's does", () => {
        const a = { id: "10", author: { id: "2", username: "ann" }, content: "what is 2+2?" };
        const mine = { id: "11", author: { id: "1", username: "me" }, content: "hmm" };
        const target = { id: "12", author: { id: "3", username: "bob" }, content: "", attachments: [{ content_type: "image/png", url: "https://cdn.discordapp.com/p.png" }] };
        expect(buildChat([a, mine, target], target, options)).toEqual([
            { role: "user", content: "ann: what is 2+2?" },
            { role: "user", content: "hmm" },
            { role: "user", content: [{ type: "text", text: "bob: " }, { type: "image_url", image_url: { url: "https://cdn.discordapp.com/p.png" } }] },
        ]);
        expect(buildChat([mine, a], a, { ...options, treatSelfAsAssistant: true })[0].role).toBe("assistant");
        expect(buildChat([a], a, { ...options, passMessageAuthorName: false })[0].content).toBe("what is 2+2?");
        expect(previousMessages([{ id: "1" }, { id: "2" }, { id: "3" }], { id: "3" }, 1)).toEqual([{ id: "2" }]);
        expect(previousMessages([{ id: "1" }, { id: "2" }], { id: "2" }, 0)).toEqual([]);
        expect(previousMessages([{ id: "1" }], { id: "9" }, 3)).toEqual([]);
    });

    test("prompts, answers, and which pictures may be downloaded", () => {
        const now = new Date(0);
        expect(systemPrompt("{current_user} at {current_time}", "me", now)).toBe("me at " + now.toString());
        expect(answerOf({ choices: [{ message: { content: " 4 " } }] })).toBe("4");
        expect(answerOf({ choices: [{ message: { content: [{ type: "text", text: "a" }, { text: "b" }] } }] })).toBe("ab");
        expect(answerOf({})).toBe("");
        expect(isDiscordImage("https://cdn.discordapp.com/attachments/1/2/a.png")).toBe(true);
        expect(isDiscordImage("https://media.discordapp.net/x")).toBe(true);
        expect(isDiscordImage("https://cdn.discordapp.com.evil.com/x")).toBe(false);
        expect(isDiscordImage("http://cdn.discordapp.com/x")).toBe(false);
    });
});

const card = await import(SRC + "plugins/quoter/card.ts");
const services = await import(SRC + "plugins/translate/services.ts");
const lookup = await import(SRC + "plugins/shared/lookup.ts");

describe("Quoter", () => {
    const { CANVAS, cardFileName, isPng, layoutQuote, quoteText, textWidth, wrapLines } = card;

    test("lines break at spaces, long words where they must, and at line breaks", () => {
        const lines = wrapLines("the quick brown fox jumps over the lazy dog", 42, 300);
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) expect(textWidth(line, 42)).toBeLessThanOrEqual(300);
        expect(lines.join(" ")).toBe("the quick brown fox jumps over the lazy dog");
        const long = wrapLines("a".repeat(200), 42, 300);
        expect(long.join("")).toBe("a".repeat(200));
        for (const line of long) expect(textWidth(line, 42)).toBeLessThanOrEqual(300);
        expect(wrapLines("one\ntwo", 42, 520)).toEqual(["one", "two"]);
        expect(wrapLines("\n\nhi\n\n", 42, 520)).toEqual(["hi"]);
    });

    test("short quotes get PC's largest size, long ones shrink and are cut to fit", () => {
        const short = layoutQuote("Be yourself.");
        expect(short.fontSize).toBe(42);
        expect(short.lines).toEqual(["Be yourself."]);
        const medium = layoutQuote("word ".repeat(80).trim());
        expect(medium.fontSize).toBeLessThan(42);
        expect(medium.totalHeight).toBeLessThanOrEqual(CANVAS.maxContentHeight);
        const huge = layoutQuote("word ".repeat(1000).trim());
        expect(huge.fontSize).toBe(18);
        expect(huge.totalHeight).toBeLessThanOrEqual(CANVAS.maxContentHeight);
        expect(huge.lines[huge.lines.length - 1].endsWith("…")).toBe(true);
    });

    test("mentions become names and custom emojis their name, with the length held", () => {
        const id = "123456789012345678";
        expect(quoteText(`hi <@${id}> <@!${id}> <:pog:${id}> <a:dance:${id}>`, x => x === id ? "ann" : undefined)).toBe("hi @ann @ann :pog: :dance:");
        expect(quoteText(`<@${id}>`, () => undefined)).toBe(`<@${id}>`);
        expect([...quoteText("x".repeat(5000), () => undefined)].length).toBe(1000);
        expect(quoteText("a\r\nb", () => undefined)).toBe("a\nb");
    });

    test("file names are plain, as PC makes them", () => {
        expect(cardFileName("never gonna give you up", "rick")).toBe("never gonn - rick.png");
        expect(cardFileName("../../etc/passwd", "a/b")).toBe("etc - ab.png");
        expect(cardFileName("", "")).toBe("quote.png");
        expect(isPng(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 13, 10, 26, 10, 0]))).toBe(true);
        expect(isPng(new Uint8Array(20))).toBe(false);
    });
});

describe("Translate", () => {
    const { deeplTarget, deeplTranslate, isHeaderSafe, kagiTranslate, languageLabel, QuotaError } = services;
    const realFetch = globalThis.fetch;
    const reply = (status: number, body: unknown) => {
        const calls: Array<{ url: string; init: any; }> = [];
        globalThis.fetch = (async (url: any, init: any) => {
            calls.push({ url: String(url), init });
            return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
        }) as any;
        return calls;
    };

    test("language codes become DeepL's", () => {
        expect(deeplTarget("en")).toBe("en-us");
        expect(deeplTarget(" TR ")).toBe("tr");
        expect(deeplTarget("pt")).toBe("pt-br");
        expect(deeplTarget("zh-CN")).toBe("zh-hans");
        expect(deeplTarget("zh-TW")).toBe("zh-hant");
        expect(languageLabel("en")).toBe("EN");
        expect(languageLabel("zh-hans")).toBe("ZH-HANS");
        expect(languageLabel("English")).toBe("English");
        expect(isHeaderSafe("abc:fx")).toBe(true);
        expect(isHeaderSafe("a b")).toBe(false);
        expect(isHeaderSafe("a\nb")).toBe(false);
        expect(isHeaderSafe("")).toBe(false);
    });

    test("DeepL is asked as PC asks it, and its errors are told apart", async () => {
        try {
            let calls = reply(200, { translations: [{ detected_source_language: "TR", text: "hello" }] });
            expect(await deeplTranslate("merhaba", "en", "key:fx", false)).toEqual({ from: "TR", text: "hello" });
            expect(calls[0].url).toBe("https://api-free.deepl.com/v2/translate");
            expect(calls[0].init.headers.Authorization).toBe("DeepL-Auth-Key key:fx");
            expect(JSON.parse(calls[0].init.body)).toEqual({ text: ["merhaba"], target_lang: "en-us" });
            calls = reply(200, { translations: [{ text: "x" }] });
            await deeplTranslate("a", "de", "k", true);
            expect(calls[0].url).toBe("https://api.deepl.com/v2/translate");
            reply(456, "quota");
            await expect(deeplTranslate("a", "de", "k", false)).rejects.toBeInstanceOf(QuotaError);
            reply(403, "forbidden");
            await expect(deeplTranslate("a", "de", "k", false)).rejects.toThrow("Invalid DeepL API key or version");
            reply(200, { nothing: true });
            await expect(deeplTranslate("a", "de", "k", false)).rejects.toThrow();
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    test("Google Translate: an answer without a translation isn't one, and the request gives up", async () => {
        try {
            const calls = reply(200, { translation: "hola", sourceLanguage: "en" });
            expect(await lookup.translate("hello", "es")).toEqual({ from: "en", text: "hola" });
            expect(calls[0].url.startsWith("https://translate-pa.googleapis.com/v1/translate?")).toBe(true);
            expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
            reply(200, {});
            await expect(lookup.translate("hello", "es")).rejects.toThrow("Couldn't translate this (200)");
            reply(200, { translation: "  " });
            await expect(lookup.translate("hello", "es")).rejects.toThrow();
            reply(500, "down");
            await expect(lookup.translate("hello", "es")).rejects.toThrow("Couldn't translate this (500)");
            reply(200, "x".repeat(2 * 1024 * 1024));
            await expect(lookup.translate("hello", "es")).rejects.toThrow();
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    test("Kagi gets the session as PC sends it", async () => {
        try {
            const calls = reply(200, { translation: "hallo", detected_language: { label: "English" } });
            expect(await kagiTranslate("hello", "DE", "tok")).toEqual({ from: "English", text: "hallo" });
            expect(calls[0].url).toBe("https://translate.kagi.com/api/translate");
            expect(calls[0].init.headers.Cookie).toBe("kagi_session=tok");
            expect(JSON.parse(calls[0].init.body)).toEqual({ text: "hello", from: "auto", to: "de", model: "standard" });
            reply(401, "no");
            await expect(kagiTranslate("a", "de", "tok")).rejects.toThrow("Invalid or expired Kagi session token");
            reply(200, "<html>");
            await expect(kagiTranslate("a", "de", "tok")).rejects.toThrow();
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});
