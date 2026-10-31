/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Only in bundles built with --test (the emulator workflow): checks Endcord against the Discord it runs in and
 * reports to logcat as "ENDCORD_TEST <json>" lines, which .github/scripts/emulator-test.sh collects.
 */

import { getLanguage, LANGUAGES, t } from "@core/i18n";
import { NativeClientInfoModule as ClientInfoManager } from "@lib/api/native/modules";
import { findByFilePath, findByName, findByProps, findByStoreName } from "@metro";
import { getEndcordPlugins } from "@plugins";
import { startEndcordPlugin, stopEndcordPlugin } from "@plugins/api";
import { version } from "bunny-build-info";

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
    // CustomProfile
    "modules/user_profile/DisplayProfile.tsx",
    "modules/collectibles/CollectiblesActionCreators.tsx",
    "../discord_common/js/shared/shared-constants/BadgeId.tsx",
];

const STORES = [
    "UserStore", "PresenceStore", "RelationshipStore", "GuildStore", "ChannelStore", "MessageStore", "SelectedChannelStore",
    "AuthenticationStore", "MediaEngineStore", "ThemeStore", "PermissionStore", "EmojiStore", "StickersStore",
    "GuildMemberStore", "UserProfileStore", "SessionsStore", "LocaleStore", "VoiceStateStore",
    // Used by the plugins Endcord gained from Endcord PC
    "DraftStore", "MaskedLinkStore", "MessageRequestStore", "GuildMemberCountStore", "DeveloperExperimentStore",
    "SpotifyStore", "ReadStateStore", "GuildChannelStore", "ActiveJoinedThreadsStore", "GuildRoleStore", "PendingReplyStore",
    "MultiAccountStore", "CollectiblesCategoryStore", "BadgeDirectoryStore",
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
    // Used by the plugins Endcord gained from Endcord PC
    ["createPendingReply"],
    ["getBestActiveInputForChannelId"],
    ["CloudUpload"],
    ["updateGuildNotificationSettings"],
    ["idleTimeout", "handleVoiceStateUpdates"],
    ["CustomStatusSetting"],
    ["getUserAvatarURL", "getUserAvatarSource"],
    ["getUserBannerURL"],
    ["resolveProfileBadgeId"],
    ["Permissions", "ChannelTypes"],
    ["selectVoiceChannel"],
    ["createFriendInvite", "getAllFriendInvites"],
    ["getAPIBaseURL", "get"],
    ["addReaction", "removeReaction"],
    ["jumpToMessage"],
    ["jsx", "jsxs"],
    // CustomProfile
    ["useName", "getGlobalName"],
    ["getUserTag", "getGlobalName"],
    ["getAvatarDecorationURL"],
    ["extractTimestamp"],
    ["fetchCollectiblesCategories"],
    ["getRootNavigationRef"],
];

const NAMES = ["RowManager", "ProfileBanner", "HeaderAvatar", "GuildIcon", "UserProfileHeader", "ChatInput", "MessageRecord", "useBadges", "LongPressMessageActionSheet"];

// When the self-test started; the workflow's screenshot loop only starts a minute after launch
const startedAt = Date.now();

