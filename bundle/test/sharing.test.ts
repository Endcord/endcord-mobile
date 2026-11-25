// Shared custom profiles, against a fake profiles channel: what's read, what's posted and deleted, and when. As on Endcord
// PC (test/sharing.mjs there), every client reads every other's messages, so this is where a mistake shows everywhere
import { afterAll, beforeAll, describe, expect, jest, mock, test } from "bun:test";

import { SRC } from "./src";

const CHANNEL = "1575191153672986694";
const GUILD = "1543323763695820942";
const DISCORD_EPOCH = 1420070400000;

// ---- Fakes ------------------------------------------------------------------------------------------------------------

const storage = new Map<string, string>();
/** While set, writes wait for it: a slow phone */
let writesHeld: Promise<void> | null = null;
mock.module(SRC + "core/vendetta/storage.ts", () => ({
    createMMKVBackend: (key: string, fallback: unknown) => ({
        get: async () => JSON.parse(storage.get(key) ?? JSON.stringify(fallback ?? null)),
        set: async (value: unknown) => {
            if (writesHeld) await writesHeld;
            storage.set(key, JSON.stringify(value));
        },
    }),
}));

let me = "900000000000000001";
const member = new Set([GUILD]);
const handlers = new Map<string, Set<(payload: any) => void>>();
const dispatch = (type: string, payload: any) => {
    for (const handler of handlers.get(type) ?? []) handler(payload);
};
mock.module(SRC + "plugins/common.tsx", () => ({
    getStore: (name: string) => ({
        GuildStore: { getGuild: (id: string) => member.has(id) ? { id } : undefined },
        AuthenticationStore: { getId: () => me },
        ReadStateStore: { lastMessageId: () => newestId() },
    })[name],
    subscribe: (type: string, handler: (payload: any) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(handler);
        return () => handlers.get(type)!.delete(handler);
    },
}));

interface Message { id: string; author: { id: string; }; content: string; attachments: any[]; flags?: number; }
/** The channel, oldest first */
let channel: Message[] = [];
let seq = 0;
const newId = () => String((BigInt(Date.now() - DISCORD_EPOCH) << 22n) + BigInt(seq++ % 4096));
const newestId = () => channel.at(-1)?.id ?? null;
const add = (author: string, content: string) => {
    const message = { id: newId(), author: { id: author }, content, attachments: [] };
    channel.push(message);
    return message;
};
const posts: any[] = [];
const deletes: string[] = [];
let failNextPost: any = null;
/** Discord out of reach: every request fails as a dropped connection does, without a status */
let offline = false;
let failDeletes = false;
const big = (id: string) => BigInt(id);
mock.module(SRC + "plugins/hooks.tsx", () => ({
    HTTP: () => ({
        get: async ({ url }: { url: string; }) => {
            expect(url.startsWith(`/channels/${CHANNEL}/messages?`)).toBe(true);
            const query = new URLSearchParams(url.split("?")[1]);
            const limit = Number(query.get("limit"));
            let page: Message[];
            // As Discord answers: newest first; after= gives the oldest ones after that message
            if (query.get("after")) page = channel.filter(m => big(m.id) > big(query.get("after")!)).slice(0, limit).reverse();
            else if (query.get("before")) page = channel.filter(m => big(m.id) < big(query.get("before")!)).slice(-limit).reverse();
            else page = channel.slice(-limit).reverse();
            return { body: structuredClone(page) };
        },
        post: async ({ url, body }: { url: string; body: any; }) => {
            posts.push({ url, body });
            if (offline) throw new Error("Network request failed");
            if (failNextPost) {
                const error = failNextPost;
                failNextPost = null;
                throw error;
            }
            const message = { id: newId(), author: { id: me }, content: body.content, attachments: [], flags: body.flags };
            channel.push(message);
            return { body: structuredClone(message) };
        },
        del: async ({ url }: { url: string; }) => {
            const id = url.split("/").pop()!;
            deletes.push(id);
            if (offline || failDeletes) throw new Error("Network request failed");
            // Unknown Message
            if (!channel.some(m => m.id === id)) throw { status: 404, body: { code: 10008 } };
            channel = channel.filter(m => m.id !== id);
            return {};
        },
    }),
}));

const sharing = await import(SRC + "plugins/customProfile/sharing.ts");

/** Lets the fake clock run, with the promises each step starts settling in between */
async function wait(ms: number, step = 100) {
    for (let passed = 0; passed < ms; passed += step) {
        jest.advanceTimersByTime(Math.min(step, ms - passed));
        for (let i = 0; i < 30; i++) await Promise.resolve();
    }
    for (let i = 0; i < 30; i++) await Promise.resolve();
}

