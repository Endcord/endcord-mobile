// Endcord PC's plugins for how messages show in the chat, on mobile: the logic that reads other people's
// messages, checked against PC's own where it was rewritten, and the patches that change what Discord decides
import { describe, expect, mock, test } from "bun:test";
import path from "path";

import { SRC } from "./src";

// Times are shown in the reader's zone: the tests read as someone in Istanbul (UTC+3 all year)
process.env.TZ = "Europe/Istanbul";

mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
mock.module(SRC + "plugins/api.ts", () => ({ definePlugin: (definition: any) => definition, onSettingChange: () => () => { } }));
// The patcher Endcord wraps, by its path: the tests' module paths send "spitroast" to an empty shim
const spitroast = require(path.resolve(import.meta.dir, "../node_modules/spitroast/dist/cjs.js"));
mock.module(SRC + "lib/api/patcher.ts", () => ({ after: spitroast.after, before: spitroast.before, instead: spitroast.instead }));
mock.module(SRC + "lib/api/assets/index.ts", () => ({ findAssetId: () => 1 }));
const toasts: string[] = [];
mock.module(SRC + "lib/ui/toasts.ts", () => ({ showToast: (text: string) => void toasts.push(text) }));

/** What the plugins under test find in Discord, set by each test */
const fakes: { stores: Record<string, any>; modules: Record<string, any>; RowManager?: any; me: string; } = { stores: {}, modules: {}, me: "1" };
mock.module(SRC + "metro/index.ts", () => ({
    findByName: (name: string) => name === "RowManager" ? fakes.RowManager : undefined,
    findByProps: () => undefined,
    findByStoreName: (name: string) => fakes.stores[name],
    findByFilePath: (path: string) => fakes.modules[path],
}));
mock.module(SRC + "plugins/common.tsx", () => ({
    currentUserId: () => fakes.me,
    getStore: (name: string) => fakes.stores[name],
    moduleAt: (path: string) => fakes.modules[path],
    guildRoles: (guildId: string) => fakes.stores.roles?.[guildId] ?? {},
    dispatchSoon: () => { },
}));
const hookCalls = { actions: [] as any[], redrawn: [] as string[], api: (_url: string): Promise<any> => Promise.resolve([]) };
mock.module(SRC + "plugins/hooks.tsx", () => ({
    addMessageAction: (action: any) => {
        hookCalls.actions.push(action);
        return () => void hookCalls.actions.splice(hookCalls.actions.indexOf(action), 1);
    },
    api: (_method: string, url: string) => hookCalls.api(url),
    describeError: (e: any) => String(e?.message ?? e?.status ?? e),
    getChannel: (id: string) => fakes.stores.ChannelStore?.getChannel?.(id),
    loadedMessages: () => [],
    messageLink: (channelId: string, messageId: string) => `https://discord.com/channels/@me/${channelId}/${messageId}`,
    onMessageRow: () => () => { },
    redrawChannel: () => { },
    redrawMessage: (_channelId: string, id: string) => void hookCalls.redrawn.push(id),
    toastError: (e: unknown) => void toasts.push(String(e)),
}));

const times = await import(SRC + "plugins/localTimes/times.ts");
const chain = await import(SRC + "plugins/replyChain/chain.ts");
const { repliedTo } = await import(SRC + "plugins/validReply/reply.ts");
const mentions = await import(SRC + "plugins/validUser/mentions.ts");
const ids = await import(SRC + "plugins/idTranslater/translate.ts");
const colors = await import(SRC + "plugins/messageColors/colors.ts");
const magnet = await import(SRC + "plugins/richMagnetLinks/magnet.ts");
const { colorize } = await import(SRC + "plugins/colorText/colorize.ts");
const mix = await import(SRC + "plugins/roleColorEverywhere/mix.ts");
const noUnblockToJump = (await import(SRC + "plugins/noUnblockToJump/index.ts")).default;
const validReply = (await import(SRC + "plugins/validReply/index.ts")).default;
const idTranslater = (await import(SRC + "plugins/idTranslater/index.ts")).default;
const validUser = (await import(SRC + "plugins/validUser/index.ts")).default;

let seed = 11;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

/** Starts a plugin with its settings' defaults; the returned function stops it */
function start(plugin: any, settings: Record<string, unknown> = {}) {
    const cleanups: Array<() => unknown> = [];
    const store = { ...Object.fromEntries(Object.entries(plugin.settings ?? {}).map(([k, v]: [string, any]) => [k, v.default])), ...settings };
    plugin.start({ store, logger: console, cleanup: (...fns: any[]) => cleanups.push(...fns.filter(f => typeof f === "function")) });
    return { store, stop: () => cleanups.reverse().forEach(f => f()) };
}

const timed = (fn: () => unknown) => {
    const started = performance.now();
    fn();
    return performance.now() - started;
};

// ---------------------------------------------------------------------------------------------------------------------
// LocalTimes, against PC's own findTimes (localTimes/index.tsx), which uses lookbehind
// ---------------------------------------------------------------------------------------------------------------------

const PC_NAMES = `UTC|GMT|${Object.keys(times.ZONES).sort((a, b) => b.length - a.length).join("|")}`;
const PC_TIME_RE = new RegExp(
    String.raw`(?<![\w:.])(\d{1,2})(?:[:.](\d{2}))?\s*([aApP])\.?[mM]\.?(?![a-zA-Z])\s*(${PC_NAMES})(?![a-zA-Z])` +
    String.raw`|(?<![\w:.])(\d{1,2})[:.](\d{2})\s*(${PC_NAMES})(?:\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?)?(?![\w])`,
    "g"
);
const PC_OFFSET_AFTER = /^\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?(?![\w])/;

