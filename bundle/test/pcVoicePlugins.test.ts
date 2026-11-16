// The pure parts of the voice, call and notification plugins ported from Endcord PC: what they
// decide from other people's messages and voice states, and the limits they keep
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";

const volume = await import(SRC + "plugins/volumeBooster/logic.ts");

describe("VolumeBooster", () => {
    test("keys hold only a known context and an ID", () => {
        expect(volume.parseBoostKey(volume.boostKey("123456789012345678", "stream"))).toEqual({ userId: "123456789012345678", context: "stream" });
        for (const bad of ["", "default", ":123456789012345678", "voice:123456789012345678", "default:abc", "default:12", "__proto__:123456789012345678", "default:123456789012345678:x"]) {
            expect(volume.parseBoostKey(bad)).toBeUndefined();
        }
    });

    test("volumes stay between 0 and 200% times the multiplier", () => {
        expect(volume.maxVolume(2)).toBe(400);
        expect(volume.maxVolume(5)).toBe(1000);
        expect(volume.maxVolume(0)).toBe(200);
        expect(volume.maxVolume(99)).toBe(1000);
        expect(volume.maxVolume(NaN)).toBe(400);
        expect(volume.clampVolume(350, 2)).toBe(350);
        expect(volume.clampVolume(9999, 2)).toBe(400);
        expect(volume.clampVolume(-5, 2)).toBe(0);
        expect(volume.clampVolume(NaN, 2)).toBe(100);
        expect(volume.clampVolume(250.6, 1.5)).toBe(251);
    });

    test("only boosts above Discord's own maximum are kept, and never more than the limit", () => {
        let boosts: Record<string, number> = {};
        boosts = volume.withBoost(boosts, "default:123456789012345678", 300, 2);
        boosts = volume.withBoost(boosts, "stream:123456789012345678", 150, 2);
        boosts = volume.withBoost(boosts, "bad", 300, 2);
        expect(boosts).toEqual({ "default:123456789012345678": 300 });
        boosts = volume.withBoost(boosts, "default:123456789012345678", undefined, 2);
        expect(boosts).toEqual({});
        const id = (i: number) => `1${String(i).padStart(17, "0")}`;
        for (let i = 0; i < volume.MAX_BOOSTS + 20; i++) boosts = volume.withBoost(boosts, `default:${id(i)}`, 300, 2);
        const kept = Object.keys(boosts);
        expect(kept.length).toBe(volume.MAX_BOOSTS);
        // The newest are the ones kept
        expect(kept.at(-1)).toBe(`default:${id(volume.MAX_BOOSTS + 19)}`);
        expect(kept[0]).toBe(`default:${id(20)}`);
        expect(Object.getPrototypeOf(boosts)).toBe(Object.prototype);
    });

    test("saved boosts are read carefully: a lower multiplier lowers them, junk is dropped", () => {
        const raw = JSON.parse("{\"default:123456789012345678\": 900, \"stream:223456789012345678\": \"loud\", \"__proto__\": 500, \"default:323456789012345678\": 120}");
        expect(volume.validBoosts(raw, 2)).toEqual([["default:123456789012345678", 400]]);
        expect(volume.validBoosts(raw, 1)).toEqual([]);
        expect(volume.validBoosts(null, 2)).toEqual([]);
        expect(volume.validBoosts([1, 2], 2)).toEqual([]);
    });

    test("a boost given to the connections gets Discord's volume back once it no longer stands", () => {
        const A = "default:123456789012345678", B = "stream:223456789012345678";
        const nobodyMuted = () => false;
        // Every standing boost goes on again (Discord may have handed a connection its own volume); an ended one goes back
        expect(volume.boostChanges(new Set([A, B]), [[A, 400]], nobodyMuted)).toEqual({ apply: [[A, 400]], restore: [B] });
        expect(volume.boostChanges([], [[A, 400], [B, 300]], nobodyMuted)).toEqual({ apply: [[A, 400], [B, 300]], restore: [] });
        // Someone muted for you is left as they are: not boosted, and not given back either while the boost stands
        expect(volume.boostChanges([A], [[A, 400]], key => key === A)).toEqual({ apply: [], restore: [] });
        // A boost to 1000% with a multiplier of 5, then the multiplier lowered to 1: the boost no longer stands, so the
        // connection gets Discord's own volume back rather than staying at 1000%
        const saved = volume.withBoost({}, A, volume.clampVolume(1000, 5), 5);
        expect(volume.boostChanges([A], volume.validBoosts(saved, 1), nobodyMuted)).toEqual({ apply: [], restore: [A] });
        // Lowered to 2: it stands, at the new maximum
        expect(volume.boostChanges([A], volume.validBoosts(saved, 2), nobodyMuted)).toEqual({ apply: [[A, 400]], restore: [] });
    });

    test("names in the command's answers show as written, without markdown, links or mentions", () => {
        expect(volume.escapeMarkdown("Ayşe")).toBe("Ayşe");
        expect(volume.escapeMarkdown("[Free Nitro](https://example.com/x)")).toBe("\\[Free Nitro\\]\\(https\\://example.com/x\\)");
        expect(volume.escapeMarkdown("**loud** __u__ ~~s~~ ||spoiler|| `code`")).toBe("\\*\\*loud\\*\\* \\_\\_u\\_\\_ \\~\\~s\\~\\~ \\|\\|spoiler\\|\\| \\`code\\`");
        expect(volume.escapeMarkdown("@everyone <@123456789012345678> <#1> # Title\n> quote\r\n- item")).toBe("\\@everyone \\<\\@123456789012345678\\> \\<\\#1\\> \\# Title \\> quote \\- item");
        expect(volume.escapeMarkdown("a\\*b")).toBe("a\\\\\\*b");
        expect(volume.escapeMarkdown(undefined)).toBe("");
        expect(volume.escapeMarkdown(42)).toBe("42");
    });

    test("no markdown character is left unescaped, whatever the name", () => {
        const special = "\\*_~|`>[]()<#@:-";
        const alphabet = [...special, "a", " ", "\n", "\u2028", "ş", "😀", "\\\\"];
        let seed = 7;
        const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        for (let n = 0; n < 3000; n++) {
            const name = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
            const out = volume.escapeMarkdown(name);
            expect(/[\n\r\u2028\u2029]/.test(out)).toBe(false);
            // Read as Discord's escape rule does: a backslash takes the character after it as it is
            for (let i = 0; i < out.length; i++) {
                if (out[i] === "\\") i++;
                else expect(special.includes(out[i])).toBe(false);
            }
        }
    });
});