const A = "100000000000000001", B = "100000000000000002", C = "100000000000000003", D = "100000000000000004", E = "100000000000000005";
const profile = (data: Record<string, unknown>) => `ecp1 ${JSON.stringify(data)}`;
const changed: string[][] = [];
let offered: string[] = [];
let mine: { id: string; data: any; } | null = null;
const start = (read = true) => sharing.startSharing(ids => void changed.push(ids), {
    read,
    mine: () => mine,
    offer: (id: string) => void offered.push(id),
    logger: { warn: () => { }, error: () => { } },
});
const myMessages = () => channel.filter(m => m.author.id === me);

beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-12T20:00:00Z"));
});
afterAll(() => {
    sharing.stopSharing();
    jest.useRealTimers();
});

describe("reading the channel", () => {
    test("everyone's newest profile is read, and only what a profile may show", async () => {
        add(A, profile({ globalName: "old A" }));
        add(B, profile({ bio: "B's bio", email: "b@example.com", phone: "123", createdAt: "2016-01-01" }));
        add(C, "ecp1 {not json");
        add(D, "hello, not a profile");
        add(A, profile({ globalName: "new A", pronouns: "they" }));
        add(E, profile({ avatar: "https://evil.example/track.png", bio: "E" }));
        await start();
        // Not at once: Discord has enough to do right after it starts
        expect(sharing.getSharedProfile(A)).toBeNull();
        await wait(16_000);
        expect(sharing.getSharedProfile(A)).toEqual({ globalName: "new A", pronouns: "they" });
        expect(sharing.getSharedProfile(B)).toEqual({ bio: "B's bio" });
        expect(sharing.getSharedProfile(C)).toBeNull();
        expect(sharing.getSharedProfile(D)).toBeNull();
        // Pictures only from Discord's own servers: a link anywhere else would tell a stranger who looked
        expect(sharing.getSharedProfile(E)).toEqual({ bio: "E" });
        expect(changed.flat()).toContain(A);
    });

    test("a new profile comes in live", async () => {
        const message = add(C, profile({ globalName: "C" }));
        dispatch("MESSAGE_CREATE", { channelId: CHANNEL, message });
        expect(sharing.getSharedProfile(C)).toEqual({ globalName: "C" });
        // Another channel's messages are nobody's profile
        dispatch("MESSAGE_CREATE", { channelId: "1", message: { ...add(D, profile({ globalName: "D" })), id: newId() } });
        expect(sharing.getSharedProfile(D)).toBeNull();
    });

    test("a message id from the future can't hold a profile in place", async () => {
        const future = String((BigInt(Date.now() + 10 * 86_400_000 - DISCORD_EPOCH) << 22n));
        dispatch("MESSAGE_CREATE", { channelId: CHANNEL, message: { id: future, author: { id: B }, content: profile({ bio: "forever" }), attachments: [] } });
        expect(sharing.getSharedProfile(B)).toEqual({ bio: "B's bio" });
    });

    test("an emptied profile from Endcord PC takes its author's profile back, even with the older message still there", async () => {
        const message = add(A, "ecp1 {}");
        dispatch("MESSAGE_CREATE", { channelId: CHANNEL, message });
        expect(sharing.getSharedProfile(A)).toBeNull();
        // The whole channel read again (twelve hours on), newest first: the older profile below doesn't come back
        await wait(12 * 60 * 60 * 1000 + 11 * 60 * 1000, 60_000);
        expect(channel.some(m => m.author.id === A && m.content.includes("new A"))).toBe(true);
        expect(sharing.getSharedProfile(A)).toBeNull();
    });

    test("an emptied profile is kept across restarts, so an older one isn't read back in", async () => {
        sharing.stopSharing();
        await wait(6000);
        await start();
        expect(sharing.getSharedProfile(A)).toBeNull();
        expect(sharing.getSharedProfile(C)).toEqual({ globalName: "C" });
        await wait(16_000);
        expect(sharing.getSharedProfile(A)).toBeNull();
    });

    test("deleted messages take their profiles with them, one or many at once", async () => {
        const c = channel.find(m => m.author.id === C && m.content.includes("\"C\""))!;
        dispatch("MESSAGE_DELETE", { channelId: CHANNEL, id: c.id });
        expect(sharing.getSharedProfile(C)).toBeNull();
        const b = channel.find(m => m.author.id === B)!;
        const e = channel.find(m => m.author.id === E)!;
        dispatch("MESSAGE_DELETE_BULK", { channelId: CHANNEL, ids: [b.id, e.id, 5, "x"] });
        expect(sharing.getSharedProfile(B)).toBeNull();
        expect(sharing.getSharedProfile(E)).toBeNull();
    });
});

