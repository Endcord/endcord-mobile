// Endcord PC's profile, status and presence plugins on mobile: the logic that reads what other people and
// remote servers send, and the parts that decide what is shown or sent
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHash } from "crypto";
import path from "path";

import { SRC } from "./src";

// The patcher Endcord wraps, by its path: the tests' module paths send "spitroast" to an empty shim
const spitroast = require(path.resolve(import.meta.dir, "../node_modules/spitroast/dist/cjs.js"));
mock.module(SRC + "lib/api/patcher.ts", () => ({ after: spitroast.after, before: spitroast.before, instead: spitroast.instead }));

/** What the mocked Discord has, for the tests that run a plugin: nothing unless a test puts it there */
const env = {
    props: undefined as ((...names: string[]) => any) | undefined,
    stores: {} as Record<string, any>,
    modules: {} as Record<string, any>,
    /** Flux listeners by action type */
    handlers: new Map<string,(payload: any) => void>(),
};
/** The plugins' storages by name, plain objects here */
const storages = new Map<string, any>();
const quiet = { log() { }, info() { }, warn() { }, error() { } };
const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
mock.module(SRC + "plugins/api.ts", () => ({ definePlugin: (definition: any) => definition, onSettingChange: () => () => { } }));
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    awaitStorage: async () => { },
    createMMKVBackend: (name: string) => name,
    createStorage: (name: string) => name,
    wrapSync: (name: unknown) => {
        const store = {};
        if (typeof name === "string") storages.set(name, store);
        return store;
    },
    useProxy: (s: unknown) => s,
}));
mock.module(SRC + "metro/index.ts", () => ({
    findByProps: (...names: string[]) => env.props?.(...names),
    findByName: () => undefined,
    findByStoreName: () => undefined,
    findByTypeNameAll: () => [],
    findByFilePath: () => undefined,
}));
mock.module(SRC + "plugins/common.tsx", () => ({
    currentUserId: () => "1",
    getStore: (name: string) => env.stores[name],
    subscribe: (type: string, cb: (payload: any) => void) => {
        env.handlers.set(type, cb);
        return () => {
            if (env.handlers.get(type) === cb) env.handlers.delete(type);
        };
    },
    onAction: () => () => { },
    moduleAt: (path: string) => env.modules[path],
    afterRender: () => null,
    dispatchSoon: () => { },
}));
mock.module(SRC + "metro/common/index.ts", () => ({ FluxUtils: { useStateFromStores: () => undefined }, FluxDispatcher: {} }));
mock.module("react-native", () => ({ Image: () => null, View: () => null }));
const assetCalls: string[] = [];
mock.module(SRC + "plugins/hooks.tsx", () => ({
    api: async (_method: string, url: string) => {
        assetCalls.push(url);
        return [{ id: "111", name: "statsfm-large" }, { id: "222", name: "logo" }, { id: 5, name: "bad" }];
    },
    onMessageRow: () => () => { },
    redrawChannel: () => { },
    // What pcMiscPlugins.test.ts's mock of the same module has: run together, the first mock's names are the module's
    appendToTimestamp: () => { },
    getChannel: () => undefined,
    getGuild: () => undefined,
    RowOrder: { REPLACE: -20, ADJUST: -10, ADD: 0, OVERRIDE: 10, HIDE: 100 },
}));
mock.module(SRC + "plugins/shared/presence.ts", () => ({
    externalAsset: async (_app: string, url: string) => `mp:external/${url.length}`,
    setActivity: () => { },
}));

const lyrics = await import(SRC + "plugins/spotifyLyricsStatus/lyrics.ts");
const lyricsStatus = await import(SRC + "plugins/spotifyLyricsStatus/index.ts");

