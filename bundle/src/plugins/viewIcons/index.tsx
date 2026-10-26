/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByName, findByProps } from "@metro";
import { clipboard } from "@metro/common";
import { cloneElement } from "react";
import { Image, Pressable } from "react-native";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { afterRender, getStore, moduleAt } from "../common";

const { openMediaModal } = lazyDestructure(() => findByProps("openMediaModal"));
const { hideActionSheet } = lazyDestructure(() => findByProps("openLazy", "hideActionSheet"));

const plugin = definePlugin({
    id: "endcord.view-icons",
    name: "ViewIcons",
    description: tx("Tap avatars, banners and server icons to see them full size."),
    authors: [ENDCORD_AUTHOR],
    popular: 6,
    icon: "ImageIcon",
    tags: ["Media", "Servers", "Appearance"],
    settings: {
        size: {
            type: "select",
            label: tx("Image size"),
            default: "4096",
            options: [
                { label: "1024 px", value: "1024" },
                { label: "2048 px", value: "2048" },
                { label: "4096 px", value: "4096" },
            ],
        },
        format: {
            type: "select",
            label: tx("Image format"),
            description: tx("Animated images always open as GIF"),
            default: "png",
            options: [
                { label: "PNG", value: "png" },
                { label: "WebP", value: "webp" },
                { label: "JPEG", value: "jpg" },
            ],
        },
    },
    start({ cleanup, logger }) {
        const banner = findByName("ProfileBanner", false) ?? moduleAt("modules/user_profile/native/UserProfileBanner.tsx");
        const avatar = findByName("HeaderAvatar", false) ?? moduleAt("modules/profile_customization/native/HeaderAvatar.tsx");
        const guildIcon = findByName("GuildIcon", false) ?? moduleAt("modules/guild/native/GuildIcon.tsx");
        if (!banner && !avatar && !guildIcon) throw new Error("Discord's profile images weren't found");

        const unpatchBanner = afterRender(banner, "default", (props, res) => {
            const url = bannerUrl(props);
            return url && res ? <Viewable url={url}>{res}</Viewable> : res;
        });
        if (unpatchBanner) cleanup(unpatchBanner);
        else logger.warn("Profile banners not found");

        const unpatchAvatar = afterRender(avatar, "default", (props, res) => {
            // Avatars that already do something on tap (editing your profile) keep it
            if (props?.onPress || props?.isEditing || props?.editable) return res;
            const url = avatarUrl(props);
            if (!url || !res) return res;
            const guildUrl = guildAvatarUrl(props);
            // The style moves to the touchable wrapper so the avatar keeps its place
            const style = res.props?.style;
            const inner = style ? cloneElement(res, { style: undefined }) : res;
            return <Viewable url={url} longPressUrl={guildUrl} style={style}>{inner}</Viewable>;
        });
        if (unpatchAvatar) cleanup(unpatchAvatar);
        else logger.warn("Profile avatars not found");

        const unpatchGuildIcon = afterRender(guildIcon, "default", (props, res) => {
            // Only the large icon at the top of a server's sheet, not the server list
            if (props?.size !== "XLARGE" && props?.size !== "XXLARGE") return res;
            const url = guildIconUrl(props?.guild);
            return url && res ? <Viewable url={url}>{res}</Viewable> : res;
        });
        if (unpatchGuildIcon) cleanup(unpatchGuildIcon);
    },
});

function ext(hash: string) {
    return hash.startsWith("a_") ? "gif" : plugin.store.format;
}

function sized(url: string) {
    const clean = url.replace(/\?.*$/, "");
    const animated = /\/a_[^/]+$/.test(clean.replace(/\.\w+$/, ""));
    const withExt = clean.replace(/\.(webp|png|jpg|jpeg|gif)$/, `.${animated ? "gif" : plugin.store.format}`);
    return `${withExt}?size=${plugin.store.size}`;
}

function bannerUrl(props: any): string | null {
    const uri = props?.bannerSource?.uri;
    if (typeof uri === "string" && uri.startsWith("http")) return sized(uri);
    const user = props?.user ?? props?.displayProfile;
    const hash = props?.displayProfile?.banner ?? user?.banner;
    if (user?.id && typeof hash === "string") return `https://cdn.discordapp.com/banners/${user.id}/${hash}.${ext(hash)}?size=${plugin.store.size}`;
    return null;
}

function avatarUrl(props: any): string | null {
    const user = props?.user;
    if (!user?.id) return null;
    if (typeof user.avatar === "string") return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext(user.avatar)}?size=${plugin.store.size}`;
    // Default avatars are only available as PNG
    const index = user.discriminator && user.discriminator !== "0" ? Number(user.discriminator) % 5 : Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function guildAvatarUrl(props: any): string | undefined {
    const { user, guildId } = props ?? {};
    const hash = guildId && (user?.guildMemberAvatars?.[guildId] ?? getStore("GuildMemberStore")?.getMember?.(guildId, user?.id)?.avatar);
    if (typeof hash !== "string") return undefined;
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${user.id}/avatars/${hash}.${ext(hash)}?size=${plugin.store.size}`;
}

function guildIconUrl(guild: any): string | null {
    if (!guild?.id || typeof guild.icon !== "string") return null;
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext(guild.icon)}?size=${plugin.store.size}`;
}

function open(url: string, event?: { pageX?: number; pageY?: number; }) {
    const show = (width: number, height: number) => {
        try {
            hideActionSheet?.();
            openMediaModal({
                initialSources: [{ uri: url, sourceURI: url, width, height }],
                initialIndex: 0,
                originLayout: { width: 0, height: 0, x: event?.pageX ?? 0, y: event?.pageY ?? 0, resizeMode: "fill" },
            });
        } catch (e) {
            console.error("[Endcord] ViewIcons couldn't open the image", e);
            clipboard.setString(url);
            showToast(t("Couldn't open the image; its link was copied"), findAssetId("LinkIcon"));
        }
    };
    const size = Number(plugin.store.size);
    Image.getSize(url, show, () => show(size, size));
}

function Viewable({ url, longPressUrl, style, children }: { url: string; longPressUrl?: string; style?: any; children: any; }) {
    return <Pressable
        style={style}
        accessibilityRole="imagebutton"
        accessibilityLabel={t("View full size")}
        onPress={e => open(url, e.nativeEvent)}
        onLongPress={e => {
            if (longPressUrl) open(longPressUrl, e.nativeEvent);
            else {
                clipboard.setString(url);
                showToast(t("Image link copied"), findAssetId("LinkIcon"));
            }
        }}
    >
        {children}
    </Pressable>;
}

export default plugin;
