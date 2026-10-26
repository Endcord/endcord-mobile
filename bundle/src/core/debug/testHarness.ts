/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Only in bundles built with --test (the emulator workflow): checks Endcord against the Discord it runs in and
 * reports to logcat as "ENDCORD_TEST <json>" lines, which .github/scripts/emulator-test.sh collects.
 */

import { getEndcordPlugins } from "@plugins";
import { startEndcordPlugin, stopEndcordPlugin } from "@plugins/api";
import { findByFilePath, findByName, findByProps, findByStoreName } from "@metro";
import { NativeClientInfoModule as ClientInfoManager } from "@lib/api/native/modules";
import { version } from "bunny-build-info";
import { getLanguage, LANGUAGES, t } from "@core/i18n";

function report(kind: string, data: unknown) {
    try {
        console.log(`ENDCORD_TEST ${JSON.stringify({ kind, data })}`);
    } catch (e) {
        console.log(`ENDCORD_TEST ${JSON.stringify({ kind, data: String(data), error: String(e) })}`);
    }
}

function describe(value: any, depth = 0): any {
    if (value == null) return String(value);
    const type = typeof value;
    if (type === "function") {
        const proto = value.prototype && Object.getOwnPropertyNames(value.prototype).filter(k => k !== "constructor");
        return { fn: value.name || "(anonymous)", length: value.length, ...(proto?.length ? { proto: proto.slice(0, 40) } : {}) };
    }
    if (type !== "object") return type;
    if (depth > 0) return Array.isArray(value) ? `array(${value.length})` : `object(${Object.keys(value).length})`;
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).slice(0, 60)) {
        try {
            out[key] = describe(value[key], depth + 1);
        } catch (e) {
            out[key] = `<throws ${e}>`;
        }
    }
    return out;
}

/** Module paths and names whose shape the plugins depend on */
const PATHS: string[] = [
    "actions/TypingActionCreators.tsx",
    "actions/AudioActionCreators.tsx",
    "actions/MessageActionCreators.tsx",
    "actions/RelationshipActionCreators.tsx",
    "modules/messages/native/renderer/RowGenerator.tsx",
    "modules/chat_input/native/action_buttons/ChatInputActions.tsx",
    "modules/chat_input/native/action_buttons/ChatInputRightActions.tsx",
    "modules/chat_input/native/action_buttons/ChatInputActionButton.tsx",
    "modules/chat_input/native/ChatInput.tsx",
    "modules/media_viewer/native/components/openMediaModal.tsx",
    "modules/toast/native/ToastActionCreators.tsx",
    "lib/MessageQueue.tsx",
    "modules/gateway/GatewaySocket.tsx",
    "modules/gateway/GatewaySocketSingleton.tsx",
    "modules/gateway/LocalVoiceStateManager.tsx",
    "modules/emojis/EmojiConstants.tsx",
    "modules/emoji_picker/native/components/EmojiPickerList.tsx",
    "modules/stickers/native/StickerPickerListRow.tsx",
    "modules/premium/ProductCatalog.tsx",
    "modules/user_profile/native/UserProfileBanner.tsx",
    "modules/profile_customization/native/HeaderAvatar.tsx",
    "modules/guild/native/GuildIcon.tsx",
];

const STORES = [
    "UserStore", "PresenceStore", "RelationshipStore", "GuildStore", "ChannelStore", "MessageStore", "SelectedChannelStore",
    "AuthenticationStore", "MediaEngineStore", "ThemeStore", "PermissionStore", "EmojiStore", "StickersStore",
    "GuildMemberStore", "UserProfileStore", "SessionsStore", "LocaleStore", "VoiceStateStore"
];

const PROPS: string[][] = [
    ["startTyping", "stopTyping"],
    ["toggleSelfMute", "toggleSelfDeaf"],
    ["sendMessage", "editMessage"],
    ["getUserAvatarURL"],
    ["getGuildIconURL"],
    ["openLazy", "hideActionSheet"],
    ["showUserProfile"],
    ["getSocket"],
    ["canUserUse"],
    ["countEmoji"],
    ["openMediaModal"],
    ["removeRelationship"],
    ["leaveGuild"],
    ["closePrivateChannel"],
];

const NAMES = ["RowManager", "ProfileBanner", "HeaderAvatar", "GuildIcon", "UserProfileHeader", "ChatInput"];