describe("SpotifyLyricsStatus", () => {
    test("reads timed lyrics, gaps and repeated lines", () => {
        const lines = lyrics.parseLrc("[ti:Song]\n[00:01.50]Hello\n[00:03.00][00:10.25]Again\n[00:05.00]\n[00:07.00]♪\r\nno time here");
        expect(lines).toEqual([
            { at: 1500, text: "Hello" },
            { at: 3000, text: "Again" },
            { at: 5000, text: null },
            { at: 7000, text: null },
            { at: 10250, text: "Again" },
        ]);
    });

    test("only real timed lyrics count", () => {
        const four = "[00:01]a\n[00:02]b\n[00:03]c\n[00:04]d";
        expect(lyrics.usableLines({ syncedLyrics: four })?.length).toBe(4);
        expect(lyrics.usableLines({ syncedLyrics: "[00:01]a\n[00:02]b" })).toBeNull();
        expect(lyrics.usableLines({ syncedLyrics: four, instrumental: true })).toBeNull();
        expect(lyrics.usableLines({ syncedLyrics: 5 })).toBeNull();
        expect(lyrics.usableLines(null)).toBeNull();
    });

    test("a search picks the closest length within 4 seconds, and skips what isn't usable", () => {
        const ok = (word: string) => [1, 2, 3, 4].map(n => `[00:0${n}]${word}`).join("\n");
        const results = [
            { duration: 205, syncedLyrics: ok("far") },
            { duration: 200.5, syncedLyrics: "[00:01]junk" },
            { duration: 201, syncedLyrics: ok("near") },
            { duration: "200", syncedLyrics: ok("bad") },
            null,
        ];
        expect(lyrics.closestLyrics(results, 200)?.[0].text).toBe("near");
        expect(lyrics.closestLyrics(results, 300)).toBeNull();
        expect(lyrics.closestLyrics({ not: "a list" }, 200)).toBeNull();
    });

    test("the line at a moment, and when the next starts", () => {
        const lines = lyrics.parseLrc("[00:01]one\n[00:03]\n[00:05]two");
        expect(lyrics.lineAt(lines, 500)).toBeUndefined();
        expect(lyrics.lineAt(lines, 1000)?.text).toBe("one");
        expect(lyrics.lineAt(lines, 3500)?.text).toBeNull();
        expect(lyrics.lineAt(lines, 9000)?.text).toBe("two");
        expect(lyrics.untilNextLine(lines, 1200)).toBe(1800);
        expect(lyrics.untilNextLine(lines, 6000)).toBeUndefined();
        expect(lyrics.lineAt(null, 1000)).toBeUndefined();
    });

    test("a status is cut to what Discord takes", () => {
        expect(lyrics.fitStatus("short")).toBe("short");
        const long = lyrics.fitStatus("x".repeat(300));
        expect(long.length).toBe(128);
        expect(long.endsWith("…")).toBe(true);
        // Never between the two halves of an emoji
        expect(lyrics.fitStatus(`${"x".repeat(126)}😀 and more`)).toBe(`${"x".repeat(126)}…`);
    });

    test("the least time between changes is held to its range, whatever a backup says", () => {
        expect(lyricsStatus.minGapMs(3)).toBe(3000);
        expect(lyricsStatus.minGapMs(0)).toBe(2000);
        expect(lyricsStatus.minGapMs(-5)).toBe(2000);
        expect(lyricsStatus.minGapMs(100)).toBe(8000);
        expect(lyricsStatus.minGapMs("x")).toBe(3000);
        expect(lyricsStatus.minGapMs(undefined)).toBe(3000);
    });

    test("a lookup that couldn't reach lrclib is tried again; a song lrclib doesn't have isn't", async () => {
        const realFetch = globalThis.fetch;
        const { signal } = new AbortController();
        const synced = "[00:01]one\n[00:02]two\n[00:03]three\n[00:04]four";
        let calls = 0;
        try {
            let online = false;
            globalThis.fetch = (async (url: any) => {
                calls++;
                if (!online) throw new TypeError("Network request failed");
                return String(url).includes("/search?") ? new Response("[]") : new Response(JSON.stringify({ syncedLyrics: synced }));
            }) as any;
            const song = { id: "lookup-1", name: "Song", artists: ["Artist"], album: "", duration: 200_000 };
            expect(await lyrics.findLyrics(song, signal)).toBeNull();
            online = true;
            expect((await lyrics.findLyrics(song, signal))?.[0].text).toBe("one");

            // lrclib answers that it has no such song: remembered, not asked again
            globalThis.fetch = (async (url: any) => String(url).includes("/search?") ? new Response("[]") : new Response("{}", { status: 404 })) as any;
            const missing = { ...song, id: "lookup-2" };
            expect(await lyrics.findLyrics(missing, signal)).toBeNull();
            calls = 0;
            globalThis.fetch = (async () => {
                calls++;
                return new Response(JSON.stringify({ syncedLyrics: synced }));
            }) as any;
            expect(await lyrics.findLyrics(missing, signal)).toBeNull();
            expect(calls).toBe(0);
        } finally {
            globalThis.fetch = realFetch;
            lyrics.clearLyricsCache();
        }
    });

    test("huge or hostile lyrics stay cheap", () => {
        const started = performance.now();
        const lines = lyrics.parseLrc(`${"[00:01]".repeat(50_000)}\n${"[".repeat(100_000)}\n${"[00:02]x\n".repeat(10_000)}`);
        expect(lines.length).toBeLessThanOrEqual(3000);
        expect(performance.now() - started).toBeLessThan(500);
        expect(lyrics.parseLrc(`[00:01]${"y".repeat(5000)}`)[0].text!.length).toBe(256);
    });

    test("songs from Spotify's player and from the activity Discord shows", () => {
        expect(lyricsStatus.songFromTrack({ id: "abc", name: "Song", duration: 1000, album: { name: "Album" }, artists: [{ name: "A" }, { name: "" }, {}] }))
            .toEqual({ id: "abc", name: "Song", artists: ["A"], album: "Album", duration: 1000 });
        expect(lyricsStatus.songFromTrack({ id: null, name: "Local", artists: [{ name: "B" }] })?.id).toBe("Local|B");
        expect(lyricsStatus.songFromTrack({ name: "" })).toBeNull();
        expect(lyricsStatus.songFromTrack(null)).toBeNull();
        const current = lyricsStatus.songFromActivity({ details: "Song", state: "A; B", sync_id: "id1", assets: { large_text: "Al" }, timestamps: { start: 1000, end: 61000 } }, 31000);
        expect(current).toEqual({ song: { id: "id1", name: "Song", artists: ["A", "B"], album: "Al", duration: 60000 }, position: 30000 });
        expect(lyricsStatus.songFromActivity({ details: "Song", timestamps: { start: 5, end: 5 } }, 0)).toBeUndefined();
        expect(lyricsStatus.songFromActivity(undefined, 0)).toBeUndefined();
    });
});