function pcZoneOffset(zone: string, at: number) {
    const format = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    const parts = format.formatToParts(at);
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
    return Math.round((Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - Math.floor(at / 60000) * 60000) / 60000);
}

function pcResolve(hour: number, minute: number, zone: string | null, fixedOffset: number, sentAt: number) {
    const offsetAt = (at: number) => zone ? pcZoneOffset(zone, at) : fixedOffset;
    const day = new Date(sentAt + offsetAt(sentAt) * 60000);
    const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute);
    return wall - offsetAt(wall - offsetAt(wall) * 60000) * 60000;
}

function pcFindTimes(content: string, sentAt: number) {
    if (!/\d/.test(content)) return [];
    const text = content.replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/\S+/g, m => " ".repeat(m.length));
    const found: Array<{ text: string; at: number; }> = [];
    for (const m of text.matchAll(PC_TIME_RE)) {
        const twelveHour = m[1] != null;
        let hour = Number(twelveHour ? m[1] : m[5]);
        const minute = Number((twelveHour ? m[2] : m[6]) ?? 0);
        const name = (twelveHour ? m[4] : m[7]).toUpperCase();
        let sign = m[8], offH = m[9], offM = m[10];
        let written = m[0];
        if (twelveHour) {
            const after = PC_OFFSET_AFTER.exec(text.slice(m.index! + m[0].length));
            if (after) {
                [, sign, offH, offM] = after;
                written += after[0];
            }
            if (hour < 1 || hour > 12) continue;
            hour = hour % 12 + (m[3].toLowerCase() === "p" ? 12 : 0);
        } else if (hour > 23) continue;
        if (minute > 59) continue;
        const zone = times.ZONES[name] ?? null;
        let fixedOffset = 0;
        if (!zone && sign) {
            fixedOffset = (Number(offH) * 60 + Number(offM ?? 0)) * (sign === "-" ? -1 : 1);
            if (Math.abs(fixedOffset) > 14 * 60) continue;
        } else if (zone && sign) continue;
        const at = pcResolve(hour, minute, zone, fixedOffset, sentAt);
        if (new Date(at).getHours() === hour && new Date(at).getMinutes() === minute) continue;
        if (!found.some(f => f.at === at)) found.push({ text: written.trim(), at });
        if (found.length === 3) break;
    }
    return found;
}