const notifier = await import(SRC + "plugins/messageNotifier/logic.ts");

describe("MessageNotifier", () => {
    const wanted = notifier.userIds(" 123456789012345678, 223456789012345678 ,nope,,12 ");
    const message = (over: Record<string, unknown> = {}) => ({ type: 0, channel_id: "900000000000000001", author: { id: "123456789012345678" }, ...over });

    test("the list keeps only user IDs", () => {
        expect([...wanted]).toEqual(["123456789012345678", "223456789012345678"]);
        expect(notifier.userIds("").size).toBe(0);
        expect(notifier.userIds(undefined as any).size).toBe(0);
        // A pasted wall of text costs no more than its first part
        expect(notifier.userIds("1".repeat(1_000_000)).size).toBe(0);
    });

    test("messages and replies from chosen people, outside the open chat", () => {
        expect(notifier.shouldNotify(message(), wanted, "1", undefined)).toBe(true);
        expect(notifier.shouldNotify(message({ type: 19 }), wanted, "1", undefined)).toBe(true);
        expect(notifier.shouldNotify(message({ type: undefined }), wanted, "1", undefined)).toBe(true);
        expect(notifier.shouldNotify(message(), wanted, "1", "900000000000000001")).toBe(false);
        expect(notifier.shouldNotify(message({ type: 7 }), wanted, "1", undefined)).toBe(false);
        expect(notifier.shouldNotify(message({ author: { id: "999999999999999999" } }), wanted, "1", undefined)).toBe(false);
        expect(notifier.shouldNotify(message(), wanted, "123456789012345678", undefined)).toBe(false);
        expect(notifier.shouldNotify(message({ author: undefined }), wanted, "1", undefined)).toBe(false);
        expect(notifier.shouldNotify(null, wanted, "1", undefined)).toBe(false);
    });
});

const bypass = await import(SRC + "plugins/bypassStatus/logic.ts");