describe("SpotifyLyricsStatus, following a song", () => {
    const plugin = lyricsStatus.default as any;
    const LRC = "[00:06.00]line two\n[00:12.00]line three\n[00:12.50]line four\n[00:20.00]line five\n[00:30.00]line six";
    const mine = { text: "my own status", emojiId: "0", emojiName: "", expiresAtMs: "0", createdAtMs: "1" };
    const other = { text: "set on my computer", emojiId: "0", emojiName: "", expiresAtMs: "0", createdAtMs: "5" };
    const track = (id: string, name = "Song") => ({ id, name, duration: 200_000, album: { name: "Album" }, artists: [{ name: "Artist" }] });
    const kept = () => storages.get("ENDCORD_SPOTIFY_LYRICS_STATUS");
    const realFetch = globalThis.fetch, realNow = Date.now;
    let clock = 1_000_000;

    /** Discord's status setting and Flux, which refuses an action while it handles another, as Discord's does */
    function discord(initial: any, { lyrics: synced = LRC as string | null, activity = undefined as any } = {}) {
        let dispatching = false;
        const state = { status: initial, writes: [] as any[] };
        const setting = {
            getSetting: () => state.status,
            updateSetting(value: any) {
                if (dispatching) throw new Error("Cannot dispatch in the middle of a dispatch");
                state.writes.push(value);
                state.status = value;
                return Promise.resolve();
            },
        };
        env.props = (...names) => names.includes("CustomStatusSetting") ? { CustomStatusSetting: setting, StatusSetting: {} } : undefined;
        env.stores.SpotifyStore = { getActivity: () => activity, hasConnectedAccount: () => true };
        globalThis.fetch = (async (url: any) => {
            if (String(url).includes("/search?")) return new Response("[]");
            return synced ? new Response(JSON.stringify({ syncedLyrics: synced })) : new Response("{}", { status: 404 });
        }) as any;
        const cleanups: Array<() => unknown> = [];
        return {
            state,
            dispatch(type: string, payload: any) {
                dispatching = true;
                try {
                    env.handlers.get(type)?.(payload);
                } finally {
                    dispatching = false;
                }
            },
            start: () => plugin.start({
                store: { emoji: "🎵", songBetweenLines: true, minGap: 2 },
                cleanup: (...fns: any[]) => cleanups.push(...fns.filter(fn => typeof fn === "function")),
                logger: quiet,
            }),
            stop: () => {
                for (const fn of cleanups.splice(0).reverse()) fn();
            },
        };
    }

    beforeEach(() => {
        clock = 1_000_000;
        Date.now = () => clock;
        env.handlers.clear();
    });
    afterEach(() => {
        Date.now = realNow;
        globalThis.fetch = realFetch;
        kept().saved = null;
    });

    test("a seek, handled while Discord handles the player's update, doesn't cost you your own status", async () => {
        const d = discord(mine);
        await d.start();
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("seek"), isPlaying: true, position: 6000 });
        await wait();
        expect(d.state.status.text).toBe("line two");
        // The same song, three seconds on, at another place
        clock += 3000;
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("seek"), isPlaying: true, position: 12_000 });
        await wait(200);
        expect(d.state.status.text).toBe("line three");
        d.stop();
        expect(d.state.status).toEqual(mine);
        expect(kept().saved).toBeNull();
    });

    test("a status you set during a song stays when the lyrics stop", async () => {
        const d = discord(mine, { lyrics: null });
        await d.start();
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("manual", "Long Mix"), isPlaying: true, position: 1000 });
        await wait();
        expect(d.state.status.text).toBe("Long Mix — Artist");
        d.state.status = { text: "brb, dinner", emojiId: "0", emojiName: "", expiresAtMs: "0", createdAtMs: "2" };
        d.stop();
        expect(d.state.status.text).toBe("brb, dinner");
        expect(d.state.writes.length).toBe(1);
        expect(kept().saved).toBeNull();
    });

    test("a line is put up again before it runs out, and one that ran out isn't taken for a change of yours", async () => {
        const d = discord(mine, { lyrics: null });
        await d.start();
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("long"), isPlaying: true, position: 0 });
        await wait();
        const firstExpiry = Number(d.state.status.expiresAtMs);
        expect(firstExpiry - Number(d.state.status.createdAtMs)).toBe(lyricsStatus.EXPIRES_AFTER);
        // Within a minute of running out: up again, for longer
        clock += lyricsStatus.EXPIRES_AFTER - 30_000;
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("long"), isPlaying: true, position: 570_000 });
        await wait();
        expect(d.state.writes.length).toBe(2);
        expect(Number(d.state.status.expiresAtMs)).toBeGreaterThan(firstExpiry);
        // Discord was in the background past the end, and cleared it: it goes up again, and yours is still kept
        clock += lyricsStatus.EXPIRES_AFTER + 1000;
        d.state.status = undefined;
        d.dispatch("SPOTIFY_PLAYER_STATE", { track: track("long"), isPlaying: true, position: 1_200_000 });
        await wait();
        expect(d.state.status.text).toBe("Song — Artist");
        d.stop();
        expect(d.state.status).toEqual(mine);
    });

    test("a line an earlier run left up gives way to your own status, unless you set another since", async () => {
        const left = { text: "an old line", emojiId: "0", emojiName: "🎵", createdAtMs: "1000", expiresAtMs: String(1000 + lyricsStatus.EXPIRES_AFTER) };
        let d = discord(left);
        kept().saved = { status: mine };
        await d.start();
        // Not before your account's settings are in
        expect(d.state.writes).toEqual([]);
        d.dispatch("CONNECTION_OPEN", {});
        await wait();
        expect(d.state.status).toEqual(mine);
        d.stop();

        d = discord(other);
        kept().saved = { status: mine };
        await d.start();
        d.dispatch("CONNECTION_OPEN", {});
        await wait();
        expect(d.state.status).toEqual(other);
        expect(d.state.writes).toEqual([]);
        expect(kept().saved).toBeNull();
        d.stop();
        expect(d.state.writes).toEqual([]);
    });

    test("started mid-song after you set a status elsewhere: the lyrics leave it for that song", async () => {
        const d = discord(other, { activity: { details: "Song", state: "Artist", sync_id: "elsewhere", timestamps: { start: clock - 6000, end: clock + 194_000 } } });
        kept().saved = { status: mine };
        await d.start();
        await wait();
        expect(d.state.writes).toEqual([]);
        expect(kept().saved).toBeNull();
        d.stop();
        expect(d.state.status).toEqual(other);
    });
});

