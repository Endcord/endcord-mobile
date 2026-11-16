// Endcord PC's channel list and server plugins on mobile: ShowHiddenChannels reads what other people named and set, so
// its logic is checked against odd and hostile input as well as the ordinary; OverrideForumDefaults' and
// StopAutoUnread's patches are checked to come off again when they stop
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

const access = await import(SRC + "plugins/showHiddenChannels/access.ts");

const VIEW = 1n << 10n;
const ADMIN = 1n << 3n;
const CONNECT = 1n << 20n;
const GUILD = "100";

const role = (id: string, permissions: bigint | number | string, position = 1, name = `role${id}`) => ({ id, name, permissions, position });

describe("ShowHiddenChannels: who can see a channel", () => {
    const roles = {
        [GUILD]: role(GUILD, VIEW, 0, "@everyone"),
        "1": role("1", 0n, 5, "Mods"),
        "2": role("2", ADMIN, 9, "Admins"),
        "3": role("3", VIEW | CONNECT, 2, "Members"),
    };

    test("roles let in by an overwrite, and administrators, highest first; @everyone kept out", () => {
        const overwrites = {
            [GUILD]: { id: GUILD, type: 0, allow: 0n, deny: VIEW },
            "1": { id: "1", type: 0, allow: VIEW, deny: 0n },
        };
        const result = access.whoCanSee({ guildId: GUILD, ownerId: "9", roles, overwrites, viewFlag: VIEW, adminFlag: ADMIN });
        expect(result.everyone).toBe(false);
        expect(result.roles).toEqual([
            { id: "2", name: "Admins", admin: true },
            { id: "1", name: "Mods", admin: false },
        ]);
        expect(result.userIds).toEqual(["9"]);
    });

    test("a role's own deny wins over what @everyone's overwrite allows", () => {
        const overwrites = {
            [GUILD]: { id: GUILD, type: 0, allow: VIEW, deny: 0n },
            "3": { id: "3", type: 0, allow: 0n, deny: VIEW },
        };
        const result = access.whoCanSee({ guildId: GUILD, roles, overwrites, viewFlag: VIEW, adminFlag: ADMIN });
        // @everyone can see it, so only that is said
        expect(result.everyone).toBe(true);
        expect(result.roles).toEqual([]);
    });

    test("members let in by an overwrite of their own, the owner first and once", () => {
        const overwrites = {
            [GUILD]: { id: GUILD, type: 0, allow: 0n, deny: VIEW },
            "50": { id: "50", type: 1, allow: VIEW, deny: 0n },
            "51": { id: "51", type: "member", allow: String(VIEW | CONNECT), deny: "0" },
            "52": { id: "52", type: 1, allow: 0n, deny: VIEW },
            "9": { id: "9", type: 1, allow: VIEW, deny: 0n },
        };
        const result = access.whoCanSee({ guildId: GUILD, ownerId: "9", roles, overwrites, viewFlag: VIEW, adminFlag: ADMIN });
        expect(result.userIds).toEqual(["9", "50", "51"]);
        // A member overwrite under a role's ID isn't taken for the role's
        expect(result.roles.map(r => r.id)).toEqual(["2"]);
    });

    test("bitfields in every form Discord has used, and junk, don't throw", () => {
        expect(access.toBits(1024)).toBe(1024n);
        expect(access.toBits("1024")).toBe(1024n);
        expect(access.toBits(1024n)).toBe(1024n);
        for (const junk of [undefined, null, -1, 1.5, "12a", "1".repeat(60), {}, [], NaN, Infinity]) expect(access.toBits(junk)).toBe(0n);
        const result = access.whoCanSee({
            guildId: GUILD,
            roles: { [GUILD]: { id: GUILD, permissions: "junk" }, x: null as any, y: { id: 5 } as any },
            overwrites: { [GUILD]: { id: GUILD, type: 0, allow: {}, deny: [] }, bad: null as any },
            viewFlag: VIEW,
            adminFlag: ADMIN,
        });
        expect(result).toEqual({ everyone: false, roles: [], userIds: [] });
    });

    test("an overwrite or role keyed __proto__ is just another ID", () => {
        const overwrites = JSON.parse(`{"__proto__": {"id": "__proto__", "type": 0, "allow": "1024", "deny": "0"}, "${GUILD}": {"id": "${GUILD}", "type": 0, "allow": "0", "deny": "1024"}}`);
        const result = access.whoCanSee({ guildId: GUILD, roles: { ...roles, ...JSON.parse("{\"__proto__\": {\"id\": \"__proto__\", \"name\": \"x\", \"permissions\": \"0\"}}") }, overwrites, viewFlag: VIEW, adminFlag: ADMIN });
        expect(result.roles.map(r => r.id)).toEqual(["2", "__proto__"]);
        expect(({} as any).allow).toBeUndefined();
    });

    test("permission names from Discord's table", () => {
        expect(access.permissionNames(VIEW | ADMIN, { VIEW_CHANNEL: VIEW, ADMINISTRATOR: ADMIN, CONNECT, NOTHING: 0n })).toEqual(["VIEW_CHANNEL", "ADMINISTRATOR"]);
    });
});