describe("BypassStatus", () => {
    const ME = "100000000000000001", FRIEND = "200000000000000002", OTHER = "300000000000000003";
    const DM = "400000000000000004", GUILD = "500000000000000005", CHANNEL = "600000000000000006", ROLE = "700000000000000007";
    const input = (message: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
        message: { content: "hi", author: { id: FRIEND }, channel_id: CHANNEL, ...message },
        channel: { id: CHANNEL, type: 0, guild_id: GUILD },
        guildId: GUILD,
        status: "dnd",
        statusToUse: "dnd",
        viewingChannelId: undefined,
        lists: { guilds: new Set<string>(), channels: new Set<string>(), users: new Set<string>() },
        allowOutsideOfDms: false,
        respectSilentPings: true,
        mention: { me: ME, myRoles: [ROLE] },
        ...over,
    });

    test("lists are read and written like PC's", () => {
        expect([...bypass.idSet(`${FRIEND},  ${OTHER} junk ${FRIEND}`)]).toEqual([FRIEND, OTHER]);
        expect(bypass.toggleId("", FRIEND)).toEqual({ list: FRIEND, added: true });
        expect(bypass.toggleId(`${FRIEND}, ${OTHER}`, FRIEND)).toEqual({ list: OTHER, added: false });
        expect(bypass.toggleId("", "not an id")).toEqual({ list: "", added: false });
    });

    test("mentions: direct, @everyone unless suppressed, your roles unless suppressed", () => {
        const ctx = { me: ME, myRoles: [ROLE] };
        expect(bypass.isMentioned({ mentions: [{ id: ME }] }, ctx)).toBe(true);
        expect(bypass.isMentioned({ mentions: [ME] }, ctx)).toBe(true);
        expect(bypass.isMentioned({ mention_everyone: true }, ctx)).toBe(true);
        expect(bypass.isMentioned({ mention_everyone: true }, { ...ctx, suppressEveryone: true })).toBe(false);
        expect(bypass.isMentioned({ mention_roles: [ROLE] }, ctx)).toBe(true);
        expect(bypass.isMentioned({ mention_roles: [ROLE] }, { ...ctx, suppressRoles: true })).toBe(false);
        expect(bypass.isMentioned({ mentions: [{ id: OTHER }], mention_roles: [OTHER] }, ctx)).toBe(false);
        expect(bypass.isMentioned(null, ctx)).toBe(false);
    });

    test("a server or channel on the list gets through when it pings you", () => {
        const ping = { mentions: [{ id: ME }] };
        expect(bypass.shouldBypass(input(ping, { lists: { guilds: new Set([GUILD]), channels: new Set(), users: new Set() } }))).toBe(true);
        expect(bypass.shouldBypass(input(ping, { lists: { guilds: new Set(), channels: new Set([CHANNEL]), users: new Set() } }))).toBe(true);
        expect(bypass.shouldBypass(input({}, { lists: { guilds: new Set([GUILD]), channels: new Set([CHANNEL]), users: new Set() } }))).toBe(false);
        expect(bypass.shouldBypass(input(ping))).toBe(false);
    });

    test("a person on the list gets through in their DM, and elsewhere only when allowed and pinging you", () => {
        const users = { guilds: new Set<string>(), channels: new Set<string>(), users: new Set([FRIEND]) };
        const dm = { channel: { id: DM, type: 1, recipients: [FRIEND] }, guildId: undefined, lists: users };
        expect(bypass.shouldBypass(input({ channel_id: DM }, dm))).toBe(true);
        // A DM with someone else isn't theirs; a group DM isn't a DM
        expect(bypass.shouldBypass(input({ channel_id: DM }, { ...dm, channel: { id: DM, type: 1, recipients: [OTHER] } }))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM }, { ...dm, channel: { id: DM, type: 3, recipients: [FRIEND, OTHER] } }))).toBe(false);
        expect(bypass.shouldBypass(input({ mentions: [{ id: ME }] }, { lists: users }))).toBe(false);
        expect(bypass.shouldBypass(input({ mentions: [{ id: ME }] }, { lists: users, allowOutsideOfDms: true }))).toBe(true);
        expect(bypass.shouldBypass(input({}, { lists: users, allowOutsideOfDms: true }))).toBe(false);
    });

    test("nothing gets through in another status, for silent pings, your own or empty messages, or the chat you're reading", () => {
        const users = { guilds: new Set<string>(), channels: new Set<string>(), users: new Set([FRIEND]) };
        const dm = { channel: { id: DM, type: 1, recipients: [FRIEND] }, lists: users };
        expect(bypass.shouldBypass(input({ channel_id: DM }, { ...dm, status: "online" }))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM }, { ...dm, status: "online", statusToUse: "online" }))).toBe(true);
        expect(bypass.shouldBypass(input({ channel_id: DM, flags: 4096 }, dm))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM, flags: 4096 }, { ...dm, respectSilentPings: false }))).toBe(true);
        expect(bypass.shouldBypass(input({ channel_id: DM, content: "" }, dm))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM, state: "SENDING" }, dm))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM, author: { id: ME } }, { ...dm, lists: { ...users, users: new Set([ME]) } }))).toBe(false);
        expect(bypass.shouldBypass(input({ channel_id: DM }, { ...dm, viewingChannelId: DM }))).toBe(false);
    });

    test("the pop-up shows names for mentions, on one short line, and long messages cost nothing", () => {
        const names = { user: (id: string) => id === FRIEND ? "Ayşe" : undefined, channel: () => "genel", role: () => "Mods" };
        expect(bypass.popupText(`hey <@${FRIEND}> <@!${OTHER}>\n\nsee <#${CHANNEL}> <@&${ROLE}> <a:wave:${OTHER}>`, names))
            .toBe("hey @Ayşe @? see #genel @Mods :wave:");
        expect(bypass.popupText("x".repeat(500), names, 20)).toBe(`${"x".repeat(19)}…`);
        const started = performance.now();
        bypass.popupText(`${"<@".repeat(50_000)}${"1".repeat(50_000)}`, names);
        expect(performance.now() - started).toBeLessThan(50);
    });
});