async function run() {
    report("env", {
        bundle: version,
        build: ClientInfoManager.getConstants().Build,
        version: ClientInfoManager.getConstants().Version,
    });

    // Storages pages draw from, and whether they've loaded: a page that draws before one has loaded must wait for it
    const { settings } = require("@lib/api/settings");
    const { VdPluginManager } = require("@core/vendetta/plugins");
    const emitter = Symbol.for("vendetta.storage.emitter");
    // Endcord must not load plugin code it doesn't need: on a fresh install every plugin is off
    report("lazy", { pluginsLoadedAtStartup: require("@plugins").loadedPluginCount(), timings: require("@core/timings").getTimings() });
    const { themes } = require("@lib/addons/themes");
    report("storages", { settings: !!settings[emitter], vendettaPlugins: !!VdPluginManager.plugins?.[emitter], themes: !!themes[emitter] });

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

    // Every plugin must start and stop cleanly, even before anyone has logged in. One that never finishes starting is
    // reported, not waited for, so the plugins after it are still checked.
    for (const plugin of getEndcordPlugins()) {
        const result: Record<string, unknown> = { id: plugin.id };
        try {
            await Promise.race([
                startEndcordPlugin(plugin),
                wait(15_000).then(() => Promise.reject(new Error("Didn't finish starting within 15 seconds"))),
            ]);
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

    const { TextInput, NativeModules } = require("react-native");
    report("textinput", { type: typeof TextInput, render: typeof TextInput?.render, keys: Object.keys(TextInput ?? {}).slice(0, 20) });
    // Whether CustomSounds and NotificationVolume can wrap Discord's sound player on this Discord
    const soundManager = NativeModules.DCDSoundManager;
    let patchable: unknown = false;
    try {
        const original = soundManager?.prepare;
        const unpatch = require("@lib/api/patcher").instead("prepare", soundManager, (args: any[], orig: any) => orig(...args));
        patchable = soundManager.prepare !== original;
        unpatch();
    } catch (e) {
        patchable = String(e);
    }
    // Discord renames its color tokens between versions; which of the names Endcord's screens use this one has
    const { semanticColors } = require("@ui/color");
    const tokenNames = ["ICON_DEFAULT", "INTERACTIVE_ICON_DEFAULT", "INTERACTIVE_NORMAL", "TEXT_DEFAULT", "TEXT_NORMAL", "TEXT_MUTED", "LOGO_PRIMARY",
        "BACKGROUND_BASE_LOWER", "BG_BASE_SECONDARY", "BG_BASE_PRIMARY", "BACKGROUND_SECONDARY", "BACKGROUND_PRIMARY", "TEXT_FEEDBACK_CRITICAL", "TEXT_DANGER"];
    // The colors Discord draws in raw white: those on filled controls and those on its own surfaces are what themes for
    // older Discord get wrong, so Endcord's legacy color map must name them as this Discord does
    const definitions = findByProps("SemanticColor")?.SemanticColor ?? {};
    report("tokens", {
        present: tokenNames.filter(n => semanticColors?.[n]),
        missing: tokenNames.filter(n => !semanticColors?.[n]),
        sample: Object.keys(semanticColors ?? {}).filter(k => /^(ICON|BACKGROUND|BG)_/.test(k)).slice(0, 40),
        white: Object.keys(definitions).filter(k => /^WHITE(_500)?$/.test(definitions[k]?.dark?.raw)),
    });
    report("native", {
        soundManager: typeof soundManager,
        keys: Object.keys(soundManager ?? {}).slice(0, 20),
        prepare: typeof soundManager?.prepare,
        patchable,
        jsSound: Object.keys(findByProps("playSound") ?? {}).slice(0, 12),
    });
    // CustomProfile's photo picker, and the loader's bridge that SmoothType draws its caret through
    const { callLoaderMethod, callLoaderMethodAsync, getNativeModule } = require("@lib/api/native/modules");
    const bridge = async (method: string, ...args: unknown[]) => {
        const outcome = async (call: () => unknown) => {
            try {
                return { ok: true, result: await call() ?? null };
            } catch (e) {
                return { ok: false, error: String(e) };
            }
        };
        // Newer Discord has no react-native-svg, which the synchronous path goes through
        return { sync: await outcome(() => callLoaderMethod(method, ...args)), async: await outcome(() => callLoaderMethodAsync(method, ...args)) };
    };
    report("loader", {
        imagePicker: typeof getNativeModule("ImagePickerManager")?.launchImageLibrary,
        info: await bridge("revenge.info"),
        smoothType: await bridge("endcord.smoothType.configure", false, 0xffffff, 60, "ease"),
    });

    await behaviour();
    await screens();

    report("timings", require("@core/timings").getTimings());
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

    await check("plugin buttons reach the message box", async () => {
        const { afterRender } = require("@plugins/common");
        const forms: Record<string, string> = {};
        let pass = true;
        for (const name of ["ChatInputActions", "ChatInputRightActions"]) {
            const module = findByFilePath(`modules/chat_input/native/action_buttons/${name}.tsx`) as any;
            const component = module?.default;
            forms[name] = typeof component === "function" ? "function"
                : typeof component?.type === "function" ? "memo"
                    : typeof component?.type?.render === "function" ? "memo of forwardRef"
                        : typeof component?.render === "function" ? "forwardRef" : "unknown";
            const unpatch = module && afterRender(module, "default", () => { });
            if (unpatch) unpatch();
            else pass = false;
        }
        const button = findByFilePath("modules/chat_input/native/action_buttons/ChatInputActionButton.tsx") as any;
        return { forms, button: !!button?.default, pass: pass && !!button?.default };
    });

    await check("a selected theme changes Discord's colors", async () => {
        const { selectTheme } = require("@lib/addons/themes");
        const { _colorRef } = require("@lib/addons/themes/colors/updater");
        const { resolveSemanticColor, semanticColorOf } = require("@lib/ui/color");
        const token = semanticColorOf("TEXT_DEFAULT");
        const before = resolveSemanticColor(token);
        const theme = {
            id: "endcord-test-theme", selected: false,
            data: { name: "Test", spec: 2, semanticColors: { TEXT_DEFAULT: ["#ffeb3b", "#ffeb3b"] }, rawColors: {} },
        };
        await selectTheme(theme);
        await wait(500);
        // Logged out, Discord's ThemeStore doesn't take the new theme, so its key is asked for by name
        const { key } = _colorRef;
        const during = resolveSemanticColor(token, key);
        await selectTheme(null);
        await wait(500);
        const after = resolveSemanticColor(token);
        return {
            before, during, key, after,
            pass: String(during).toLowerCase().startsWith("#ffeb3b") && String(key).startsWith("bn-theme-") && after === before,
        };
    });

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

    const hooks = require("@plugins/hooks");
    const byName = (name: string) => getEndcordPlugins().find(p => p.name === name)!;
    const withPlugins = async <T>(names: string[], fn: () => Promise<T> | T): Promise<T> => {
        const started = names.map(byName);
        for (const p of started) await startEndcordPlugin(p);
        try {
            return await fn();
        } finally {
            for (const p of started.reverse()) stopEndcordPlugin(p);
        }
    };

    await check("send transforms run in order", () => withPlugins(["WriteUpperCase", "ClearURLs", "NormalizeMessageLinks"], async () => {
        const message = { content: "hello there. see https://canary.discord.com/channels/1/2/3?utm_source=x" };
        const sent = await hooks.runTransforms("1111111111111111111", message, false, {});
        const expected = "Hello there. See https://discord.com/channels/1/2/3";
        return { sent, out: message.content, pass: sent === true && message.content === expected };
    }));

    await check("send transforms can cancel and set flags", () => withPlugins(["SilentMessageToggle"], async () => {
        const silent = byName("SilentMessageToggle");
        (silent.store as any).enabled = true;
        (silent.store as any).autoDisable = true;
        const options: any = {};
        await hooks.runTransforms("1111111111111111111", { content: "shh" }, false, options);
        const flagged = options.flags === 4096;
        const turnedOff = (silent.store as any).enabled === false;
        return { flags: options.flags, turnedOff, pass: flagged && turnedOff };
    }));

    await check("text commands register", () => withPlugins(["BoldText", "ShipCalc", "Calculator", "MoreCommands"], () => {
        const { commands } = require("@metro/common");
        // Like Revenge's own lookup: newer Discord takes a list of command types, older a single one
        let builtIn: any[];
        try {
            builtIn = commands.getBuiltInCommands(1, true, false);
        } catch {
            builtIn = commands.getBuiltInCommands([1], true, false);
        }
        const all = builtIn.map((c: any) => c.name);
        const wanted = ["bold", "ship", "calc", "choose", "morse"];
        const { calculate, toBold, morse } = require("@plugins/shared/text");
        return {
            found: wanted.filter(n => all.includes(n)),
            calc: calculate("(2 + 3) * 4 - 10 % 4"),
            bold: toBold("Ab1"),
            morse: morse("SOS"),
            pass: wanted.every(n => all.includes(n)) && calculate("(2 + 3) * 4 - 10 % 4") === 18 && morse("SOS") === "... --- ...",
        };
    }));

    await check("incoming messages are filtered", () => withPlugins(["ClientSideBlock", "BlockKeywords"], async () => {
        const MessageStore = findByStoreName("MessageStore");
        (byName("ClientSideBlock").store as any).usersToBlock = "4444444444444444444";
        (byName("BlockKeywords").store as any).blockedWords = "forbiddenword";
        const channelId = "1111111111111111111";
        const author = (id: string) => ({ id, username: "endcord-test", discriminator: "0", avatar: null, bot: false });
        const message = (id: string, from: string, content: string) => ({
            id, channel_id: channelId, content, type: 0, flags: 0, author: author(from), timestamp: new Date().toISOString(),
            edited_timestamp: null, attachments: [], embeds: [], mentions: [], mention_roles: [], pinned: false,
            mention_everyone: false, tts: false, components: [], reactions: [],
        });
        FluxDispatcher.dispatch({ type: "MESSAGE_CREATE", channelId, message: message("5555555555555555551", "4444444444444444444", "from a hidden user"), optimistic: false, isPushNotification: false });
        FluxDispatcher.dispatch({ type: "MESSAGE_CREATE", channelId, message: message("5555555555555555552", "3333333333333333333", "this has forbiddenword in it"), optimistic: false, isPushNotification: false });
        FluxDispatcher.dispatch({ type: "MESSAGE_CREATE", channelId, message: message("5555555555555555553", "3333333333333333333", "a normal message"), optimistic: false, isPushNotification: false });
        await wait(100);
        const hiddenUser = !MessageStore.getMessage(channelId, "5555555555555555551");
        const hiddenWord = !MessageStore.getMessage(channelId, "5555555555555555552");
        const kept = !!MessageStore.getMessage(channelId, "5555555555555555553");
        (byName("ClientSideBlock").store as any).usersToBlock = "";
        (byName("BlockKeywords").store as any).blockedWords = "";
        return { hiddenUser, hiddenWord, kept, pass: hiddenUser && hiddenWord && kept };
    }));

    await check("message rows", () => withPlugins(["PinIcon", "WordCount", "RealtimeTimestamps", "IrcColors"], () => {
        const MessageStore = findByStoreName("MessageStore");
        const RowManager = findByName("RowManager");
        const record = MessageStore.getMessage("1111111111111111111", "5555555555555555553") ?? MessageStore.getMessage("1111111111111111111", "2222222222222222222");
        if (!record) throw new Error("No test message to draw");
        const manager = new RowManager();
        manager.setOptions?.({ renderEmbeds: true, renderReactions: true, renderReplies: true, inlineAttachmentMedia: true, inlineEmbedMedia: true });
        const row = manager.generate({ rowType: 1, changeType: 0, message: record, isFirst: true, canShowImages: true, canAddNewReactions: false, roleStyle: "username" });
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(row?.message ?? {})) fields[key] = Array.isArray(value) ? `array(${(value as any[]).length})` : typeof value === "string" ? `string: ${String(value).slice(0, 40)}` : typeof value;
        const timestamp = String(row?.message?.timestamp ?? "");
        return { type: row?.type, fields, pass: row?.type === 1 && /words?/.test(timestamp) && /\d{1,2}[:.]\d{2}[:.]\d{2}/.test(timestamp) };
    }));

    // Endcord PC's popular plugins, each by what it does
    const { instead } = require("@lib/api/patcher");

    await check("fake-nitro sends emojis you can't use as links", async () => {
        const messages = findByProps("sendMessage", "editMessage");
        // Caught under the plugin's own patch, so nothing reaches Discord's API
        let sent: any;
        const unstub = instead("sendMessage", messages, (args: any[]) => void (sent = args[1]));
        try {
            return await withPlugins(["FakeNitro"], async () => {
                await messages.sendMessage("1111111111111111111", { content: "hi <:endcord:123456789012345678>", invalidEmojis: [{ id: "123456789012345678", name: "endcord" }], validNonShortcutEmojis: [], tts: false });
                const content = String(sent?.content ?? "");
                return { content, pass: content.startsWith("hi https://cdn.discordapp.com/emojis/123456789012345678.webp") && sent.invalidEmojis?.length === 0 };
            });
        } finally {
            unstub();
        }
    });

    await check("hide-endcord hides Endcord's settings sections", async () => {
        const { getVisibleSections } = require("@ui/settings");
        const plugin = byName("HideEndcord");
        await startEndcordPlugin(plugin);
        const store = plugin.store as any;
        const previous = store.hidden;
        store.hidden = true;
        const hidden = getVisibleSections().length === 0;
        store.hidden = false;
        const shown = getVisibleSections().length > 0;
        store.hidden = previous;
        stopEndcordPlugin(plugin);
        const shownAfterStop = getVisibleSections().length > 0;
        return { hidden, shown, shownAfterStop, pass: hidden && shown && shownAfterStop };
    });

    await check("relationship-notifier tells you when a friend removes you", async () => {
        const { toasts } = require("@metro/common");
        const shown: string[] = [];
        const unstub = instead("open", toasts, (args: any[], original: Function) => {
            shown.push(String(args[1]?.text ?? ""));
            return original(...args);
        });
        try {
            return await withPlugins(["RelationshipNotifier"], async () => {
                FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id: "6666666666666666666", type: 1, nickname: null } });
                await wait(100);
                const notice = shown.find(text => text.includes("6666666666666666666"));
                return { notice, pass: !!notice };
            });
        } finally {
            unstub();
        }
    });

    await check("oneko adds its overlay and takes it away", async () => {
        const { overlayCount } = require("@core/overlay");
        const before = overlayCount();
        const plugin = byName("oneko");
        await startEndcordPlugin(plugin);
        const whileOn = overlayCount();
        stopEndcordPlugin(plugin);
        const after = overlayCount();
        return { before, whileOn, after, pass: whileOn === before + 1 && after === before };
    });
}