const decor = await import(SRC + "plugins/decor/data.ts");
const forever = await import(SRC + "plugins/defaultStatusForever/index.ts");
const timeouts = await import(SRC + "plugins/customStatusTimeouts/index.ts");

describe("Decor", () => {
    test("asks for a batch of users in one link", () => {
        expect(decor.usersUrl(["123456789012345678", "223456789012345678"]))
            .toBe("https://decor.fieryflames.dev/api/users?ids=%5B%22123456789012345678%22%2C%22223456789012345678%22%5D");
    });

    test("takes only the users asked about, and only decorations that look like one", () => {
        const asked = ["111111111111111111", "222222222222222222", "333333333333333333", "444444444444444444"];
        const answer = JSON.parse("{\"111111111111111111\":\"a_0123abcd\",\"222222222222222222\":null,\"333333333333333333\":\"../../evil?x\",\"999999999999999999\":\"abc\",\"__proto__\":\"x\"}");
        const found = decor.readAnswer(answer, asked);
        expect([...found]).toEqual([
            ["111111111111111111", "a_0123abcd"],
            ["222222222222222222", null],
            ["333333333333333333", null],
            ["444444444444444444", null],
        ]);
        expect([...decor.readAnswer("nope", asked.slice(0, 1))]).toEqual([["111111111111111111", null]]);
        expect([...decor.readAnswer([1, 2], asked.slice(0, 1))]).toEqual([["111111111111111111", null]]);
        expect(decor.readAnswer({ x: "y".repeat(101) }, ["x"]).get("x")).toBeNull();
    });

    test("decoration images, still where Discord doesn't animate", () => {
        expect(decor.decorationUrl("a_abc", true)).toBe("https://ugc.decor.fieryflames.dev/a_abc.png");
        expect(decor.decorationUrl("a_abc", false)).toBe("https://ugc.decor.fieryflames.dev/abc.png");
        expect(decor.decorationUrl("abc", false)).toBe("https://ugc.decor.fieryflames.dev/abc.png");
    });

    test("what's known is trusted for four hours, and what's kept is the newest valid", () => {
        const now = 10 * decor.FETCH_COOLDOWN;
        expect(decor.isFresh({ a: null, t: now - 1000 }, now)).toBe(true);
        expect(decor.isFresh({ a: "x", t: now - decor.FETCH_COOLDOWN }, now)).toBe(false);
        expect(decor.isFresh({ a: "x", t: now + 1000 }, now)).toBe(false);
        expect(decor.isFresh(undefined, now)).toBe(false);
        const entries: Array<[string, any]> = [
            ["111111111111111111", { a: "old", t: 1 }],
            ["222222222222222222", { a: null, t: 3 }],
            ["333333333333333333", { a: "new", t: 2 }],
            ["__proto__", { a: "x", t: 9 }],
            ["444444444444444444", { a: "bad/one", t: 9 }],
            ["555555555555555555", null],
        ];
        expect(decor.prune(entries, 2)).toEqual({ "222222222222222222": { a: null, t: 3 }, "333333333333333333": { a: "new", t: 2 } });
    });

    test("someone seen again while they're being asked about isn't asked about twice", async () => {
        const decorPlugin = (await import(SRC + "plugins/decor/index.ts")).default as any;
        const A = "111111111111111111", B = "222222222222222222";
        const profiles = { getUserProfile: (_id: string) => ({}) };
        env.stores.UserStore = { getUser: (id: string) => ({ id }), getCurrentUser: () => undefined };
        env.stores.UserProfileStore = profiles;
        env.props = (...names) => names.includes("getAvatarDecorationURL") ? { getAvatarDecorationURL: () => "x" } : undefined;
        const asked: string[][] = [];
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async (url: any) => {
            asked.push(JSON.parse(decodeURIComponent(String(url).split("ids=")[1])));
            // Both drawn again while the answer is on its way
            profiles.getUserProfile(A);
            profiles.getUserProfile(B);
            return new Response("{}");
        }) as any;
        const cleanups: Array<() => unknown> = [];
        try {
            await decorPlugin.start({ cleanup: (...fns: any[]) => cleanups.push(...fns.filter(fn => typeof fn === "function")), logger: quiet });
            profiles.getUserProfile(A);
            // The first batch, then the next with only who wasn't asked about yet
            await wait(1700);
            await wait(1700);
            expect(asked).toEqual([[A], [B]]);
        } finally {
            for (const fn of cleanups.reverse()) fn();
            globalThis.fetch = realFetch;
            env.props = undefined;
            env.stores = {};
        }
    }, 10_000);
});