const cameras = await import(SRC + "plugins/disableCameras/logic.ts");

describe("DisableCameras", () => {
    const ME = "100000000000000001", A = "200000000000000002", B = "300000000000000003", C = "400000000000000004";

    test("turns off the cameras that are on, except yours and the ones already seen this call", () => {
        const states = {
            [ME]: { userId: ME, selfVideo: true },
            [A]: { userId: A, selfVideo: true },
            [B]: { userId: B, selfVideo: false },
            [C]: { userId: C, selfVideo: true },
            junk: { userId: "junk", selfVideo: true },
        };
        expect(cameras.camerasToTurnOff(states, ME, new Set())).toEqual([A, C]);
        expect(cameras.camerasToTurnOff(states, ME, new Set([A]))).toEqual([C]);
        expect(cameras.camerasToTurnOff({ [A]: { selfVideo: true } }, ME, new Set())).toEqual([A]);
        expect(cameras.camerasToTurnOff(null, ME, new Set())).toEqual([]);
    });

    test("the saved record keeps only people and short setting names, up to the limit", () => {
        expect(cameras.validTracked({ [A]: "NONE", [B]: 3, nope: "NONE", [C]: "x".repeat(41) })).toEqual({ [A]: "NONE" });
        expect(cameras.validTracked("nope")).toEqual({});
        const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`1${String(i).padStart(17, "0")}`, "NONE"]));
        expect(Object.keys(cameras.validTracked(many)).length).toBe(cameras.MAX_TRACKED);
    });

    test("an empty saved record isn't written again; one with anything in it, junk included, is", () => {
        expect(cameras.hasTracked(undefined)).toBe(false);
        expect(cameras.hasTracked({})).toBe(false);
        expect(cameras.hasTracked(Object.create(null))).toBe(false);
        expect(cameras.hasTracked({ [A]: "NONE" })).toBe(true);
        for (const junk of [null, "x", 3, [], [A]]) expect(cameras.hasTracked(junk)).toBe(true);
    });
});

const ping = await import(SRC + "plugins/onePingPerDM/logic.ts");

