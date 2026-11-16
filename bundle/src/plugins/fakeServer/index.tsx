/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's FakeServer: any server looks verified or partnered, with as many members as you like, on this phone
 * only. PC sets it from a server's right-click menu; here it's /fakeserver in that server, and the plugin's settings
 * list the servers changed. The same stores as PC's give the badges and counts: the server, its member counts, its
 * profile card, its invites and the member list's headers. Server settings keep the real server, and as on PC a save
 * that would send the fake badges back to Discord goes without them.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { instead } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { botMessage, command, getGuild, HTTP } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { addFeatures, type FakeLook, guildTarget, hasBadges, isEmptyLook, realFeatures, toCount, withInvite, withMemberList, withProfile } from "./logic";

const SNOWFLAKE = /^\d{17,20}$/;

const saved = wrapSync(createStorage<{ servers: Record<string, FakeLook>; }>(createMMKVBackend("ENDCORD_FAKE_SERVERS", { servers: {} })));

/** The saved looks, read on every server lookup: a copy in memory rather than the storage itself */
let looks = new Map<string, FakeLook>();
let refresh: (() => void) | undefined;

function loadLooks() {
    const servers = saved.servers && typeof saved.servers === "object" ? saved.servers : {};
    looks = new Map(Object.entries(servers).filter(([id, look]) => SNOWFLAKE.test(id) && look && typeof look === "object"));
}

const lookOf = (guildId: unknown): FakeLook | undefined => typeof guildId === "string" ? looks.get(guildId) : undefined;

function setLook(guildId: string, change: Partial<FakeLook>) {
    if (!SNOWFLAKE.test(guildId)) return;
    const next = { ...looks.get(guildId), ...change };
    const servers: Record<string, FakeLook> = {};
    for (const [id, look] of looks) if (id !== guildId) servers[id] = look;
    // A server back to how Discord shows it needs no entry
    if (!isEmptyLook(next)) servers[guildId] = next;
    saved.servers = servers;
    loadLooks();
    refresh?.();
}

const onOff = (on?: boolean) => on ? t("On") : t("Off");

function askCount(guildId: string, kind: "members" | "online") {
    prompt({
        title: kind === "members" ? t("Members") : t("Online"),
        description: t("Only you see these numbers. Leave a box empty to show the real one."),
        placeholder: kind === "members" ? "250000" : "48000",
        initial: lookOf(guildId)?.[kind]?.toString() ?? "",
        keyboardType: "numeric",
        allowEmpty: true,
        onSubmit: value => setLook(guildId, { [kind]: toCount(value) }),
    });
}

/** What PC's "Fake server look" menu has, as a sheet */
function openLook(guildId: string) {
    const look = lookOf(guildId) ?? {};
    choose(getGuild(guildId)?.name ?? guildId, [
        { label: t("Verified"), subLabel: onOff(look.verified), value: "verified", icon: "CheckmarkLargeIcon" },
        { label: t("Partnered"), subLabel: onOff(look.partnered), value: "partnered", icon: "StarIcon" },
        { label: t("Members"), subLabel: look.members != null ? look.members.toLocaleString() : t("The real count"), value: "members", icon: "GroupIcon" },
        { label: t("Online"), subLabel: look.online != null ? look.online.toLocaleString() : t("The real count"), value: "online", icon: "GroupIcon" },
        ...lookOf(guildId) ? [{ label: t("Show it as it is"), value: "reset", icon: "RetryIcon", danger: true }] : [],
    ], action => {
        if (action === "verified") setLook(guildId, { verified: !look.verified });
        else if (action === "partnered") setLook(guildId, { partnered: !look.partnered });
        else if (action === "members" || action === "online") setTimeout(() => askCount(guildId, action), 300);
        else setLook(guildId, { verified: false, partnered: false, members: undefined, online: undefined });
    });
}

function ServersPage() {
    useProxy(saved);
    const entries = Object.entries(saved.servers ?? {}).filter(([id]) => SNOWFLAKE.test(id));
    return <LogList
        title={t("Servers")}
        empty={t("Use /fakeserver in a server to change how it looks. Only you see it.")}
        entries={entries.map(([id, look]) => ({
            key: id,
            label: getGuild(id)?.name ?? id,
            subLabel: [
                look.verified && t("Verified"),
                look.partnered && t("Partnered"),
                look.members != null && `${t("Members")}: ${look.members.toLocaleString()}`,
                look.online != null && `${t("Online")}: ${look.online.toLocaleString()}`,
            ].filter(Boolean).join(" · "),
            icon: "ServerIcon",
            onPress: () => openLook(id),
        }))}
    />;
}