describe("DefaultStatusForever", () => {
    test("a status counts when it has text or an emoji", () => {
        expect(forever.hasCustomStatus({ text: "hi" })).toBe(true);
        expect(forever.hasCustomStatus({ emojiName: "🎵", emojiId: "0" })).toBe(true);
        expect(forever.hasCustomStatus({ emojiId: "123" })).toBe(true);
        expect(forever.hasCustomStatus({ text: "", emojiId: "0" })).toBe(false);
        expect(forever.hasCustomStatus(undefined)).toBe(false);
    });

    test("moves a value first and back where it was", () => {
        const discord = ["TODAY", "HOURS_4", "HOURS_1", "MINUTES_30", "DONT_CLEAR"];
        const first = forever.withFirst(discord, "DONT_CLEAR");
        expect(first).toEqual(["DONT_CLEAR", "TODAY", "HOURS_4", "HOURS_1", "MINUTES_30"]);
        expect(forever.putBack(first, "DONT_CLEAR", discord)).toEqual(discord);
        // With other choices added meanwhile, it goes back after what it came after
        expect(forever.putBack(["DONT_CLEAR", "x", "MINUTES_30", "y"], "DONT_CLEAR", discord)).toEqual(["x", "MINUTES_30", "DONT_CLEAR", "y"]);
        expect(forever.withFirst(discord, "missing")).toEqual(discord);
        expect(forever.putBack(discord, "missing", discord)).toEqual(discord);
    });
});

describe("CustomStatusTimeouts", () => {
    test("reads the lists like PC, and nothing else", () => {
        expect(timeouts.parseList("15, 30, 45")).toEqual([15, 30, 45]);
        expect(timeouts.parseList(" 5,,x, -2, 1.5, 0, 5, 7 ")).toEqual([5, 7]);
        expect(timeouts.parseList("")).toEqual([]);
        expect(timeouts.parseList(Array.from({ length: 40 }, (_, i) => i + 1).join(",")).length).toBe(20);
    });

    test("presets are shortest first, each once, and a year at most", () => {
        const list = timeouts.presets({ extraSeconds: "60", extraMinutes: "1, 5", extraHours: "1", extraDays: "1, 400" });
        expect(list.map((p: any) => p.duration)).toEqual([60_000, 300_000, 3_600_000, 86_400_000]);
        expect(timeouts.durationOf(list[1].value)).toBe(300_000);
        expect(timeouts.durationOf("HOURS_1")).toBeUndefined();
        expect(timeouts.durationOf("endcord-timeout-abc")).toBeUndefined();
        expect(timeouts.durationOf("endcord-timeout-999999999999999")).toBeUndefined();
        expect(timeouts.durationOf(5)).toBeUndefined();
    });

    test("labels in the largest whole unit", () => {
        expect(timeouts.presetLabel(45_000)).toBe("For 45 Seconds");
        expect(timeouts.presetLabel(60_000)).toBe("For 1 Minute");
        expect(timeouts.presetLabel(90_000)).toBe("For 90 Seconds");
        expect(timeouts.presetLabel(2 * 3_600_000)).toBe("For 2 Hours");
        expect(timeouts.presetLabel(86_400_000)).toBe("For 1 Day");
    });

    test("joins Discord's choices, shortest first, with Don't clear on top or at the bottom", () => {
        const lengths: Record<string, number | undefined> = { TODAY: 86_400_000 - 1, HOURS_4: 4 * 3_600_000, HOURS_1: 3_600_000, MINUTES_30: 1_800_000 };
        const discord = ["TODAY", "HOURS_4", "HOURS_1", "MINUTES_30", "DONT_CLEAR"];
        const ours = timeouts.presets({ extraSeconds: "15", extraMinutes: "30", extraHours: "2", extraDays: "2" });
        const merged = timeouts.mergeOptions(discord, ours, (v: unknown) => lengths[v as string], "DONT_CLEAR", true);
        expect(merged).toEqual(["DONT_CLEAR", "endcord-timeout-15000", "MINUTES_30", "HOURS_1", "endcord-timeout-7200000", "HOURS_4", "TODAY", "endcord-timeout-172800000"]);
        expect(timeouts.mergeOptions(discord, [], (v: unknown) => lengths[v as string], "DONT_CLEAR", false).at(-1)).toBe("DONT_CLEAR");
        // One without a known length stays after the one before it
        expect(timeouts.mergeOptions(["A", "B"], ours.slice(0, 1), (v: unknown) => v === "A" ? 60_000 : undefined, "none", true)).toEqual(["endcord-timeout-15000", "A", "B"]);
    });
});

describe("DefaultStatusForever and CustomStatusTimeouts together", () => {
    test("the choices go back as Discord had them, whichever starts or stops first", () => {
        const lengths: Record<string, number> = { HOURS_4: 4 * 3_600_000, HOURS_1: 3_600_000, MINUTES_30: 1_800_000 };
        const discordList = ["TODAY", "HOURS_4", "HOURS_1", "MINUTES_30", "DONT_CLEAR"];
        const plugins = { forever: forever.default as any, timeouts: timeouts.default as any };
        const store = { showForeverOnTop: true, extraSeconds: "15", extraMinutes: "5", extraHours: "2", extraDays: "1" };
        try {
            for (const startOrder of [["forever", "timeouts"], ["timeouts", "forever"]] as const) {
                for (const stopOrder of [["forever", "timeouts"], ["timeouts", "forever"]] as const) {
                    const options = [...discordList];
                    env.modules = {
                        "modules/custom_status/Constants.tsx": {
                            ClearAfterValues: Object.fromEntries(discordList.map(v => [v, v])),
                            ClearAfterOptions: options,
                        },
                        "modules/custom_status/utils/computeInitialClearAfter.tsx": { default: () => "HOURS_4" },
                        "modules/custom_status/utils/getClearAfterDuration.tsx": { default: (v: string) => lengths[v] },
                        "modules/custom_status/utils/formatClearAfterOption.tsx": { default: (v: unknown) => String(v) },
                        "modules/custom_status/utils/formatClearAfterValue.tsx": { default: (v: unknown) => String(v) },
                    };
                    const cleanups: Record<string, Array<() => unknown>> = { forever: [], timeouts: [] };
                    for (const name of startOrder) {
                        plugins[name].start({ store, logger: quiet, cleanup: (...fns: any[]) => cleanups[name].push(...fns.filter(fn => typeof fn === "function")) });
                    }
                    expect(options[0]).toBe("DONT_CLEAR");
                    expect(options).toContain("endcord-timeout-15000");
                    for (const name of stopOrder) for (const fn of cleanups[name].reverse()) fn();
                    expect(options).toEqual(discordList);
                }
            }
        } finally {
            env.modules = {};
        }
    });
});