describe("OnePingPerDM", () => {
    const ME = "100000000000000001";
    const both = { channelToAffect: "both_dms", allowMentions: false, allowEveryone: false };
    const message = (over: Record<string, unknown> = {}) => ({ id: "900000000000000009", channel_id: "800000000000000008", mentions: [], ...over });

    test("in a DM only the first unread message pings", () => {
        expect(ping.playsSound(message(), 1, both, ME, null)).toBe(true);
        expect(ping.playsSound(message(), 1, both, ME, undefined)).toBe(true);
        expect(ping.playsSound(message(), 1, both, ME, "900000000000000009")).toBe(true);
        expect(ping.playsSound(message(), 1, both, ME, "900000000000000001")).toBe(false);
        expect(ping.playsSound(message(), 3, both, ME, "900000000000000001")).toBe(false);
    });

    test("servers and the kind of DM not chosen ping as usual", () => {
        expect(ping.playsSound(message(), 0, both, ME, "900000000000000001")).toBe(true);
        expect(ping.playsSound(message(), undefined, both, ME, "900000000000000001")).toBe(true);
        expect(ping.playsSound(message(), 1, { ...both, channelToAffect: "group_dm" }, ME, "900000000000000001")).toBe(true);
        expect(ping.playsSound(message(), 3, { ...both, channelToAffect: "group_dm" }, ME, "900000000000000001")).toBe(false);
        expect(ping.playsSound(message(), 3, { ...both, channelToAffect: "user_dm" }, ME, "900000000000000001")).toBe(true);
    });

    test("mentions and @everyone ping when allowed", () => {
        const mentioned = message({ mentions: [{ id: ME }] });
        expect(ping.playsSound(mentioned, 1, both, ME, "900000000000000001")).toBe(false);
        expect(ping.playsSound(mentioned, 1, { ...both, allowMentions: true }, ME, "900000000000000001")).toBe(true);
        expect(ping.playsSound(message({ mention_everyone: true }), 3, { ...both, allowEveryone: true }, ME, "900000000000000001")).toBe(true);
        expect(ping.playsSound(message({ mention_everyone: true }), 3, both, ME, "900000000000000001")).toBe(false);
    });

    test("finds the message among what Discord's sound function was given", () => {
        const m = message();
        expect(ping.messageIn([m])).toBe(m);
        expect(ping.messageIn(["800000000000000008", { message: m }])).toBe(m);
        expect(ping.messageIn([null, 3, "x", { id: 1 }])).toBeUndefined();
        expect(ping.messageIn([])).toBeUndefined();
    });
});

const noDm = await import(SRC + "plugins/noDMWhileStreaming/logic.ts");

describe("NoDMWhileStreaming", () => {
    const types: Record<string, number> = { a: 1, b: 3, c: 0, d: 1 };
    const typeOf = (id: string) => types[id];

    test("DMs leave the list, group DMs only when chosen", () => {
        expect(noDm.withoutDms(["a", "b", "c", "d", "unknown"], false, typeOf)).toEqual(["b", "c", "unknown"]);
        expect(noDm.withoutDms(["a", "b", "c", "d"], true, typeOf)).toEqual(["c"]);
        // Lists of channels too, whatever shape Discord gives them
        expect(noDm.withoutDms([{ id: "a" }, { channelId: "c" }, { channel: { id: "b" } }], true, typeOf)).toEqual([{ channelId: "c" }]);
        expect(noDm.withoutDms([{ id: "x", type: 1 }, { id: "y", type: 0 }], false, () => undefined)).toEqual([{ id: "y", type: 0 }]);
    });

    test("a list with nothing to hide is handed back as it was", () => {
        const list = ["c"];
        expect(noDm.withoutDms(list, true, typeOf)).toBe(list);
        expect(noDm.withoutDms(undefined as any, true, typeOf)).toBeUndefined();
    });

    test("messages are silenced as @silent ones are, keeping their other flags and the original untouched", () => {
        const message = { id: "1", flags: 2 };
        const quiet = noDm.silenced(message);
        expect(quiet.flags).toBe(2 | noDm.SILENT_FLAG);
        expect(message.flags).toBe(2);
        expect(noDm.silenced({ id: "2" }).flags).toBe(noDm.SILENT_FLAG);
        const already = { id: "3", flags: noDm.SILENT_FLAG };
        expect(noDm.silenced(already)).toBe(already);
        expect(noDm.isHiddenType(3, false)).toBe(false);
        expect(noDm.isHiddenType(3, true)).toBe(true);
        expect(noDm.isHiddenType(0, true)).toBe(false);
    });
});

const ring = await import(SRC + "plugins/secretRingTone/logic.ts");

