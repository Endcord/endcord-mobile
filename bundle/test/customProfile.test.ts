// CustomProfile's fields from Endcord PC: shared, read back, and counted as a profile
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";
mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (s: string, values?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => String(values?.[k] ?? `{${k}}`)),
    tx: (s: string) => s,
}));
const data = await import(SRC + "plugins/customProfile/data.ts");
const format = await import(SRC + "plugins/customProfile/sharingFormat.ts");
const translate = (s: string, values?: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => values?.[k] ?? `{${k}}`);

const pcFields = {
    nitroSince: "2019-04-01",
    profileFrameId: "1385010373537665024",
    nameplate: { skuId: "1349849614353829990", asset: "nameplates/nameplates/twilight/", label: "COLLECTIBLES_NAMEPLATES_TWILIGHT_A11Y", palette: "cobalt" },
    displayNameStyles: { fontId: 11, effectId: 2, colors: [0x9ccbff, 0xff00aa] },
};

describe("the fields Endcord PC has", () => {
    test("go into the shared message and come back the same", () => {
        const { content, fits } = format.writeProfileMessage({ bio: "hi", email: "a@b.c", createdAt: "2016-01-01", ...pcFields });
        expect(fits).toBe(true);
        const back = format.readProfileMessage(content);
        expect(back).toEqual({ bio: "hi", ...pcFields });
    });

    test("a profile with only one of them is a profile", () => {
        expect(data.hasAnyCustomData({ nameplate: pcFields.nameplate })).toBe(true);
        expect(data.hasAnyCustomData({ profileFrameId: "1" })).toBe(true);
        expect(data.hasAnyCustomData({ displayNameStyles: pcFields.displayNameStyles })).toBe(true);
        expect(data.hasAnyCustomData({})).toBe(false);
        expect(format.readProfileMessage(`ecp1 ${JSON.stringify({ nameplate: pcFields.nameplate })}`)).toEqual({ nameplate: pcFields.nameplate });
    });

    test("a frame gives the Nitro look, as on PC, unless Nitro is off", () => {
        expect(data.wantsNitroLook({ profileFrameId: "1" })).toBe(true);
        expect(data.wantsNitroLook({ profileFrameId: "1", nitro: false })).toBe(false);
        expect(data.wantsNitroLook({ nameplate: pcFields.nameplate })).toBe(false);
    });

    test("bad values from someone else's message are left out", () => {
        const back = format.readProfileMessage(`ecp1 ${JSON.stringify({
            bio: "x",
            profileFrameId: "../x",
            nameplate: { skuId: "1", asset: "../../etc" },
            displayNameStyles: { fontId: 1.5, effectId: 1, colors: [1] },
        })}`);
        expect(back).toEqual({ bio: "x" });
        const colors = format.readProfileMessage(`ecp1 ${JSON.stringify({ displayNameStyles: { fontId: 1, effectId: 1, colors: [1, -1, "x", 0x1000000] } })}`);
        expect(colors).toEqual({ displayNameStyles: { fontId: 1, effectId: 1, colors: [1] } });
    });

    test("the Nitro date", () => {
        expect(data.nitroSinceDate({ nitroSince: "2019-04-01" }).getDate()).toBe(1);
        const now = new Date(2026, 10, 10, 12);
        expect(data.nitroSinceDate({ nitroLevel: 4 }, now).getFullYear()).toBe(2025);
    });

    test("the old name reads as on PC", () => {
        const badges = data.buildBadges({ customBadgeIds: ["oldname"], oldName: "Triggerr#5954" }, translate);
        expect(badges[0].label).toBe("Originally known as Triggerr#5954");
        expect(data.buildBadges({ customBadgeIds: ["oldname"] }, translate)[0].label).toBe("Old username");
    });
});