async function run() {
    report("env", {
        bundle: version,
        build: ClientInfoManager.getConstants().Build,
        version: ClientInfoManager.getConstants().Version,
    });

    const locale = findByStoreName("LocaleStore");
    report("i18n", {
        language: getLanguage(),
        locale: locale?.locale,
        plugins: t("Plugins"),
        tables: LANGUAGES.map(l => l.code),
    });

    for (const path of PATHS) {
        try {
            report("path", { path, exports: describe(findByFilePath(path)) });
        } catch (e) {
            report("path", { path, error: String(e) });
        }
    }

    for (const name of STORES) {
        try {
            const store = findByStoreName(name);
            const proto = store && Object.getPrototypeOf(store);
            report("store", { name, found: !!store, methods: proto ? Object.getOwnPropertyNames(proto).slice(0, 80) : [] });
        } catch (e) {
            report("store", { name, error: String(e) });
        }
    }

    for (const props of PROPS) {
        try {
            report("props", { props, exports: describe(findByProps(...props)) });
        } catch (e) {
            report("props", { props, error: String(e) });
        }
    }

    for (const name of NAMES) {
        try {
            report("name", { name, exports: describe(findByName(name, false)) });
        } catch (e) {
            report("name", { name, error: String(e) });
        }
    }

    // Every plugin must start and stop cleanly, even before anyone has logged in
    for (const plugin of getEndcordPlugins()) {
        const result: Record<string, unknown> = { id: plugin.id };
        try {
            await startEndcordPlugin(plugin);
            result.started = true;
        } catch (e) {
            result.started = false;
            result.error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
        }
        try {
            stopEndcordPlugin(plugin);
            result.stopped = true;
        } catch (e) {
            result.stopped = false;
            result.stopError = String(e);
        }
        report("plugin", result);
    }

    const { TextInput } = require("react-native");
    report("textinput", { type: typeof TextInput, render: typeof TextInput?.render, keys: Object.keys(TextInput ?? {}).slice(0, 20) });

    await behaviour();
    await screens();

    report("done", {});
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Plugins' effects on Discord's own stores, with a made-up channel and message */
async function behaviour() {
    const { FluxDispatcher } = require("@metro/common");
    const byId = (id: string) => getEndcordPlugins().find(p => p.id === id)!;
    const check = async (name: string, fn: () => Promise<unknown>) => {
        try {
            report("behaviour", { name, result: await fn() });
        } catch (e) {
            report("behaviour", { name, error: e instanceof Error ? `${e.message}
${e.stack}` : String(e) });
        }
    };

    await check("message-logger keeps a deleted message", async () => {
        const MessageStore = findByStoreName("MessageStore");
        const channelId = "1111111111111111111";
        const message = {
            id: "2222222222222222222", channel_id: channelId, content: "Endcord test message", type: 0, flags: 0,
            author: { id: "3333333333333333333", username: "endcord-test", discriminator: "0", avatar: null, bot: false },
            timestamp: new Date().toISOString(), edited_timestamp: null, attachments: [], embeds: [], mentions: [],
            mention_roles: [], pinned: false, mention_everyone: false, tts: false, components: [], reactions: [],
        };
        FluxDispatcher.dispatch({
            type: "LOAD_MESSAGES_SUCCESS", channelId, messages: [message], isBefore: false, isAfter: false,
            hasMoreBefore: false, hasMoreAfter: false, limit: 50, jump: undefined, truncate: false,
        });
        const loaded = !!MessageStore.getMessage(channelId, message.id);
        const plugin = byId("endcord.message-logger");
        await startEndcordPlugin(plugin);
        FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", id: message.id, channelId });
        const keptWhileOn = !!MessageStore.getMessage(channelId, message.id);
        stopEndcordPlugin(plugin);
        await wait(200);
        const removedWhenOff = !MessageStore.getMessage(channelId, message.id);
        return { loaded, keptWhileOn, removedWhenOff, pass: loaded && keptWhileOn && removedWhenOff };
    });

    await check("silent-typing blocks the typing action", async () => {
        let seen = 0;
        const listener = () => seen++;
        FluxDispatcher.subscribe("TYPING_START_LOCAL", listener);
        const plugin = byId("endcord.silent-typing");
        try {
            await startEndcordPlugin(plugin);
            FluxDispatcher.dispatch({ type: "TYPING_START_LOCAL", channelId: "1111111111111111111" });
            const whileOn = seen;
            stopEndcordPlugin(plugin);
            FluxDispatcher.dispatch({ type: "TYPING_START_LOCAL", channelId: "1111111111111111111" });
            return { whileOn, afterOff: seen, pass: whileOn === 0 && seen === 1 };
        } finally {
            FluxDispatcher.unsubscribe("TYPING_START_LOCAL", listener);
        }
    });

    await check("clear-urls cleans links", async () => {
        const { cleanUrl } = require("@plugins/clearUrls");
        const out = cleanUrl("https://example.com/a?utm_source=x&id=5#top");
        return { out, pass: out === "https://example.com/a?id=5#top" };
    });
}

/** Shows Endcord's pages one at a time; the workflow takes a screenshot of each when it sees the "shot" line */
async function screens() {
    const { showTestScreen } = require("@core/debug/testScreens");
    const { settings } = require("@lib/api/settings");
    const PluginSettings = require("@plugins/ui/PluginSettings").default;
    const byId = (id: string) => getEndcordPlugins().find(p => p.id === id)!;
    const pluginPage = (id: string) => () => PluginSettings({ plugin: byId(id) });

    const pages: Array<[string, any]> = [
        ["general", require("@core/ui/settings/pages/General").default],
        ["plugins", require("@core/ui/settings/pages/Plugins").default],
        ["messagelogger", pluginPage("endcord.message-logger")],
        ["fakenitro", pluginPage("endcord.fake-nitro")],
        ["themelibrary", pluginPage("endcord.theme-library")],
        ["themes", require("@core/ui/settings/pages/Themes").default],
    ];

    const previous = settings.language;
    try {
        for (const language of ["en", "tr"] as const) {
            settings.language = language;
            for (const [name, render] of pages) {
                if (language === "tr" && !["general", "plugins", "messagelogger"].includes(name)) continue;
                try {
                    showTestScreen({ title: name, render });
                    await wait(5000);
                    report("shot", { name: `${language}-${name}` });
                    await wait(4000);
                } catch (e) {
                    report("screen-error", { name, error: String(e) });
                }
            }
        }
    } finally {
        settings.language = previous;
        showTestScreen(null);
    }
}

export function initTestHarness() {
    // After Discord has started, so its modules are initialized
    setTimeout(() => {
        run().catch(e => report("fatal", e instanceof Error ? `${e.message}\n${e.stack}` : String(e)));
    }, 15000);
}
