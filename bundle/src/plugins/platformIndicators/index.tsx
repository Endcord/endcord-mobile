/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Which devices someone is online on, as Endcord PC shows it: an icon per platform (desktop, web, mobile, console, VR)
 * in the color of that platform's status, beside the name in messages and in member lists, and as badges on profiles.
 *
 * Discord's chat rows are drawn natively from data: in messages the icons are the row's role icon, the one image beside
 * the name that's drawn in its own colors. That image sits in a square of the size given; a row of icons is wider than
 * tall, so the square grows with it, up to where the name's line would grow too much. Someone with a role icon of their
 * own keeps it. Member lists are React Native, where the icons go after the name like any other tag.
 */

import { t, tx } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findByName, findByTypeNameAll } from "@metro";
import { FluxUtils } from "@metro/common";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Image } from "react-native";

import { definePlugin } from "../api";
import { currentUserId, getStore, subscribe } from "../common";
import { extendProfileBadges, linkedBadge } from "../profileBadges";
import { type IconsImage, iconsImage, type Platform } from "./icons";

const MESSAGE_ROW = 1;
/** An icon's height beside a name in a message, as Discord sizes role icons: the name's line only grows past about 21 */
const ICON_SIZE = 16;
/** The most a row of icons takes in a message: the name's line grows a few pixels with it, and no more */
const MAX_ROW_SIZE = 32;
/** An icon's height in member lists: PC's small size (17 px) */
const LIST_ICON_SIZE = 16;
/** Marks the icons added to a name, so a row drawn by two patched components gets them once */
const LIST_KEY = "endcord-platform-indicators";
/** In the order they're shown, as Endcord PC names them */
const PLATFORMS: ReadonlyArray<Platform> = ["desktop", "web", "mobile", "embedded", "vr"];
const NAMES: Readonly<Record<Platform, string>> = {
    desktop: tx("Desktop"),
    web: tx("Web"),
    mobile: tx("Mobile"),
    embedded: tx("Console"),
    vr: tx("VR"),
};

type Statuses = Partial<Record<Platform, string>>;

const plugin = definePlugin({
    id: "endcord.platform-indicators",
    name: "PlatformIndicators",
    description: tx("Shows which devices people are online on (desktop, web, mobile, console or VR), in the color of their status, beside their name and on their profile."),
    popular: 9,
    icon: "MobilePhoneIcon",
    tags: ["Appearance"],
    settings: {
        messages: { type: "boolean", label: tx("Messages"), description: tx("Beside the name on each message"), default: true },
        list: { type: "boolean", label: tx("Member lists"), description: tx("Beside names in member lists"), default: true },
        badges: { type: "boolean", label: tx("Profiles"), description: tx("As badges on profiles"), default: true },
        self: { type: "boolean", label: tx("Your own devices"), description: tx("Show where you're online too"), default: true },
        offline: { type: "boolean", label: tx("Hide when offline"), description: tx("Show nothing for devices that are offline or invisible"), default: true },
    },
    start({ store, cleanup }) {
        const RowManager = findByName("RowManager");
        if (typeof RowManager?.prototype?.generate !== "function") throw new Error("Discord's message rows weren't found");

        cleanup(after("generate", RowManager.prototype, ([args], row) => {
            try {
                const message = row?.type === MESSAGE_ROW ? row.message : undefined;
                const author = args?.message?.author;
                if (!message || !store.messages || !author?.id || author.bot) return;
                // Discord's role icon, where the person has one, stays
                if (message.roleIcon) return;
                const icons = imageFor(cachedKey(author.id));
                if (!icons) return;
                message.roleIcon = {
                    source: icons.uri,
                    name: icons.label,
                    alt: icons.label,
                    size: Math.min(MAX_ROW_SIZE, Math.round(ICON_SIZE * icons.width / icons.height)),
                };
            } catch (e) {
                console.error("[Endcord] PlatformIndicators couldn't decorate a message", e);
            }
        }));

        // Member lists, friends and the like: Discord's UserRow, in more than one module
        for (const row of findByTypeNameAll("UserRow")) {
            if (typeof row?.type !== "function") continue;
            cleanup(after("type", row, ([props], element) => {
                try {
                    const user = props?.user;
                    const label = element?.props?.label;
                    if (!store.list || !user?.id || user.bot || !isValidElement(label)) return;
                    const children = (label.props as any)?.children;
                    const list: ReactNode[] = Array.isArray(children) ? children : [children];
                    if (list.some(child => isValidElement(child) && child.key === LIST_KEY)) return;
                    const icons = <ListIcons key={LIST_KEY} userId={user.id} />;
                    return cloneElement(element as ReactElement<any>, { label: cloneElement(label, undefined, ...list, icons) });
                } catch (e) {
                    console.error("[Endcord] PlatformIndicators couldn't decorate a member", e);
                }
            }));
        }

        // As on PC, before the profile's other badges
        cleanup(extendProfileBadges("platform-indicators", (userId, badges) => {
            if (!store.badges || getStore("UserStore")?.getUser?.(userId)?.bot) return badges;
            const shown = parseKey(cachedKey(userId));
            const ours = PLATFORMS.flatMap(platform => {
                const status = shown[platform];
                const icon = status && imageFor(`${platform}:${status}`);
                return icon ? [linkedBadge(`endcord-platform-${platform}-${status}`, t(NAMES[platform]), icon.uri)] : [];
            });
            return ours.length ? [...ours, ...badges] : badges;
        }));

        // Presence changes don't redraw rows; the next time a message is drawn it shows them
        cleanup(subscribe("PRESENCE_UPDATES", () => keyCache.clear()));
        cleanup(() => keyCache.clear());
    },
});