/** Shows Endcord's pages one at a time; the workflow takes a screenshot of each when it sees the "shot" line */
async function screens() {
    // The workflow takes launch screenshots for the first minute and only then watches for "shot" lines
    await wait(Math.max(0, 90_000 - (Date.now() - startedAt)));
    const { showTestScreen } = require("@core/debug/testScreens");
    const { settings } = require("@lib/api/settings");
    const PluginSettings = require("@plugins/ui/PluginSettings").default;
    const byId = (id: string) => getEndcordPlugins().find(p => p.id === id)!;
    const pluginPage = (id: string) => () => PluginSettings({ plugin: byId(id) });

    const { Strings } = require("@core/i18n");
    // Screenshot name, the title the app shows for the page, and the page
    const pages: Array<[string, () => string, any]> = [
        ["general", () => Strings.GENERAL, require("@core/ui/settings/pages/General").default],
        ["plugins", () => Strings.PLUGINS, require("@core/ui/settings/pages/Plugins").default],
        ["messagelogger", () => "MessageLogger", pluginPage("endcord.message-logger")],
        ["fakenitro", () => "FakeNitro", pluginPage("endcord.fake-nitro")],
        ["themelibrary", () => "ThemeLibrary", pluginPage("endcord.theme-library")],
        ["textreplace", () => "TextReplace", pluginPage("endcord.text-replace")],
        ["customrpc", () => "CustomRPC", pluginPage("endcord.custom-rpc")],
        ["wellbeing", () => "Wellbeing", pluginPage("endcord.wellbeing")],
        ["themes", () => Strings.THEMES, require("@core/ui/settings/pages/Themes").default],
    ];

    const previous = settings.language;
    try {
        for (const language of ["en", "tr"] as const) {
            settings.language = language;
            for (const [name, title, render] of pages) {
                if (language === "tr" && !["general", "plugins", "messagelogger"].includes(name)) continue;
                try {
                    showTestScreen({ title: title(), render });
                    await wait(5000);
                    report("shot", { name: `${language}-${name}` });
                    // A screenshot and a UI dump take a few seconds on the emulator
                    await wait(7000);
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