describe("ShowHiddenChannels: reading a channel", () => {
    test("durations in at most two units", () => {
        expect(access.durationParts(0)).toEqual([]);
        expect(access.durationParts(-5)).toEqual([]);
        expect(access.durationParts(NaN)).toEqual([]);
        expect(access.durationParts(30)).toEqual([[30, "second"]]);
        expect(access.durationParts(5400)).toEqual([[1, "hour"], [30, "minute"]]);
        expect(access.durationParts(21600)).toEqual([[6, "hour"]]);
        expect(access.durationParts(10080 * 60)).toEqual([[7, "day"]]);
        expect(access.durationParts(90061)).toEqual([[1, "day"], [1, "hour"]]);
    });

    test("other people's text is cut to length without copying all of it", () => {
        expect(access.clip("abc", 5)).toBe("abc");
        expect(access.clip("abcdef", 5)).toBe("abcd…");
        expect(access.clip(undefined, 5)).toBe("");
        expect(access.clip(42, 5)).toBe("");
        const long = "x".repeat(5_000_000);
        const started = performance.now();
        expect(access.clip(long, 100).length).toBe(100);
        expect(performance.now() - started).toBeLessThan(50);
    });

    test("hidden channels by category, in the channel list's order", () => {
        const categories = {
            c1: { id: "c1", type: 4, position: 2, name: "B" },
            c2: { id: "c2", type: 4, position: 1, name: "A" },
        };
        const hidden = [
            { id: "5", type: 0, parent_id: "c1", position: 3 },
            { id: "4", type: 0, parent_id: "c1", position: 1 },
            { id: "3", type: 2, parent_id: "c2", position: 0 },
            { id: "2", type: 0, parent_id: null, position: 9 },
            { id: "1", type: 0, parent_id: "gone", position: 0 },
        ];
        const groups = access.groupByCategory(hidden, categories);
        expect(groups.map((g: any) => g.category?.id ?? "")).toEqual(["", "c2", "c1"]);
        expect(groups[0].channels.map((c: any) => c.id)).toEqual(["1", "2"]);
        expect(groups[2].channels.map((c: any) => c.id)).toEqual(["4", "5"]);
        expect(access.groupByCategory([{ id: "9", type: 0, parent_id: "__proto__" }], {})[0].category).toBeUndefined();
    });

    test("threads are told apart", () => {
        expect([10, 11, 12].every(access.isThreadType)).toBe(true);
        expect([0, 2, 4, 5, 13, 15, "11", undefined].some(access.isThreadType)).toBe(false);
    });
});