export default definePlugin({
    id: "endcord.fake-server",
    name: "FakeServer",
    description: tx("Make any server look verified or partnered, with as many members as you like, with /fakeserver in that server. Only on your screen."),
    icon: "ServerIcon",
    tags: ["Fun", "Servers"],
    SettingsComponent: ServersPage,
    async start({ cleanup, logger }) {
        await awaitStorage(saved);
        loadLooks();

        const guilds = getStore("GuildStore");
        if (typeof guilds?.getGuild !== "function") throw new Error("Discord's servers weren't found");
        const counts = getStore("GuildMemberCountStore");
        const guildProfiles = getStore("GuildProfileStore");
        const invites = getStore("InviteStore");
        const memberLists = getStore("ChannelMemberStore");

        // Discord compares what its stores return by reference, so each stand-in is made once and kept until Discord
        // replaces the original or the look changes. A new one on every read would make Discord draw again and again
        const standIns = new WeakMap<object, { key: string; value: any; }>();
        const keep = <T,>(original: object, look: unknown, make: () => T): T => {
            const key = JSON.stringify(look);
            const kept = standIns.get(original);
            if (kept?.key === key) return kept.value;
            const value = make();
            standIns.set(original, { key, value });
            return value;
        };

        // A copy that keeps the server's class, so its methods (like hasFeature) still work
        const withFeatures = (guild: any, look: FakeLook) => keep(guild, look, () => {
            const copy = Object.create(Object.getPrototypeOf(guild));
            for (const key of Reflect.ownKeys(guild)) {
                const descriptor = Object.getOwnPropertyDescriptor(guild, key);
                if (descriptor) Object.defineProperty(copy, key, descriptor);
            }
            Object.defineProperty(copy, "features", { value: addFeatures(guild.features, look), writable: true, configurable: true, enumerable: true });
            return copy;
        });

        let realGuild = 0;
        const wrap = (store: any, method: string, change: (args: any[], value: any) => any) => {
            if (typeof store?.[method] !== "function") return;
            cleanup(instead(method, store, function (this: any, args, original) {
                const value = original.apply(this, args);
                if (realGuild || !looks.size) return value;
                try {
                    return change(args, value);
                } catch {
                    return value;
                }
            }));
        };

        wrap(guilds, "getGuild", ([id], guild) => {
            const look = guild && lookOf(id);
            return hasBadges(look) ? withFeatures(guild, look) : guild;
        });
        wrap(counts, "getMemberCount", ([id], count) => lookOf(id)?.members ?? count);
        wrap(counts, "getOnlineCount", ([id], count) => lookOf(id)?.online ?? count);
        wrap(counts, "getMemberCounts", (_, all) => {
            const changed = [...looks].filter(([, look]) => look.members != null);
            if (!all || typeof all !== "object" || !changed.length) return all;
            return keep(all, changed, () => {
                const copy = { ...all };
                for (const [id, look] of changed) copy[id] = look.members;
                return copy;
            });
        });
        wrap(guildProfiles, "getProfile", ([id], profile) => {
            const look = profile && typeof profile === "object" && lookOf(id);
            return look ? keep(profile, look, () => withProfile(profile, look)) : profile;
        });
        wrap(invites, "getInvite", (_, invite) => {
            const look = invite && typeof invite === "object" && lookOf(invite.guild?.id);
            return look ? keep(invite, look, () => withInvite(invite, look)) : invite;
        });
        wrap(memberLists, "getProps", ([guildId], props) => {
            const look = props && typeof props === "object" && lookOf(guildId);
            // The list itself is kept too, not only its groups and rows
            return look ? keep(props, look, () => withMemberList(props, look, (original, make) => keep(original, look, make))) : props;
        });

        // Saving server settings sends the server's features back to Discord. The fake ones never go with them
        const http = HTTP();
        for (const holder of new Set([http, http?.HTTP].filter(h => h && typeof h === "object"))) {
            if (typeof holder.patch !== "function") continue;
            try {
                cleanup(instead("patch", holder, function (this: any, args, original) {
                    const [request] = args;
                    const id = typeof request === "object" ? guildTarget(request?.url) : undefined;
                    const features = request?.body?.features;
                    if (!id || !Array.isArray(features)) return original.apply(this, args);
                    realGuild++;
                    let real: any;
                    try {
                        real = guilds.getGuild(id)?.features;
                    } finally {
                        realGuild--;
                    }
                    const realHas = (f: string) => real instanceof Set ? real.has(f) : Array.isArray(real) && real.includes(f);
                    return original.apply(this, [{ ...request, body: { ...request.body, features: realFeatures(features, realHas) } }, ...args.slice(1)]);
                }));
            } catch (e) {
                logger.warn("Discord's server saves couldn't be watched", e);
            }
        }

        refresh = () => {
            for (const store of [guilds, counts, guildProfiles, invites, memberLists]) {
                try {
                    store?.emitChange?.();
                } catch { }
            }
        };

        cleanup(
            command({
                name: "fakeserver",
                description: tx("Change how this server looks, only for you"),
                run: (_, ctx) => {
                    const guildId = ctx.channel.guild_id;
                    if (!guildId || !SNOWFLAKE.test(guildId)) return botMessage(ctx.channel.id, t("Use it in a server."));
                    openLook(guildId);
                    showToast(t("Only you see these changes."), findAssetId("ServerIcon"));
                },
            }),
            () => {
                const redraw = refresh;
                refresh = undefined;
                // After the patches are off, so the servers show as they are again
                setTimeout(() => redraw?.(), 0);
            },
        );
        refresh();
    },
});