describe("LocalTimes", () => {
    const sentAt = Date.UTC(2026, 10, 14, 12, 0);

    test("reads as someone in Istanbul", () => {
        expect(new Date(sentAt).getHours()).toBe(15);
    });

    test("finds the times people write, in the moment they mean", () => {
        expect(times.findTimes("let's meet at 8pm EST tomorrow", sentAt)).toEqual([{ text: "8pm EST", at: Date.UTC(2026, 10, 15, 1, 0) }]);
        expect(times.findTimes("stream at 14:00 UTC", sentAt)).toEqual([{ text: "14:00 UTC", at: Date.UTC(2026, 10, 14, 14, 0) }]);
        expect(times.findTimes("5pm UTC+1 or 9:30 p.m. PST", sentAt)).toEqual([
            { text: "5pm UTC+1", at: Date.UTC(2026, 10, 14, 16, 0) },
            { text: "9:30 p.m. PST", at: Date.UTC(2026, 10, 15, 5, 30) },
        ]);
        expect(times.findTimes("12am PST", sentAt)).toEqual([{ text: "12am PST", at: Date.UTC(2026, 10, 14, 8, 0) }]);
        // Summer time where the zone is, on the day the message was sent
        expect(times.findTimes("10:30 CEST", Date.UTC(2026, 6, 1, 6, 0))).toEqual([{ text: "10:30 CEST", at: Date.UTC(2026, 6, 1, 8, 30) }]);
    });

    test("leaves alone what isn't a time someone means", () => {
        for (const text of ["9:00 art class", "at 5pm UTC+3", "15:00 TRT", "8pm EST+2", "`8pm EST`", "```\n14:00 UTC\n```", "https://x.com/8pm EST", "13pm EST", "25:00 UTC",
            "10:75 UTC", "a8pm EST", "1.8pm EST", "8pm ESTX", "14:00 UTC+15", "no digits here"]) {
            expect(times.findTimes(text, sentAt)).toEqual([]);
        }
    });

    test("at most three, each moment once", () => {
        expect(times.findTimes("8pm EST, 8pm EST, 1am GMT, 2am GMT, 3am GMT, 4am GMT", sentAt).map(f => f.text)).toEqual(["8pm EST", "1am GMT", "2am GMT"]);
    });

    test("finds exactly what PC finds, on thousands of messages", () => {
        const words = ["8", "12", "5", "0", "23", "99", "8pm", "8:30", "14:00", "14.00", "9", ":", ".", " ", "  ", "\n", "pm", "PM", "a.m.", "p.m", "am", "x", "a",
            "EST", "UTC", "GMT", "CEST", "IST", "est", "art", "ART", "PST", "+", "-", "+3", "-05:30", "+0530", "+15", "`", "```", "http://a.b/", "ESTX", "_", "1"];
        const moments = [sentAt, Date.UTC(2026, 2, 8, 7, 30), Date.UTC(2026, 9, 25, 0, 30), Date.UTC(2026, 6, 1, 23, 59)];
        let withTimes = 0;
        for (let n = 0; n < 3000; n++) {
            const text = Array.from({ length: 1 + Math.floor(rand() * 10) }, () => pick(words)).join(rand() < 0.5 ? "" : " ");
            const at = pick(moments);
            const expected = pcFindTimes(text, at);
            if (expected.length) withTimes++;
            expect(times.findTimes(text, at)).toEqual(expected);
        }
        expect(withTimes).toBeGreaterThan(100);
    });

    test("a long message takes no time", () => {
        for (const text of [`8${" ".repeat(3990)}pm`, "1:".repeat(2000), "12:00 ".repeat(660), `${"`".repeat(3000)}8pm EST`, "8pm EST ".repeat(500)]) {
            expect(timed(() => times.findTimes(text, sentAt))).toBeLessThan(100);
        }
    });

    test("the offset of a zone on its clock", () => {
        expect(times.zoneOffset("America/New_York", sentAt)).toBe(-300);
        expect(times.zoneOffset("America/New_York", Date.UTC(2026, 6, 1))).toBe(-240);
        expect(times.zoneOffset("Asia/Kolkata", sentAt)).toBe(330);
        expect(times.zoneOffset("Mars/Olympus_Mons", sentAt)).toBeNaN();
    });

    test("the same offsets on an engine without formatToParts, even one that writes a 12 hour clock", () => {
        const proto = Intl.DateTimeFormat.prototype as any;
        const { formatToParts, format } = Object.getOwnPropertyDescriptors(proto);
        const cases: Array<[string, number]> = [["America/New_York", sentAt], ["Asia/Kolkata", Date.UTC(2026, 10, 14, 18, 45)], ["Pacific/Auckland", Date.UTC(2026, 10, 14, 11, 0)], ["Europe/London", Date.UTC(2026, 10, 14, 0, 30)]];
        const expected = cases.map(([zone, at]) => times.zoneOffset(zone, at));
        try {
            delete proto.formatToParts;
            expect(cases.map(([zone, at]) => times.zoneOffset(zone, at))).toEqual(expected);
            Object.defineProperty(proto, "format", {
                configurable: true,
                get() {
                    const { timeZone } = this.resolvedOptions();
                    return (at: number) => new Date(at).toLocaleString("en-US", { timeZone, hour12: true, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
                },
            });
            expect(cases.map(([zone, at]) => times.zoneOffset(zone, at))).toEqual(expected);
        } finally {
            Object.defineProperty(proto, "formatToParts", formatToParts);
            Object.defineProperty(proto, "format", format);
        }
        expect(times.zoneOffset("America/New_York", sentAt)).toBe(-300);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// ReplyChain and ValidReply
// ---------------------------------------------------------------------------------------------------------------------

describe("ReplyChain", () => {
    const reply = (id: string, to?: string, extra: Record<string, unknown> = {}) => ({
        id, channelId: "5", authorId: "1", name: "a", content: id, timestamp: 0, attachments: 0,
        reference: to ? { channel_id: "5", message_id: to } : undefined, ...extra,
    });

    test("only replies have a reference; forwards don't", () => {
        expect(chain.replyReference({ type: 19, channel_id: "5", messageReference: { channel_id: "5", message_id: "4" } })).toEqual({ channel_id: "5", message_id: "4", type: undefined });
        expect(chain.replyReference({ type: 19, channel_id: "5", message_reference: { message_id: "4", type: 0 } })).toEqual({ channel_id: "5", message_id: "4", type: 0 });
        expect(chain.replyReference({ type: 19, messageReference: { channel_id: "5", message_id: "4", type: 1 } })).toBeUndefined();
        expect(chain.replyReference({ type: 0, messageReference: { channel_id: "5", message_id: "4" } })).toBeUndefined();
        expect(chain.replyReference({ type: 19, messageReference: { channel_id: "../x", message_id: "4" } })).toBeUndefined();
        expect(chain.replyReference({ type: 19, messageReference: { channel_id: "5", message_id: "4?around=1" } })).toBeUndefined();
        expect(repliedTo({ type: 19, channel_id: "5", messageReference: { message_id: "4" } })).toEqual({ channelId: "5", messageId: "4" });
        expect(repliedTo({ type: 19, messageReference: { channel_id: "5", message_id: "4", type: 1 } })).toBeUndefined();
        expect(repliedTo({ type: 19, messageReference: { channel_id: "5", message_id: "<@1>" } })).toBeUndefined();
    });

    test("walks back to the first message, the first one first", async () => {
        const all: Record<string, any> = { 3: reply("3", "2"), 2: reply("2", "1"), 1: reply("1") };
        const steps: string[][] = [];
        const end = await chain.walkChain(reply("4", "3"), async ref => all[ref.message_id] ?? null, list => void steps.push(list.map(m => m.id)), () => false);
        expect(end).toBe("done");
        expect(steps.at(-1)).toEqual(["1", "2", "3", "4"]);
    });

    test("says why it stopped", async () => {
        const load = (all: Record<string, any>) => async (ref: any) => {
            if (all[ref.message_id] === "error") throw new Error("offline");
            return all[ref.message_id] ?? null;
        };
        expect(await chain.walkChain(reply("4", "3"), load({}), () => { }, () => false)).toBe("missing");
        expect(await chain.walkChain(reply("4", "3"), load({ 3: "error" }), () => { }, () => false)).toBe("failed");
        // A chain that goes round ends rather than looping
        expect(await chain.walkChain(reply("4", "3"), load({ 3: reply("3", "4"), 4: reply("4", "3") }), () => { }, () => false)).toBe("done");
        const long: Record<string, any> = {};
        for (let i = 1; i < 100; i++) long[i] = reply(String(i), String(i - 1));
        let loaded = 0;
        expect(await chain.walkChain(reply("100", "99"), async ref => (loaded++, long[ref.message_id]), () => { }, () => false)).toBe("long");
        expect(loaded).toBe(chain.MAX_DEPTH - 1);
        let stopped = false;
        expect(await chain.walkChain(reply("4", "3"), async ref => (stopped = true, long[ref.message_id]), () => { }, () => stopped)).toBe("stopped");
    });

    test("mentions read as names; long text is cut", () => {
        const names = { user: (id: string) => id === "1" ? "Ayşe" : undefined, channel: () => "general", role: () => "Mods" };
        expect(chain.readableMentions("hi <@1> <@!1> <@2> in <#3> for <@&4> <:wave:123> <a:dance:456>", names))
            .toBe("hi @Ayşe @Ayşe <@2> in #general for @Mods :wave: :dance:");
        expect(chain.shownText("a\n\n\n\n\nb")).toBe("a\n\nb");
        expect(chain.shownText("x".repeat(5000)).length).toBe(chain.MAX_TEXT);
        expect(chain.shownText(undefined)).toBe("");
    });
});

describe("ValidReply", () => {
    const STATES = { LOADED: 0, NOT_LOADED: 1, DELETED: 2, 0: "LOADED", 1: "NOT_LOADED", 2: "DELETED" };
    const replyTo = (id: string) => ({ id: "50", channel_id: "5", type: 19, messageReference: { channel_id: "5", message_id: id } });

    test("loads a reply Discord couldn't, and gives back Discord's answers when it stops", async () => {
        let emitted = 0;
        const store = {
            getMessage: (_channelId: string, messageId: string) => messageId === "7" ? { state: STATES.LOADED, message: { id: "7" } } : { state: STATES.NOT_LOADED },
            getMessageByReference(ref: any) {
                return this.getMessage(ref.channel_id, ref.message_id);
            },
            emitChange: () => void emitted++,
        };
        fakes.stores = { ReferencedMessageStore: store };
        fakes.modules = {
            "modules/replies/ReferencedMessageStore.tsx": { ReferencedMessageState: STATES },
            "modules/messages/MessageRecordUtils.tsx": { createMessageRecord: (raw: any) => ({ record: true, ...raw }) },
        };
        hookCalls.actions.length = 0;
        const { stop } = start(validReply);
        const [action] = hookCalls.actions;
        expect(action.visible(replyTo("8"))).toBe(true);
        expect(action.visible(replyTo("7"))).toBe(false);
        expect(action.visible({ ...replyTo("8"), type: 0 })).toBe(false);

        const asked: string[] = [];
        hookCalls.api = async url => (asked.push(url), [{ id: "8", content: "found", author: { id: "1" } }]);
        action.onPress(replyTo("8"));
        await new Promise(r => setTimeout(r, 10));
        expect(asked).toEqual(["/channels/5/messages?limit=1&around=8"]);
        expect(store.getMessageByReference({ channel_id: "5", message_id: "8" })).toEqual({ state: STATES.LOADED, message: { record: true, id: "8", content: "found", author: { id: "1" } } });
        expect(store.getMessage("5", "8").state).toBe(STATES.LOADED);
        expect(action.visible(replyTo("8"))).toBe(false);
        expect(emitted).toBe(1);

        // Gone: Discord answers with the message after it
        hookCalls.api = async () => [{ id: "10", author: { id: "1" } }];
        action.onPress(replyTo("9"));
        await new Promise(r => setTimeout(r, 10));
        expect(store.getMessage("5", "9")).toEqual({ state: STATES.DELETED });
        // What Discord has itself stays its own
        expect(store.getMessage("5", "7").message).toEqual({ id: "7" });

        stop();
        expect(store.getMessage("5", "8")).toEqual({ state: STATES.NOT_LOADED });
        expect(store.getMessageByReference({ channel_id: "5", message_id: "9" })).toEqual({ state: STATES.NOT_LOADED });
        expect(hookCalls.actions.length).toBe(0);
    });

    test("doesn't start without Discord's reply states", () => {
        fakes.modules = {};
        expect(() => start(validReply)).toThrow();
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// ValidUser and NoUnblockToJump
// ---------------------------------------------------------------------------------------------------------------------

describe("ValidUser", () => {
    test("the unknown people a message mentions, each once", () => {
        const known = (id: string) => id === "111111111111111111";
        expect(mentions.unknownMentions("<@111111111111111111> <@222222222222222222> <@!222222222222222222> <@333333333333333333> <@&444444444444444444> <#555555555555555555>", known))
            .toEqual(["222222222222222222", "333333333333333333"]);
        expect(mentions.unknownMentions("no mentions", known)).toEqual([]);
        expect(mentions.unknownMentions(undefined, known)).toEqual([]);
        const many = Array.from({ length: 50 }, (_, i) => `<@1000000000000000${String(i).padStart(2, "0")}>`).join(" ");
        expect(mentions.unknownMentions(many, () => false).length).toBe(mentions.MAX_LOOKUPS);
        expect(timed(() => mentions.unknownMentions(`<@${"1".repeat(4000)}`, () => false))).toBeLessThan(50);
    });

    test("waits as long as Discord asks, within reason", () => {
        expect(mentions.retryDelay({ body: { retry_after: 1.5 } })).toBe(1500);
        expect(mentions.retryDelay({ body: { retry_after: 600 } })).toBe(10_000);
        expect(mentions.retryDelay({ body: { retry_after: "x" } })).toBe(1000);
        expect(mentions.retryDelay(undefined)).toBe(1000);
    });
});

describe("ValidUser's lookups", () => {
    test("looks up each unknown person once, waits when Discord asks, and draws the message again", async () => {
        const users = new Set(["111111111111111111"]);
        const asked: string[] = [];
        let limited = false;
        fakes.stores = { UserStore: { getUser: (id: string) => users.has(id) ? { id } : undefined } };
        fakes.modules = {
            "actions/UserActionCreators.tsx": {
                getUser: async (id: string) => {
                    asked.push(id);
                    if (id === "333333333333333333" && !limited) {
                        limited = true;
                        throw { status: 429, body: { retry_after: 0.01 } };
                    }
                    if (id === "444444444444444444") throw { status: 404 };
                    users.add(id);
                    return { id };
                },
            },
        };
        hookCalls.actions.length = 0;
        hookCalls.redrawn.length = 0;
        toasts.length = 0;
        const { stop } = start(validUser);
        const [action] = hookCalls.actions;
        const message = { id: "60", channel_id: "5", content: "<@111111111111111111> <@222222222222222222> <@333333333333333333> <@444444444444444444> <@222222222222222222>" };
        expect(action.visible(message)).toBe(true);
        await action.onPress(message);
        expect(asked).toEqual(["222222222222222222", "333333333333333333", "333333333333333333", "444444444444444444"]);
        expect(hookCalls.redrawn).toEqual(["60"]);
        expect(toasts).toEqual(["Some of the people mentioned don't have an account anymore"]);
        expect(action.visible({ ...message, content: "<@222222222222222222> <@333333333333333333>" })).toBe(false);
        stop();
        expect(hookCalls.actions.length).toBe(0);
    });
});

describe("NoUnblockToJump", () => {
    test("Discord's jump check lets blocked, ignored and spam messages through, and only it", () => {
        const relationships = {
            blocked: new Set(["9"]),
            isBlocked(id: string) {
                return this.blocked.has(id);
            },
            isIgnored: (id: string) => id === "8",
            isBlockedForMessage(message: any) {
                return this.isBlocked(message.author.id);
            },
            isIgnoredForMessage(message: any) {
                return this.isIgnored(message.author.id);
            },
        };
        const spam = { isSpam: (message: any) => message.spam === true };
        const check = {
            default: (message: any) => !relationships.isBlockedForMessage(message) && !relationships.isIgnoredForMessage(message) && !spam.isSpam(message) && message.reachable !== false,
        };
        fakes.stores = { RelationshipStore: relationships };
        fakes.modules = { "modules/messages/validateJumpWithAlert.tsx": check, "modules/messages/isSpam.tsx": spam };
        const blocked = { author: { id: "9" } }, ignored = { author: { id: "8" } }, spammy = { author: { id: "7" }, spam: true };

        expect([blocked, ignored, spammy].map(m => check.default(m))).toEqual([false, false, false]);
        const { stop } = start(noUnblockToJump);
        expect([blocked, ignored, spammy].map(m => check.default(m))).toEqual([true, true, true]);
        // The rest of what Discord checks still applies
        expect(check.default({ author: { id: "9" }, reachable: false })).toBe(false);
        // Blocking is unchanged everywhere else
        expect(relationships.isBlocked("9")).toBe(true);
        expect(relationships.isBlockedForMessage(blocked)).toBe(true);
        expect(spam.isSpam(spammy)).toBe(true);
        stop();
        expect([blocked, ignored, spammy].map(m => check.default(m))).toEqual([false, false, false]);
    });

    test("doesn't start without Discord's jump check", () => {
        fakes.modules = {};
        fakes.stores = { RelationshipStore: { isBlockedForMessage: () => false } };
        expect(() => start(noUnblockToJump)).toThrow();
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// ID Translater, against PC's own translateIds (idTranslater/index.tsx)
// ---------------------------------------------------------------------------------------------------------------------

function pcTranslateIds(content: string, kinds: any, lookup: any): string {
    if (!content) return content;
    if (content.includes("<@") || content.includes("<#")) return content;
    if (!kinds.users && !kinds.channels && !kinds.roles && !kinds.messages) return content;
    const idRegex = new RegExp(`\\b\\d{${kinds.minLength},${kinds.maxLength}}\\b`, "g");
    let translated = content;
    const processed = new Map<string, string>();
    const matches: Array<{ id: string; index: number; }> = [];
    let match;
    while ((match = idRegex.exec(content)) !== null) {
        const id = match[0];
        const { index } = match;
        if (ids.isIdInContext(content, id, index)) continue;
        if (processed.has(id)) continue;
        let replacement: string | null = null;
        if (kinds.users && lookup.isUser(id)) replacement = `<@${id}>`;
        else if (kinds.channels && lookup.isChannel(id)) replacement = `<#${id}>`;
        else if (kinds.roles && lookup.isRole(id)) replacement = `<@&${id}>`;
        else if (kinds.messages) replacement = lookup.messageLink(id);
        if (replacement) {
            processed.set(id, replacement);
            matches.push({ id, index });
        }
    }
    matches.reverse().forEach(({ id, index }) => {
        translated = translated.substring(0, index) + processed.get(id)! + translated.substring(index + id.length);
    });
    return translated;
}

describe("ID Translater", () => {
    const USER = "111111111111111111", CHANNEL = "222222222222222222", ROLE = "333333333333333333", OTHER = "444444444444444444";
    const lookup = {
        isUser: (id: string) => id === USER,
        isChannel: (id: string) => id === CHANNEL,
        isRole: (id: string) => id === ROLE,
        messageLink: (id: string) => `https://discord.com/channels/@me/5/${id}`,
    };
    const all = { users: true, channels: true, roles: true, messages: false, minLength: 17, maxLength: 19 };

    test("translates IDs as PC does", () => {
        expect(ids.translateIds(`ask ${USER} in ${CHANNEL}, ping ${ROLE}; ${OTHER}`, all, lookup))
            .toBe(`ask <@${USER}> in <#${CHANNEL}>, ping <@&${ROLE}>; ${OTHER}`);
        expect(ids.translateIds(`${OTHER}`, { ...all, messages: true }, lookup)).toBe(`https://discord.com/channels/@me/5/${OTHER}`);
        // Only the first time each one is written, as on PC
        expect(ids.translateIds(`${USER} and ${USER}`, all, lookup)).toBe(`<@${USER}> and ${USER}`);
        // Already a mention, a link, or next to @ or #
        for (const text of [`<@${USER}> ${CHANNEL}`, `https://x.com/${USER}`, `@${USER}`, `#${USER}`, `${USER}@`, `a.${USER}`, `x${USER}`]) {
            expect(ids.translateIds(text, all, lookup)).toBe(text);
        }
        expect(ids.translateIds(`${USER}`, { ...all, users: false }, lookup)).toBe(USER);
    });

    test("code keeps its IDs", () => {
        expect(ids.translateIds(`\`${USER}\` ${USER}`, all, lookup)).toBe(`\`${USER}\` <@${USER}>`);
        expect(ids.translateIds(`\`\`\`\n${CHANNEL}\n\`\`\``, all, lookup)).toBe(`\`\`\`\n${CHANNEL}\n\`\`\``);
    });

    test("the same as PC on thousands of messages without code", () => {
        const words = [USER, CHANNEL, ROLE, OTHER, "1234", "12345678901234567890", " ", "  ", ".", ":", "/", "@", "#", "<@", "<#", ">", "x", "\n", "1", "<@&"];
        let changed = 0;
        for (let n = 0; n < 3000; n++) {
            const text = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => pick(words)).join(rand() < 0.5 ? "" : " ");
            const kinds = { ...all, messages: rand() < 0.3 };
            const expected = pcTranslateIds(text, kinds, lookup);
            if (expected !== text) changed++;
            expect(ids.translateIds(text, kinds, lookup)).toBe(expected);
        }
        expect(changed).toBeGreaterThan(300);
    });

    test("lengths stay where Discord's IDs are, whatever the settings say", () => {
        expect(ids.translateIds("123456789012345", { ...all, messages: true, minLength: 1, maxLength: 2 }, lookup)).toBe("https://discord.com/channels/@me/5/123456789012345");
        expect(ids.translateIds("12", { ...all, messages: true, minLength: 1, maxLength: 2 }, lookup)).toBe("12");
        expect(ids.translateIds(USER, { ...all, minLength: 19, maxLength: 17 }, lookup)).toBe(`<@${USER}>`);
        expect(timed(() => ids.translateIds("1".repeat(3999), { ...all, messages: true }, lookup))).toBeLessThan(50);
    });

    test("rows are built from the translated text; the message itself stays", () => {
        class RowManager {
            generate(options: any) {
                return { type: 1, message: { content: options.message.content, id: options.message.id } };
            }
        }
        fakes.RowManager = RowManager;
        fakes.me = "1";
        fakes.stores = { UserStore: { getUser: (id: string) => id === USER ? { id } : undefined }, ChannelStore: { getChannel: () => ({ guild_id: "9" }) } };
        const record = (content: string, author = "2") => ({
            id: "50", channel_id: "5", content, author: { id: author },
            set(key: string, value: unknown) {
                return { ...this, [key]: value };
            },
        });
        const { stop } = start(idTranslater);
        const rows = new RowManager();
        const message = record(`hi ${USER}`);
        expect(rows.generate({ rowType: 1, message }).message.content).toBe(`hi <@${USER}>`);
        expect(message.content).toBe(`hi ${USER}`);
        // Your own messages, unless asked; rows that aren't messages
        expect(rows.generate({ rowType: 1, message: record(`hi ${USER}`, "1") }).message.content).toBe(`hi ${USER}`);
        expect(rows.generate({ rowType: 3, message }).message.content).toBe(`hi ${USER}`);
        stop();
        expect(rows.generate({ rowType: 1, message }).message.content).toBe(`hi ${USER}`);
    });

    test("a translated row Discord can't build is drawn as the message was sent, and isn't tried again", () => {
        let built = 0;
        class RowManager {
            generate(options: any) {
                built++;
                if (options.message.content.includes("<@")) throw new Error("no row for that mention");
                return { type: 1, message: { content: options.message.content, id: options.message.id } };
            }
        }
        fakes.RowManager = RowManager;
        fakes.me = "1";
        fakes.stores = { UserStore: { getUser: (id: string) => id === USER ? { id } : undefined }, ChannelStore: { getChannel: () => ({ guild_id: "9" }) } };
        const record = (content: string) => ({
            id: "51", channel_id: "5", content, author: { id: "2" },
            set(key: string, value: unknown) {
                return { ...this, [key]: value };
            },
        });
        const errors: unknown[][] = [];
        const consoleError = console.error;
        console.error = (...args: unknown[]) => void errors.push(args);
        try {
            const { stop } = start(idTranslater);
            const rows = new RowManager();
            const message = record(`hi ${USER}`);
            expect(rows.generate({ rowType: 1, message }).message.content).toBe(`hi ${USER}`);
            expect(built).toBe(2);
            expect(errors.length).toBe(1);
            // From then on it's drawn as sent at once, without a second failure or log line
            expect(rows.generate({ rowType: 1, message }).message.content).toBe(`hi ${USER}`);
            expect(built).toBe(3);
            expect(errors.length).toBe(1);
            stop();
        } finally {
            console.error = consoleError;
        }
    });

    test("a row Discord can't build at all still fails as it would without the plugin", () => {
        class RowManager {
            generate(): any {
                throw new Error("Discord's own failure");
            }
        }
        fakes.RowManager = RowManager;
        fakes.stores = { UserStore: { getUser: (id: string) => id === USER ? { id } : undefined }, ChannelStore: { getChannel: () => ({ guild_id: "9" }) } };
        const consoleError = console.error;
        console.error = () => { };
        try {
            const { stop } = start(idTranslater);
            const message = { id: "52", channel_id: "5", content: `hi ${USER}`, author: { id: "2" }, set(key: string, value: unknown) { return { ...this, [key]: value }; } };
            expect(() => new RowManager().generate({ rowType: 1, message })).toThrow("Discord's own failure");
            stop();
        } finally {
            console.error = consoleError;
        }
    });
});

const unreadMarkdown = await import(SRC + "plugins/unreadCountBadge/markdown.ts");

describe("UnreadCountBadge", () => {
    test("DM names in /unread's answer show as written, without links, mentions or formatting", () => {
        const { escapeMarkdown } = unreadMarkdown;
        expect(escapeMarkdown("Ayşe, Bob")).toBe("Ayşe, Bob");
        // A group DM name anyone in it can set
        expect(escapeMarkdown("[Verify your account](https://example.com/login)")).toBe("\\[Verify your account\\]\\(https\\://example.com/login\\)");
        expect(escapeMarkdown("@everyone <@&1> ||x|| *y* _z_ ~~w~~ `v`")).toBe("\\@everyone \\<\\@&1\\> \\|\\|x\\|\\| \\*y\\* \\_z\\_ \\~\\~w\\~\\~ \\`v\\`");
        expect(escapeMarkdown("# big\n> quote\u2028- list")).toBe("\\# big \\> quote \\- list");
        expect(escapeMarkdown("back\\slash")).toBe("back\\\\slash");
        expect(escapeMarkdown(null)).toBe("");
    });

    test("it escapes the same characters as VolumeBooster's own copy", async () => {
        const volume = await import(SRC + "plugins/volumeBooster/logic.ts");
        const sample = "[a](b) <@1> @here #x -y >z *_~|`\\ :q: \n\u0007";
        expect(unreadMarkdown.escapeMarkdown(sample)).toBe(volume.escapeMarkdown(sample));
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// MessageColors and RichMagnetLinks
// ---------------------------------------------------------------------------------------------------------------------

describe("MessageColors", () => {
    test("finds the color codes PC finds", () => {
        const found = (text: string, short = true) => colors.findColors(text, short).map((c: any) => [c.text, c.rgb]);
        expect(found("#FF0042 and #39f")).toEqual([["#FF0042", [255, 0, 66]], ["#39f", [51, 153, 255]]]);
        expect(found("#39f", false)).toEqual([]);
        expect(found("rgb(255, 0, 0) rgba(0 128 0 / 0.5) hsl(240, 100%, 50%) HSL(0°, 0%, 100%)")).toEqual([
            ["rgb(255, 0, 0)", [255, 0, 0]], ["rgba(0 128 0 / 0.5)", [0, 128, 0]], ["hsl(240, 100%, 50%)", [0, 0, 255]], ["HSL(0°, 0%, 100%)", [255, 255, 255]],
        ]);
        // Codes that run on, and brackets that aren't colors
        expect(found("#1234 #ff00ff99 rgb(1,2) rgba(1,2,3) hsl(1,2,3,4) rgb(a,b,c) issue#12")).toEqual([]);
    });

    test("the nearest square", () => {
        const square = (hex: string) => colors.nearestSquare(colors.findColors(hex, true)[0].rgb);
        expect(["#FF0042", "#ff0000", "#ff8800", "#ffee00", "#00ff00", "#0000ff", "#5865F2", "#9b59b6", "#8b4513", "#000000", "#ffffff", "#808080", "#333", "#ff69b4"].map(square))
            .toEqual(["🟥", "🟥", "🟧", "🟨", "🟩", "🟦", "🟦", "🟪", "🟫", "⬛", "⬜", "⬜", "⬛", "🟥"]);
    });

    test("squares beside each code, on the side chosen", () => {
        expect(colors.withSquares("use #ff0000 or #00f", true, "right")).toBe("use #ff0000 🟥 or #00f 🟦");
        expect(colors.withSquares("#ff0000!", true, "left")).toBe("🟥 #ff0000!");
        expect(colors.withSquares("#ff0000", true, "both")).toBe("🟥 #ff0000 🟥");
        expect(colors.withSquares("nothing", true, "right")).toBe("nothing");
    });

    test("links and mentions keep their text; the rest is changed where it is", () => {
        const nodes = [
            { type: "text", content: "#f00 " },
            { type: "strong", content: [{ type: "text", content: "#0f0" }] },
            { type: "link", target: "https://x.com/#fff", content: [{ type: "text", content: "x.com/#fff" }] },
            { type: "channelMention", channelId: "1", content: [{ type: "text", content: "#abc" }] },
            { type: "inlineCode", content: "#00f" },
        ];
        const out = colors.mapText(nodes, (text: string) => colors.withSquares(text, true, "right"));
        expect(out.map((n: any) => JSON.stringify(n.content))).toEqual([
            JSON.stringify("#f00 🟥 "), JSON.stringify([{ type: "text", content: "#0f0 🟩" }]),
            JSON.stringify(nodes[2].content), JSON.stringify(nodes[3].content), JSON.stringify("#00f"),
        ]);
        // Nothing to change: the same nodes, so nothing is drawn again for it
        expect(colors.mapText(nodes.slice(2), (text: string) => colors.withSquares(text, true, "right"))).toEqual(nodes.slice(2));
    });

    test("a long message takes no time", () => {
        for (const text of [`rgb(${" ".repeat(3990)}`, "rgb(".repeat(1000), `#${"f".repeat(3999)}`, "#fff ".repeat(800), `hsl(1,${" ,".repeat(1900)}`]) {
            expect(timed(() => colors.withSquares(text, true, "both"))).toBeLessThan(100);
        }
    });
});

describe("RichMagnetLinks", () => {
    const link = "magnet:?xt=urn:btih:c12fe1c06bba254a9dc9f519b335aa7c1367a88a&dn=Ubuntu+24.04+Desktop%20(amd64).iso&tr=udp%3A%2F%2Ftracker";

    test("the file's name, as text that's safe to show", () => {
        expect(magnet.magnetName(link)).toBe("Ubuntu 24.04 Desktop (amd64).iso");
        expect(magnet.magnetName("magnet:?xt=urn:btih:abc")).toBeUndefined();
        expect(magnet.magnetName("magnet:?DN=Bad%E0%A4%A")).toBe("Bad%E0%A4%A");
        expect(magnet.magnetName("magnet:?dn=a%0Ab%E2%80%AEgpj.exe")).toBe("a b gpj.exe");
        expect(magnet.magnetName(`magnet:?dn=${"x".repeat(500)}`)!.length).toBe(120);
        expect(magnet.magnetName("magnet:?dn=%20%20")).toBeUndefined();
    });

    test("links in messages are shown short and found for copying", () => {
        expect(magnet.shortenMagnets(`get ${link} now`, "unknown filename")).toBe("get 🧲 Ubuntu 24.04 Desktop (amd64).iso now");
        expect(magnet.shortenMagnets("magnet:?xt=urn:btih:abc", "unknown filename")).toBe("🧲 unknown filename");
        expect(magnet.magnetLinks(`${link} ${link} magnet:?xt=2`)).toEqual([link, "magnet:?xt=2"]);
        expect(magnet.magnetLinks("no links")).toEqual([]);
        expect(timed(() => magnet.shortenMagnets(`magnet:?${"&dn=".repeat(1000)}`, "?"))).toBeLessThan(50);
    });
});

// ---------------------------------------------------------------------------------------------------------------------
// ColorText and RoleColorEverywhere
// ---------------------------------------------------------------------------------------------------------------------

describe("ColorText", () => {
    const ESC = String.fromCharCode(27);

    test("writes PC's colored code block", () => {
        expect(colorize("hi\nthere", "red", "navy", "bold")).toBe(`\`\`\`ansi\n${ESC}[1;31;40mhi${ESC}[0m\n${ESC}[1;31;40mthere${ESC}[0m\n\`\`\``);
        expect(colorize("plain", "nope", "nope", "nope")).toBe(`\`\`\`ansi\n${ESC}[0;37mplain${ESC}[0m\n\`\`\``);
        // Names that every object has aren't colors
        expect(colorize("x", "constructor", "__proto__", "toString")).toBe(`\`\`\`ansi\n${ESC}[0;37mx${ESC}[0m\n\`\`\``);
    });

    test("backticks can't end the block early", () => {
        const out = colorize("a ``` b", "green");
        expect(out.slice(3).includes("```\n")).toBe(false);
        expect(out.split("```").length).toBe(3);
    });
});

describe("RoleColorEverywhere", () => {
    test("mixes like CSS's color-mix in oklab", () => {
        const red: [number, number, number] = [255, 0, 0], text: [number, number, number] = [219, 222, 225];
        expect(mix.mixColors(red, text, 0)).toEqual(text);
        expect(mix.mixColors(red, text, 100)).toEqual(red);
        // Halfway is between the two, and a color mixed with itself stays the same
        const half = mix.mixColors(red, [255, 255, 255], 50);
        expect(half[0]).toBe(255);
        expect(half[1]).toBeGreaterThan(0);
        expect(half[1]).toBeLessThan(255);
        expect(mix.mixColors(text, text, 37)).toEqual(text);
        for (let n = 0; n < 500; n++) {
            const color: [number, number, number] = [0, 0, 0].map(() => Math.floor(rand() * 256)) as any;
            expect(mix.fromOklab(mix.toOklab(color))).toEqual(color);
        }
    });

    test("reads Discord's colors", () => {
        expect(mix.parseHex("#5865F2")).toEqual([88, 101, 242]);
        expect(mix.parseHex("#abc")).toEqual([170, 187, 204]);
        expect(mix.parseHex("red")).toBeUndefined();
        expect(mix.parseHex(null)).toBeUndefined();
        expect(mix.fromPacked(-10921638)).toEqual([89, 89, 90]);
        expect(mix.fromPacked(0xff5865f2 | 0)).toEqual([88, 101, 242]);
        expect(mix.fromPacked(undefined)).toBeUndefined();
        expect(mix.toHex([1, 2, 255])).toBe("#0102ff");
    });
});