// Discord's modules and stores, as the plugins under test find them
const patched: Array<{ path: string; key: string; cb: (props: any, rendered: any) => any; }> = [];
let unpatched = 0;
let missingPaths = new Set<string>();
const storeChannels: Record<string, any> = {};
/** Modules and stores the plugins under test find, by path and by name */
const fakeModules: Record<string, any> = {};
const fakeStores: Record<string, any> = {};
const fakeProps: Record<string, any> = {};
mock.module(SRC + "core/i18n/index.ts", () => ({ t: (s: string) => s, tx: (s: string) => s }));
mock.module(SRC + "plugins/api.ts", () => ({ definePlugin: (definition: any) => definition, onSettingChange: () => () => { } }));
/** Patches as Endcord's patcher makes them (spitroast doesn't load under bun): replaced, then put back as they were */
function fakePatch(kind: "before" | "instead" | "after") {
    return (name: string, parent: any, cb: (...a: any[]) => any) => {
        const original = parent[name];
        const own = Object.prototype.hasOwnProperty.call(parent, name);
        parent[name] = function (this: any, ...args: any[]) {
            if (kind === "instead") return cb.call(this, args, (...a: any[]) => original.apply(this, a));
            if (kind === "before") cb.call(this, args);
            const result = original.apply(this, args);
            if (kind === "after") {
                const replaced = cb.call(this, args, result);
                return replaced === undefined ? result : replaced;
            }
            return result;
        };
        return () => {
            if (own) parent[name] = original;
            else delete parent[name];
            return true;
        };
    };
}
mock.module(SRC + "lib/api/patcher.ts", () => ({ before: fakePatch("before"), instead: fakePatch("instead"), after: fakePatch("after") }));
mock.module(SRC + "metro/index.ts", () => ({ findByProps: (prop: string) => fakeProps[prop], findByName: () => undefined, findByFilePath: () => undefined, findByStoreName: () => undefined }));
mock.module(SRC + "plugins/common.tsx", () => ({
    currentUserId: () => "1",
    subscribe: () => () => { },
    onAction: () => () => { },
    dispatchSoon: () => { },
    guildRoles: () => ({}),
    addToolboxAction: () => () => { },
    addSettingsPage: () => () => { },
    addChatButton: () => () => { },
    moduleAt: (path: string) => fakeModules[path] ?? (missingPaths.has(path) ? undefined : { path, default: () => null, CategoryChannel: () => null, renderCategoryItem: () => null }),
    afterRender: (module: any, key: string, cb: any) => {
        if (!module) return null;
        patched.push({ path: module.path, key, cb });
        return () => void unpatched++;
    },
    getStore: (name: string) => name === "ChannelStore" ? { getChannel: (id: string) => storeChannels[id] } : fakeStores[name],
}));
mock.module("react-native", () => ({ View: "View" }));



const { ownerOf, pickedValue } = await import(SRC + "plugins/overrideForumDefaults/owner.ts");