describe("SecretRingToneEnabler", () => {
    test("the usual ringtone becomes the secret one, or Snow Halation; the others stay", () => {
        expect(ring.ringtoneFor("call_ringing", false)).toBe("call_ringing_beat");
        expect(ring.ringtoneFor("call_ringing", true)).toBe("call_ringing_snow_halation");
        expect(ring.ringtoneFor("call_ringing_beat", true)).toBe("call_ringing_snow_halation");
        expect(ring.ringtoneFor("call_ringing_beat", false)).toBeUndefined();
        for (const other of ["call_calling", "message1", "call_ringing_halloween", "", undefined, 3]) expect(ring.ringtoneFor(other, false)).toBeUndefined();
    });

    /** Timers that run only when told to */
    function manualTimers() {
        const pending = new Map<number,() => void>();
        let next = 1;
        return {
            pending,
            set: (fn: () => void) => {
                const id = next++;
                pending.set(id, fn);
                return id;
            },
            clear: (id: unknown) => void pending.delete(id as number),
            runAll: () => {
                for (const [id, fn] of [...pending]) {
                    pending.delete(id);
                    fn();
                }
            },
        };
    }

    function ask() {
        const timers = manualTimers();
        const done: unknown[][] = [];
        const fellBack: unknown[] = [];
        let answer: ((error: unknown, sound: unknown) => void) | undefined;
        const result = ring.askWithFallback(cb => {
            answer = cb;
            return "asked";
        }, (...a) => void done.push(a), reason => {
            fellBack.push(reason);
            return "fell back";
        }, 3000, timers);
        return { timers, done, fellBack, result, answer: (error: unknown, sound?: unknown) => answer!(error, sound) };
    }

    test("the other ringtone's answer goes to Discord once, and the wait for it ends", () => {
        const a = ask();
        expect(a.result).toBe("asked");
        expect(a.timers.pending.size).toBe(1);
        a.answer(null, { duration: 3 });
        expect(a.done).toEqual([[null, { duration: 3 }]]);
        expect(a.timers.pending.size).toBe(0);
        // A second answer, or the wait running out after all, changes nothing
        a.answer(null, { duration: 3 });
        a.timers.runAll();
        expect(a.done.length).toBe(1);
        expect(a.fellBack).toEqual([]);
    });

    test("a sound the player fails on, or never answers for, is replaced by Discord's own, once", () => {
        const failed = ask();
        failed.answer("no such sound");
        expect(failed.fellBack).toEqual(["no such sound"]);
        failed.timers.runAll();
        expect(failed.fellBack.length).toBe(1);
        expect(failed.done).toEqual([]);

        const silent = ask();
        expect(silent.fellBack).toEqual([]);
        silent.timers.runAll();
        expect(silent.fellBack.length).toBe(1);
        expect(String(silent.fellBack[0])).toContain("3000 ms");
        // The answer that finally comes is ignored: Discord's callback was handed to its own ringtone's ask
        silent.answer(null, {});
        silent.answer("late error");
        expect(silent.done).toEqual([]);
        expect(silent.fellBack.length).toBe(1);
    });

    test("a player that throws is replaced by Discord's own right away; Discord's callback is optional", () => {
        const timers = manualTimers();
        const fellBack: unknown[] = [];
        const error = new Error("boom");
        const result = ring.askWithFallback(() => {
            throw error;
        }, undefined, reason => {
            fellBack.push(reason);
            return "fell back";
        }, 3000, timers);
        expect(result).toBe("fell back");
        expect(fellBack).toEqual([error]);
        expect(timers.pending.size).toBe(0);
        // Answered at once, without anyone to tell
        expect(() => ring.askWithFallback(cb => cb(null, {}), undefined, () => { }, 3000, manualTimers())).not.toThrow();
    });

    test("Discord's own ringtone failing too, from the timer or the player's answer, doesn't reach the app's error handler", () => {
        const consoleError = console.error;
        const logged: unknown[][] = [];
        console.error = (...args: unknown[]) => void logged.push(args);
        try {
            const timers = manualTimers();
            let answer: ((error: unknown, sound: unknown) => void) | undefined;
            const fallBack = () => {
                throw new Error("no ringtone at all");
            };
            ring.askWithFallback(() => { }, undefined, fallBack, 3000, timers);
            expect(() => timers.runAll()).not.toThrow();
            ring.askWithFallback(cb => void (answer = cb), undefined, fallBack, 3000, manualTimers());
            expect(() => answer!("missing", undefined)).not.toThrow();
            expect(logged.length).toBe(2);
        } finally {
            console.error = consoleError;
        }
    });
});