const banners = await import(SRC + "plugins/bannersEverywhere/index.tsx");
const rp = await import(SRC + "plugins/richPresence/common.ts");
const jellyfin = await import(SRC + "plugins/richPresence/jellyfin.ts");
const abs = await import(SRC + "plugins/richPresence/audiobookshelf.ts");
const statsfm = await import(SRC + "plugins/richPresence/statsfm.ts");
const gensokyo = await import(SRC + "plugins/richPresence/gensokyo.ts");
const navidrome = await import(SRC + "plugins/richPresence/navidrome.ts");
const { md5Hex } = await import(SRC + "plugins/richPresence/md5.ts");
const questify = await import(SRC + "plugins/questify/index.ts");

describe("BannersEverywhere", () => {
    test("only real banner hashes, from Discord's CDN, still unless animating", () => {
        const hash = "a_0123456789abcdef0123456789abcdef";
        expect(banners.bannerHash(hash)).toBe(hash);
        expect(banners.bannerHash("../x")).toBeUndefined();
        expect(banners.bannerHash(123)).toBeUndefined();
        expect(banners.cdnBanner("1", hash, false)).toBe(`https://cdn.discordapp.com/banners/1/${hash}.webp?size=320`);
        expect(banners.cdnBanner("1", hash, true)).toBe(`https://cdn.discordapp.com/banners/1/${hash}.gif?size=320`);
        expect(banners.cdnBanner("1", hash.slice(2), true)).toBe(`https://cdn.discordapp.com/banners/1/${hash.slice(2)}.webp?size=320`);
    });

    test("remembers the latest banners, valid ones only, up to the limit", () => {
        const h = (n: number) => String(n).repeat(32);
        const users = JSON.parse(`{"111111111111111111":"${h(1)}","222222222222222222":"${h(2)}","__proto__":"${h(3)}","333333333333333333":"nope"}`);
        const kept = banners.remember(users, "444444444444444444", h(4), 2);
        expect(kept).toEqual({ "222222222222222222": h(2), "444444444444444444": h(4) });
        // Seen again: moves to the end
        expect(Object.keys(banners.remember(kept, "222222222222222222", h(5), 2))).toEqual(["444444444444444444", "222222222222222222"]);
    });
});