/** In member lists: drawn again whenever presences change */
function ListIcons({ userId }: { userId: string; }) {
    const stores = ["PresenceStore", "SessionsStore"].map(name => getStore(name)).filter(Boolean);
    const key: string = FluxUtils.useStateFromStores(stores, () => statusKey(userId), [userId]);
    const icons = imageFor(key);
    if (!icons) return null;
    return <Image
        source={{ uri: icons.uri }}
        accessibilityLabel={icons.label}
        style={{ width: Math.round(LIST_ICON_SIZE * icons.width / icons.height), height: LIST_ICON_SIZE, marginLeft: 4 }}
    />;
}

/**
 * Someone's platforms and statuses, shown or not as the settings say, as a key: "desktop:online,mobile:idle", or "" for
 * none. Platforms in PC's order
 */
function statusKey(userId: string): string {
    const mine = userId === currentUserId();
    if (mine && !plugin.store.self) return "";
    const statuses = mine ? ownStatuses() : clientStatuses(userId);
    return PLATFORMS
        .filter(p => typeof statuses?.[p] === "string" && (!plugin.store.offline || (statuses[p] !== "offline" && statuses[p] !== "invisible")))
        .map(p => `${p}:${statuses![p]}`)
        .join(",");
}

/** Per user, for chat rows, which are drawn often: emptied when presences change */
const keyCache = new Map<string, string>();

function cachedKey(userId: string): string {
    let key = keyCache.get(userId);
    if (key === undefined) {
        key = statusKey(userId);
        // Only so many people are seen in a session; a cache that outgrew that starts over
        if (keyCache.size > 2000) keyCache.clear();
        keyCache.set(userId, key);
    }
    return key;
}

function parseKey(key: string): Statuses {
    return Object.fromEntries(key ? key.split(",").map(part => part.split(":")) : []);
}

function clientStatuses(userId: string): Record<string, unknown> | undefined {
    const presence = getStore("PresenceStore");
    return presence?.getClientStatus?.(userId) ?? presence?.getState?.()?.clientStatuses?.[userId];
}

/**
 * Your own, as Endcord PC works them out: each platform you have a session on, in the most present status of its
 * sessions (online, then idle, then do not disturb). This phone counts as one, in the status you set
 */
function ownStatuses(): Record<string, string> {
    const rank = (status: string) => {
        const at = ["online", "idle", "dnd"].indexOf(status);
        return at === -1 ? 3 : at;
    };
    const statuses: Record<string, string> = {};
    const add = (client: unknown, status: unknown) => {
        if (typeof client !== "string" || !(PLATFORMS as readonly string[]).includes(client) || typeof status !== "string") return;
        if (!(client in statuses) || rank(status) < rank(statuses[client])) statuses[client] = status;
    };
    const me = currentUserId();
    add("mobile", (me && getStore("PresenceStore")?.getStatus?.(me)) || "online");
    const sessions = getStore("SessionsStore")?.getSessions?.() ?? {};
    for (const session of Object.values<any>(sessions)) add(session?.clientInfo?.client, session?.status);
    return statuses;
}

/** Per set of platforms and statuses: the image, and what it says for screen readers. There are only so many */
const imageCache = new Map<string,(IconsImage & { label: string; }) | null>();

function imageFor(key: string): (IconsImage & { label: string; }) | null {
    if (!key) return null;
    if (!imageCache.has(key)) {
        const shown = parseKey(key);
        const entries = PLATFORMS.flatMap(platform => shown[platform] ? [{ platform, status: shown[platform]! }] : []);
        const image = iconsImage(entries);
        // "Desktop, Mobile"
        const label = entries.map(e => t(NAMES[e.platform])).join(", ");
        imageCache.set(key, image && { ...image, label });
    }
    return imageCache.get(key)!;
}

export default plugin;