describe("sharing this account's profile", () => {
    test("posts one quiet message without the private fields, and keeps only the newest", async () => {
        mine = { id: me, data: { globalName: "Me", bio: "hi", email: "me@example.com", phone: "5", createdAt: "2015-05-05" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        const post = posts.at(-1);
        expect(post.url).toBe(`/channels/${CHANNEL}/messages`);
        // No notification and no link previews, and nobody pinged whatever the profile says
        expect(post.body.flags).toBe((1 << 2) | (1 << 12));
        expect(post.body.allowed_mentions).toEqual({ parse: [] });
        expect(post.body.content).toBe(profile({ globalName: "Me", bio: "hi" }));
        expect(sharing.getSharedProfile(me)).toEqual({ globalName: "Me", bio: "hi" });

        mine.data = { globalName: "Me again" };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        expect(myMessages().map(m => m.content)).toEqual([profile({ globalName: "Me again" })]);
    });

    test("taking it back deletes it, then posts an empty profile so every phone drops it at once", async () => {
        const before = myMessages()[0].id;
        mine = { id: me, data: null };
        expect(await sharing.publishProfile(me, null)).toBe("published");
        expect(deletes).toContain(before);
        expect(myMessages().map(m => m.content)).toEqual(["ecp1 {}"]);
        expect(sharing.getSharedProfile(me)).toBeNull();
        // Sharing again clears the empty profile away
        mine = { id: me, data: { bio: "back" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        expect(myMessages().map(m => m.content)).toEqual([profile({ bio: "back" })]);
    });

    test("taking back a profile that was never shared posts nothing", async () => {
        me = "900000000000000002";
        const count = posts.length;
        expect(await sharing.publishProfile(me, null)).toBe("published");
        expect(posts.length).toBe(count);
        expect(myMessages()).toEqual([]);
    });

    test("only the signed-in account posts, and only its own profile", async () => {
        const count = posts.length;
        expect(await sharing.publishProfile("900000000000000001", { bio: "not me" })).toBe("failed");
        expect(await sharing.publishProfile("not an id", { bio: "x" })).toBe("failed");
        expect(posts.length).toBe(count);
    });

    test("the channel's slow mode: the save goes out once it may, and says when", async () => {
        me = "900000000000000001";
        mine = { id: me, data: { bio: "slow" } };
        failNextPost = { status: 429, body: { retry_after: 1 } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("later");
        expect(sharing.sharingRetryAt()).toBe(Date.now() + 3000);
        expect(myMessages().map(m => m.content)).toEqual([profile({ bio: "back" })]);
        await wait(3100);
        expect(myMessages().map(m => m.content)).toEqual([profile({ bio: "slow" })]);
        expect(sharing.sharingRetryAt()).toBe(0);
    });

    test("too long to share, even without the bio", async () => {
        const data = { username: "x", bio: "b".repeat(400), customBadgeIds: Array.from({ length: 40 }, (_, i) => `badge_${"n".repeat(60)}_${i}`) };
        expect(await sharing.publishProfile(me, data)).toBe("too-long");
    });
});

describe("before the server is joined", () => {
    test("a save isn't shared, and is once the server is joined, without waiting for the next start", async () => {
        me = "900000000000000003";
        member.delete(GUILD);
        mine = { id: me, data: { globalName: "Joiner" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("not-member");
        expect(myMessages()).toEqual([]);
        // Not the servers that arrive while Discord connects: those are covered by the timers set then
        await wait(21_000);
        member.add(GUILD);
        dispatch("GUILD_CREATE", { guild: { id: GUILD } });
        await wait(3500);
        expect(myMessages().map(m => m.content)).toEqual([profile({ globalName: "Joiner" })]);
    });

    test("joining reads the channel at once", async () => {
        const message = add(D, profile({ bio: "new D" }));
        void message;
        member.delete(GUILD);
        await wait(21_000);
        member.add(GUILD);
        dispatch("GUILD_CREATE", { guild: { id: GUILD } });
        await wait(2500);
        expect(sharing.getSharedProfile(D)).toEqual({ bio: "new D" });
    });

    test("the not-member notice is said once", async () => {
        expect(await sharing.takeNotMemberWarning()).toBe(true);
        expect(await sharing.takeNotMemberWarning()).toBe(false);
    });
});

describe("a profile saved before profiles were shared", () => {
    test("is never shared unasked, and asked about once", async () => {
        me = "900000000000000004";
        mine = { id: me, data: { globalName: "Older" } };
        offered = [];
        dispatch("CONNECTION_OPEN", {});
        await wait(21_000);
        expect(offered).toEqual([me]);
        expect(myMessages()).toEqual([]);
        dispatch("CONNECTION_OPEN", {});
        await wait(21_000);
        expect(offered).toEqual([me]);
        expect(myMessages()).toEqual([]);
    });

    test("an account without a profile isn't asked", async () => {
        me = "900000000000000005";
        mine = { id: me, data: null };
        offered = [];
        dispatch("CONNECTION_OPEN", {});
        await wait(21_000);
        expect(offered).toEqual([]);
    });
});

describe("taking a profile back when Discord can't be reached", () => {
    test("says it couldn't, leaves what was shared as it was, and takes it back the next time Discord connects", async () => {
        me = "900000000000000006";
        mine = { id: me, data: { bio: "visible" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        offline = true;
        mine = { id: me, data: null };
        expect(await sharing.publishProfile(me, null)).toBe("failed");
        expect(myMessages().map(m => m.content)).toEqual([profile({ bio: "visible" })]);
        offline = false;
        dispatch("CONNECTION_OPEN", {});
        await wait(21_000);
        expect(myMessages().map(m => m.content)).toEqual(["ecp1 {}"]);
        expect(sharing.getSharedProfile(me)).toBeNull();
    });

    test("a message that can't be deleted yet: the empty profile takes it back meanwhile, and it's deleted later", async () => {
        mine = { id: me, data: { bio: "again" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        const old = myMessages()[0].id;
        failDeletes = true;
        mine = { id: me, data: null };
        expect(await sharing.publishProfile(me, null)).toBe("published");
        expect(myMessages().map(m => m.content)).toEqual([profile({ bio: "again" }), "ecp1 {}"]);
        expect(sharing.getSharedProfile(me)).toBeNull();
        expect(JSON.parse(storage.get("ENDCORD_CUSTOM_PROFILE_PUBLISHED")!).accounts[me].o).toEqual([old]);
        failDeletes = false;
        const count = posts.length;
        dispatch("CONNECTION_OPEN", {});
        await wait(21_000);
        expect(myMessages().map(m => m.content)).toEqual(["ecp1 {}"]);
        expect(posts.length).toBe(count);
        expect(JSON.parse(storage.get("ENDCORD_CUSTOM_PROFILE_PUBLISHED")!).accounts[me].o).toBeUndefined();
    });

    test("a message that's gone already, removed by a moderator, counts as deleted", async () => {
        mine = { id: me, data: { bio: "removed" } };
        expect(await sharing.publishProfile(me, mine.data)).toBe("published");
        const removed = myMessages().find(m => m.content === profile({ bio: "removed" }))!.id;
        channel = channel.filter(m => m.id !== removed);
        mine = { id: me, data: null };
        expect(await sharing.publishProfile(me, null)).toBe("published");
        expect(deletes).toContain(removed);
        expect(JSON.parse(storage.get("ENDCORD_CUSTOM_PROFILE_PUBLISHED")!).accounts[me].o).toBeUndefined();
    });

    test("ids with leading zeros aren't message ids: one would count as newer than every real one", () => {
        expect(sharing.isMessageId("00000000000000000001")).toBe(false);
        expect(sharing.isMessageId("1234567890123456")).toBe(true);
    });
});

describe("stopping", () => {
    test("a question about sharing isn't asked once sharing stopped", async () => {
        me = "900000000000000007";
        mine = { id: me, data: { globalName: "Late" } };
        offered = [];
        let release = () => { };
        writesHeld = new Promise(resolve => release = resolve);
        dispatch("CONNECTION_OPEN", {});
        // The question waits for the phone to note it was asked; the plugin is turned off meanwhile
        await wait(20_500);
        sharing.stopSharing();
        writesHeld = null;
        release();
        await wait(1000);
        expect(offered).toEqual([]);
        await start();
    });

    test("takes the profiles out of memory and leaves nothing listening", async () => {
        sharing.stopSharing();
        expect(sharing.getSharedProfile(D)).toBeNull();
        expect([...handlers.values()].reduce((n, set) => n + set.size, 0)).toBe(0);
        // Nothing left to run either: a save the slow mode put off, a sync, a share
        const count = posts.length;
        await wait(15 * 60 * 1000, 60_000);
        expect(posts.length).toBe(count);
    });
});
