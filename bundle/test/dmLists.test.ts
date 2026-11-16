// Discord 353 gives the DM list in sections (getSortedChannels: favorites, then the others, each a list of
// { channelId, ... }) as well as flat (getPrivateChannelIds). PinDMs and NoDMWhileStreaming change both: each section
// on its own, and the very same list back when nothing changed, so Discord doesn't redraw it for nothing
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";

const { bySection } = await import(SRC + "plugins/shared/lists.ts");
const { withoutDms } = await import(SRC + "plugins/noDMWhileStreaming/logic.ts");

const row = (channelId: string, isFavorite = false) => ({ channelId, lastMessageId: "1", isFavorite, isRequest: false });
const types: Record<string, number> = { dm1: 1, dm2: 1, group: 3, other: 0 };
const typeOf = (id: string) => types[id];

describe("bySection", () => {
    test("a flat list is changed as one", () => {
        const list = ["dm1", "group", "dm2"];
        expect(bySection(list, items => withoutDms(items, false, typeOf))).toEqual(["group"]);
    });

    test("sections are changed one by one, and items never move between them", () => {
        const sections = [[row("dm1", true)], [row("group"), row("dm2")]];
        expect(bySection(sections, items => withoutDms(items, false, typeOf))).toEqual([[], [row("group")]]);
        const reversed = bySection(sections, items => [...items].reverse());
        expect(reversed).toEqual([[row("dm1", true)], [row("dm2"), row("group")]]);
    });

    test("the same list back when nothing changed, flat or in sections", () => {
        const flat = ["group"];
        expect(bySection(flat, items => withoutDms(items, false, typeOf))).toBe(flat);
        const sections = [[], [row("group"), row("other")]];
        expect(bySection(sections, items => withoutDms(items, false, typeOf))).toBe(sections);
    });

    test("anything that isn't a list is left alone", () => {
        for (const value of [null, undefined, 5, "x", { a: 1 }]) expect(bySection(value as any, () => ["changed"])).toBe(value);
    });

    test("an empty list goes through the change as a flat one", () => {
        expect(bySection([], () => ["x"])).toEqual(["x"]);
    });
});