describe("RichPresence", () => {
    test("server addresses: https on the internet, plain http only on this phone", () => {
        expect(rp.serverBase("https://jf.example.com/")).toEqual({ base: "https://jf.example.com" });
        expect(rp.serverBase("jf.example.com/jellyfin?x=1#y")).toEqual({ base: "https://jf.example.com/jellyfin" });
        expect(rp.serverBase("http://localhost:8096")).toEqual({ base: "http://localhost:8096" });
        expect(rp.serverBase("http://127.0.0.1:8096")).toEqual({ base: "http://127.0.0.1:8096" });
        expect(rp.serverBase("http://jf.example.com")).toEqual({ error: "insecure" });
        expect(rp.serverBase("https://192.168.1.5:8096")).toEqual({ error: "private" });
        expect(rp.serverBase("https://10.0.0.1")).toEqual({ error: "private" });
        expect(rp.serverBase("ftp://jf.example.com")).toEqual({ error: "invalid" });
        expect(rp.serverBase("https://a b.com")).toEqual({ error: "invalid" });
        expect(rp.serverBase("  ")).toEqual({ error: "empty" });
    });

    test("lines from servers are text, trimmed and cut to what Discord shows", () => {
        expect(rp.line("  a \n b  ")).toBe("a b");
        expect(rp.line(42)).toBe("42");
        expect(rp.line({})).toBeUndefined();
        expect(rp.line("")).toBeUndefined();
        expect(rp.line("x".repeat(500))!.length).toBe(128);
        expect(rp.formatDuration(187_000)).toBe("3:07");
        expect(rp.formatDuration(3_725_000)).toBe("1:02:05");
    });

    test("the same presence isn't sent again for times that moved by a moment", () => {
        const a = { name: "x", timestamps: { start: 1000, end: 5000 } };
        expect(rp.sameActivity(a, { name: "x", timestamps: { start: 2500, end: 6500 } })).toBe(true);
        expect(rp.sameActivity(a, { name: "x", timestamps: { start: 9000, end: 5000 } })).toBe(false);
        expect(rp.sameActivity(a, { name: "y", timestamps: { start: 1000, end: 5000 } })).toBe(false);
        expect(rp.sameActivity(a, { name: "x" })).toBe(false);
        expect(rp.sameActivity(null, null)).toBe(true);
        expect(rp.sameActivity(a, null)).toBe(false);
    });

    test("application pictures by name, asked once per application", async () => {
        expect(await rp.asset("9", "statsfm-large")).toBe("111");
        expect(await rp.asset("9", "logo")).toBe("222");
        expect(await rp.asset("9", "bad")).toBeUndefined();
        expect(assetCalls.filter(u => u === "/oauth2/applications/9/assets").length).toBe(1);
        expect(await rp.asset("9", "https://img.example.com/a.png")).toBe("mp:external/29");
        expect(await rp.asset("9", undefined)).toBeUndefined();
    });

    const jfSettings = { jf_nameDisplay: "default", jf_customName: "", jf_coverType: "series", jf_episodeFormat: "long", jf_showEpisodeName: false, jf_overrideType: "off", jf_showPausedState: true, jf_privacyMode: false };
    const episodeSession = {
        UserId: "me",
        NowPlayingItem: { Name: "Pilot", Type: "Episode", Id: "ep1", SeriesId: "abc123", SeriesName: "Show", ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: 600 * 1e7, ImageTags: { Primary: "t" } },
        PlayState: { IsPaused: false, PositionTicks: 60 * 1e7 },
    };

    test("Jellyfin: your session, its cover, and the episode as PC words it", () => {
        const media = jellyfin.jellyfinMedia([{ UserId: "other", NowPlayingItem: { Name: "No" } }, episodeSession], "me", "https://jf.example.com", jfSettings)!;
        expect(media).toMatchObject({ name: "Pilot", type: "Episode", seriesName: "Show", seasonNumber: 1, episodeNumber: 2, duration: 600, position: 60, isPaused: false });
        expect(media.imageUrl).toBe("https://jf.example.com/Items/abc123/Images/Primary");
        const activity = jellyfin.jellyfinActivity(media, jfSettings, 1_000_000);
        expect(activity).toMatchObject({ name: "Show", details: "Show", state: "S01E02", type: 3, timestamps: { start: 940_000, end: 1_540_000 } });
        expect(jellyfin.jellyfinActivity(media, { ...jfSettings, jf_episodeFormat: "short", jf_showEpisodeName: true }, 0).state).toBe("1x02 - Pilot");
        expect(jellyfin.jellyfinActivity(media, { ...jfSettings, jf_nameDisplay: "full" }, 0).name).toBe("Show - Pilot");
        expect(jellyfin.jellyfinActivity(media, { ...jfSettings, jf_privacyMode: true }, 0).details).toBe("Watching a TV Show");
        expect(jellyfin.jellyfinActivity(media, { ...jfSettings, jf_overrideType: "2" }, 0).type).toBe(2);
        expect(jellyfin.jellyfinMedia("nope", "me", "", jfSettings)).toBeNull();
        const odd = { ...episodeSession, NowPlayingItem: { ...episodeSession.NowPlayingItem, SeriesId: "../../x" } };
        expect(jellyfin.jellyfinMedia([odd], "me", "https://a", jfSettings)!.imageUrl).toBeUndefined();
    });

    test("Jellyfin: paused, and custom names that hide details", () => {
        const paused = jellyfin.jellyfinMedia([{ ...episodeSession, PlayState: { IsPaused: true, PositionTicks: 65 * 1e7 } }], "me", "https://a", jfSettings)!;
        const activity = jellyfin.jellyfinActivity(paused, jfSettings, 0);
        expect(activity.details).toBe("Show - Paused");
        expect(activity.state).toBe("S01E02 - 1:05 / 10:00");
        expect(activity.timestamps).toBeUndefined();
        expect(jellyfin.jellyfinMedia([{ ...episodeSession, PlayState: { IsPaused: true } }], "me", "https://a", { ...jfSettings, jf_showPausedState: false })).toBeNull();
        const movie = jellyfin.jellyfinMedia([{ UserId: "me", NowPlayingItem: { Name: "Big $& Film", Type: "Movie", ProductionYear: 1999 } }], "me", "https://a", jfSettings)!;
        const custom = { ...jfSettings, jf_nameDisplay: "custom", jf_customName: "{name} ({year})" };
        expect(jellyfin.jellyfinActivity(movie, custom, 0).name).toBe("Big $& Film (1999)");
        expect(jellyfin.jellyfinActivity(movie, { ...custom, jf_privacyMode: true }, 0).name).toBe("[Title Hidden] (1999)");
    });

    test("AudioBookShelf: a session updated in the last 30 seconds", () => {
        const now = 1_000_000;
        const session = { updatedAt: now - 5000, isFinished: false, libraryItemId: "li_1", duration: 3600, currentTime: 600, mediaMetadata: { title: "Book", author: "Writer", series: [{ name: "Saga" }] } };
        const media = abs.absMedia({ sessions: [session] }, "https://abs.example.com", now)!;
        expect(media).toEqual({ name: "Book", author: "Writer", series: "Saga", duration: 3600, currentTime: 600, imageUrl: "https://abs.example.com/api/items/li_1/cover" });
        expect(abs.absActivity(media, now)).toMatchObject({ name: "AudioBookShelf", details: "Book", state: "Saga • Writer", type: 2, timestamps: { start: 400_000, end: 4_000_000 } });
        expect(abs.absMedia({ sessions: [{ ...session, updatedAt: now - 60_000 }] }, "", now)).toBeNull();
        expect(abs.absMedia({ sessions: [{ ...session, libraryItemId: "../x" }] }, "https://a", now)!.imageUrl).toBeUndefined();
        expect(abs.absMedia(null, "", now)).toBeNull();
    });

    test("AudioBookShelf: a refused sign-in isn't tried again every few seconds, until the settings change", async () => {
        const realFetch = globalThis.fetch;
        let logins = 0;
        globalThis.fetch = (async (url: any) => {
            if (String(url).endsWith("/login")) logins++;
            return new Response("Unauthorized", { status: 401 });
        }) as any;
        try {
            const client = abs.audiobookshelf();
            const { signal } = new AbortController();
            await expect(client.presence("https://abs.example.com", "me", "wrong", signal)).rejects.toThrow("401");
            expect(await client.presence("https://abs.example.com", "me", "wrong", signal)).toBeNull();
            expect(logins).toBe(1);
            // New settings: tried again right away
            client.reset();
            await expect(client.presence("https://abs.example.com", "me", "right", signal)).rejects.toThrow("401");
            expect(logins).toBe(2);
            expect([1, 2, 3, 10].map(abs.signInWait)).toEqual([60_000, 120_000, 240_000, 30 * 60_000]);
            expect(abs.isRefusal(new Error("Request returned non-ok: 429 Too Many Requests"))).toBe(true);
            expect(abs.isRefusal(new Error("Network request failed"))).toBe(false);
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    const sfmSettings = { sfm_username: "someone", sfm_shareUsername: true, sfm_shareSong: true, sfm_statusName: "Stats.fm", sfm_nameFormat: "status-name", sfm_useListeningStatus: true, sfm_missingArt: "StatsFmLogo", sfm_showLogo: true, sfm_alwaysHideArt: false };

    test("stats.fm: the track, its links and the name format", () => {
        const track = statsfm.statsFmTrack({ item: { track: { id: 42, name: "Song", artists: [{ name: "Artist" }], albums: [{ name: "Album", image: "https://cdn.stats.fm/a.jpg" }, { name: "Other" }] } } })!;
        expect(track).toEqual({ name: "Song", albums: "Album, Other", artists: "Artist", url: "https://stats.fm/track/42", imageUrl: "https://cdn.stats.fm/a.jpg" });
        const { activity, largeImage } = statsfm.statsFmActivity(track, sfmSettings);
        expect(activity).toMatchObject({ name: "Stats.fm", details: "Song", state: "Artist", type: 2, buttons: ["Stats.fm Profile", "View Song"], metadata: { button_urls: ["https://stats.fm/someone", "https://stats.fm/track/42"] } });
        expect(largeImage).toBe("https://cdn.stats.fm/a.jpg");
        expect(statsfm.statsFmActivity(track, { ...sfmSettings, sfm_alwaysHideArt: true, sfm_missingArt: "placeholder" }).largeImage).toBe("placeholder");
        expect(statsfm.statsFmName(track, { sfm_nameFormat: "artist-first", sfm_statusName: "" })).toBe("Artist - Song");
        expect(statsfm.statsFmName(track, { sfm_nameFormat: "album", sfm_statusName: "" })).toBe("Album, Other");
        expect(statsfm.statsFmTrack({ item: null })).toBeNull();
        expect(statsfm.statsFmTrack({ item: { track: { name: "x", albums: [{ image: "javascript:alert(1)" }] } } })!.imageUrl).toBeUndefined();
        expect(statsfm.validUsername("good_name.1")).toBe(true);
        expect(statsfm.validUsername("../evil")).toBe(false);
    });

    test("Gensokyo Radio: the station's song, and only its own album art", () => {
        const built = gensokyo.gensokyoActivity({ SONGINFO: { TITLE: "Bad Apple!!", ARTIST: "Alstroemeria Records", ALBUM: "Lovelight" }, SONGTIMES: { SONGSTART: 100, SONGEND: 300 }, MISC: { ALBUMART: "cover.jpg" } })!;
        expect(built.activity).toMatchObject({ name: "Gensokyo Radio", details: "Bad Apple!!", state: "Alstroemeria Records", timestamps: { start: 100_000, end: 300_000 } });
        expect(built.artwork).toBe("https://gensokyoradio.net/images/albums/500/cover.jpg");
        expect(gensokyo.gensokyoActivity({ SONGINFO: { TITLE: "x" }, MISC: { ALBUMART: "../../evil" } })!.artwork).toBeUndefined();
        expect(gensokyo.gensokyoActivity({})).toBeNull();
    });

    test("Navidrome: your entry, the format strings, and a Subsonic sign-in without the password", () => {
        const entries = [{ id: "1", username: "other", title: "No" }, { id: "t2", username: "Me", title: "Song", artist: "Artist", album: "Album", year: 2001, suffix: "flac", bitRate: 900 }];
        const track = navidrome.nowPlaying({ "subsonic-response": { status: "ok", nowPlaying: { entry: entries } } }, "me")!;
        expect(track).toMatchObject({ id: "t2", title: "Song", artist: "Artist", album: "Album", year: 2001 });
        expect(navidrome.fillTrack("{song} by {artist} ({year}) {quality} $&", track)).toBe("Song by Artist (2001) FLAC 900kbps $&");
        expect(navidrome.fillTrack(undefined, track)).toBe("");
        expect(navidrome.nowPlaying({ "subsonic-response": { status: "failed" } }, "me")).toBeNull();
        expect(navidrome.nowPlaying({ "subsonic-response": { nowPlaying: { entry: [{ username: "me" }] } } }, "me")).toBeNull();
        const auth = navidrome.subsonicAuth("me@x", "secret", "abc123");
        expect(auth).toBe(`u=me%40x&t=${createHash("md5").update("secretabc123").digest("hex")}&s=abc123&v=1.12.0&c=endcord-rpc&f=json`);
        expect(auth).not.toContain("secret&");
    });

    test("MD5 is the standard one", () => {
        for (const text of ["", "a", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(64), "x".repeat(1000), "şifre🎵"]) {
            expect(md5Hex(text)).toBe(createHash("md5").update(text, "utf8").digest("hex"));
        }
    });
});

describe("Questify", () => {
    test("only Quest and Orb badges go", () => {
        const list = [{ id: "quest_completed" }, { id: "orb_profile_badge" }, { id: "hypesquad" }, null];
        expect(questify.withoutQuestBadges(list)).toEqual([{ id: "hypesquad" }, null]);
    });
});