describe("OverrideForumDefaults", () => {
    class Base { getDefaultLayout() { return 2; } getDefaultSortOrder() { return 1; } }
    class Forum extends Base { }

    test("the prototype that has the method itself", () => {
        expect(ownerOf(Forum.prototype, "getDefaultLayout")).toBe(Base.prototype);
        expect(ownerOf(Forum.prototype, "missing")).toBeUndefined();
        expect(ownerOf(undefined, "getDefaultLayout")).toBeUndefined();
        expect(ownerOf({ toString: 1 }, "toString")).toBeUndefined();
    });

    test("a setting's number: Discord's constant, PC's number, or the fallback", () => {
        expect(pickedValue("2", { "1": 1, "2": 2 }, 1)).toBe(2);
        expect(pickedValue("2", { "1": undefined, "2": undefined }, 1)).toBe(2);
        expect(pickedValue("2", { "2": 7 }, 1)).toBe(7);
        expect(pickedValue("9", { "1": 1 }, 1)).toBe(1);
        expect(pickedValue("__proto__", { "1": 1 }, 1)).toBe(1);
        expect(pickedValue("constructor", { "1": 1 }, 0)).toBe(0);
    });

    test("forums open as chosen while it runs, and as the server set once it stops", async () => {
        fakeModules["records/ChannelRecord.tsx"] = { ChannelRecordBase: Base, ForumChannelRecord: Forum };
        fakeModules["../discord_common/js/shared/shared-constants/ForumLayout.tsx"] = { ForumLayout: { DEFAULT: 0, LIST: 1, GRID: 2 } };
        const plugin = (await import(SRC + "plugins/overrideForumDefaults/index.ts")).default;
        const cleanups: Array<() => unknown> = [];
        const store = { defaultLayout: "1", defaultSortOrder: "0" };
        plugin.start({ store, logger: console, cleanup: (...fns: any[]) => cleanups.push(...fns) });
        const forum = new Forum();
        expect(forum.getDefaultLayout()).toBe(1);
        expect(forum.getDefaultSortOrder()).toBe(0);
        store.defaultLayout = "2";
        store.defaultSortOrder = "1";
        expect(forum.getDefaultLayout()).toBe(2);
        expect(forum.getDefaultSortOrder()).toBe(1);
        store.defaultLayout = "1";
        expect(new Base().getDefaultLayout()).toBe(1);
        for (const fn of cleanups.reverse()) fn();
        expect(forum.getDefaultLayout()).toBe(2);
        expect(forum.getDefaultSortOrder()).toBe(1);
    });

    test("a Discord without the methods stops it with a reason", async () => {
        fakeModules["records/ChannelRecord.tsx"] = { ChannelRecordBase: class { } };
        const plugin = (await import(SRC + "plugins/overrideForumDefaults/index.ts")).default;
        expect(() => plugin.start({ store: { defaultLayout: "1", defaultSortOrder: "0" }, logger: console, cleanup: () => { } })).toThrow("Discord's forum defaults weren't found");
    });
});

describe("StopAutoUnread", () => {
    test("Discord's switch to All Messages decides against it while it runs", async () => {
        let upgrades = 0;
        class NoticeStore { maybeAutoUpgradeChannel(id: string) { upgrades++; return id === "1"; } check(id: string) { return this.maybeAutoUpgradeChannel(id); } }
        const notices = new NoticeStore();
        fakeStores.UnreadSettingNoticeStore2 = notices;
        const plugin = (await import(SRC + "plugins/stopAutoUnread/index.ts")).default;
        const cleanups: Array<() => unknown> = [];
        plugin.start({ store: {}, logger: console, cleanup: (...fns: any[]) => cleanups.push(...fns) });
        expect(notices.maybeAutoUpgradeChannel("1")).toBe(false);
        expect(notices.check("1")).toBe(false);
        expect(upgrades).toBe(0);
        for (const fn of cleanups) fn();
        expect(notices.check("1")).toBe(true);
        expect(upgrades).toBe(1);
        delete fakeStores.UnreadSettingNoticeStore2;
    });

    test("never taken from something that only answers to the name, and a reason when it's gone", async () => {
        const plugin = (await import(SRC + "plugins/stopAutoUnread/index.ts")).default;
        // Discord's translation tables answer every name with a function: a search by the method's name could find them
        const translations = new Proxy({}, { get: () => () => true });
        fakeProps.maybeAutoUpgradeChannel = translations;
        expect(() => plugin.start({ store: {}, logger: console, cleanup: () => { } })).toThrow("Discord's automatic switch to All Messages wasn't found");
        delete fakeProps.maybeAutoUpgradeChannel;
        // The store under its older name still counts
        const older = { maybeAutoUpgradeChannel: () => true };
        fakeStores.UnreadSettingNoticeStore = older;
        const cleanups: Array<() => unknown> = [];
        plugin.start({ store: {}, logger: console, cleanup: (...fns: any[]) => cleanups.push(...fns) });
        expect(older.maybeAutoUpgradeChannel()).toBe(false);
        for (const fn of cleanups) fn();
        expect(older.maybeAutoUpgradeChannel()).toBe(true);
        delete fakeStores.UnreadSettingNoticeStore;
    });
});
