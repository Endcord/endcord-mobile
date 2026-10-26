/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType } from "@lib/api/commands/types";
import { before } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { messageUtil } from "@metro/common";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { addChatButton, getChatInputActionButton, getStore, moduleAt } from "../common";
import { SlashedIcon } from "../silentTyping";

interface VoiceStatePayload {
    guildId?: string | null;
    channelId?: string | null;
    selfMute?: boolean;
    selfDeaf?: boolean;
    [key: string]: unknown;
}

const GATEWAY_SOCKET = "modules/gateway/GatewaySocket.tsx";
const icon = (name: string) => () => moduleAt(`design/components/Icon/native/redesign/generated/${name}.tsx`)?.[name];
const MicrophoneIcon = icon("MicrophoneIcon");
const HeadphonesIcon = icon("HeadphonesIcon");

/** The voice state Discord last sent to the gateway, before the fake flags were applied */
let lastState: VoiceStatePayload | null = null;
let socket: { voiceStateUpdate(state: VoiceStatePayload): void; } | null = null;

const plugin = definePlugin({
    id: "endcord.fake-mute",
    name: "FakeMute",
    description: tx("Appear muted or deafened to others in voice channels while your microphone and sound keep working."),
    authors: [ENDCORD_AUTHOR],
    popular: 12,
    icon: "MicrophoneSlashIcon",
    tags: ["Voice", "Utility"],
    settings: {
        fakeMute: {
            type: "boolean",
            label: tx("Fake mute"),
            description: tx("Others see you as muted, but still hear you"),
            default: false,
        },
        fakeDeafen: {
            type: "boolean",
            label: tx("Fake deafen"),
            description: tx("Others see you as deafened, but you still hear them"),
            default: false,
        },
        button: {
            type: "select",
            label: tx("Chat bar buttons"),
            description: tx("Buttons beside the message box to switch fake mute and fake deafen"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup, logger }) {
        const GatewaySocket = moduleAt(GATEWAY_SOCKET)?.default;
        const proto = GatewaySocket?.prototype;
        if (typeof proto?.voiceStateUpdate !== "function") throw new Error("Discord's gateway socket wasn't found");

        const unpatch = before("voiceStateUpdate", proto, function (this: any, args: any[]) {
            socket = this;
            const state = args[0] as VoiceStatePayload;
            if (!state || typeof state !== "object") return;
            lastState = { ...state };
            if (!state.channelId) return;
            const patched = { ...state };
            if (store.fakeMute) patched.selfMute = true;
            if (store.fakeDeafen) patched.selfDeaf = true;
            return [patched];
        });

        cleanup(
            () => {
                // Unpatched first, so the voice server is told the real state again
                unpatch();
                if (store.fakeMute || store.fakeDeafen) resend(logger);
                lastState = null;
                socket = null;
            },
            // Switches in the settings page apply to the current call too
            onSettingChange(store, key => {
                if (key === "fakeMute" || key === "fakeDeafen") resend(logger);
            }),
            addChatButton({
                key: "fake-mute",
                side: () => store.button as "left" | "right" | "none",
                render: () => <FakeButton kind="fakeMute" />,
            }),
            addChatButton({
                key: "fake-deafen",
                side: () => store.button as "left" | "right" | "none",
                render: () => <FakeButton kind="fakeDeafen" />,
            }),
            registerCommand({
                name: "fakemute",
                description: t("Appear muted while your microphone keeps working"),
                options: [booleanOption()],
                execute(args, ctx) {
                    set("fakeMute", args.find(a => a.name === "value")?.value as unknown as boolean | undefined);
                    messageUtil.sendBotMessage(ctx.channel.id, store.fakeMute ? t("Fake mute is on") : t("Fake mute is off"));
                },
            }),
            registerCommand({
                name: "fakedeafen",
                description: t("Appear deafened while you can still hear"),
                options: [booleanOption()],
                execute(args, ctx) {
                    set("fakeDeafen", args.find(a => a.name === "value")?.value as unknown as boolean | undefined);
                    messageUtil.sendBotMessage(ctx.channel.id, store.fakeDeafen ? t("Fake deafen is on") : t("Fake deafen is off"));
                },
            }),
        );
    },
});

function booleanOption() {
    return {
        name: "value",
        description: t("On or off (default: switch)"),
        type: ApplicationCommandOptionType.BOOLEAN,
        required: false,
    } as any;
}

/** The voice state from Discord's stores, for a call that started before the plugin did */
function currentState(): VoiceStatePayload | null {
    const channelId = getStore("SelectedChannelStore")?.getVoiceChannelId?.();
    if (!channelId) return null;
    const media = getStore("MediaEngineStore");
    return {
        guildId: getStore("ChannelStore")?.getChannel?.(channelId)?.guild_id ?? null,
        channelId,
        selfMute: !!media?.isSelfMute?.(),
        selfDeaf: !!media?.isSelfDeaf?.(),
        selfVideo: !!media?.isVideoEnabled?.(),
    };
}

/** Sends the voice state again, so a change applies to the call you're in right away */
function resend(logger?: { warn(...a: any[]): void; }) {
    const target = socket ?? moduleAt("modules/gateway/GatewaySocketSingleton.tsx")?.default;
    const state = lastState?.channelId ? lastState : currentState();
    if (!target?.voiceStateUpdate || !state?.channelId) return;
    try {
        target.voiceStateUpdate({ ...state });
    } catch (e) {
        logger?.warn("Couldn't update the voice state", e);
    }
}

function set(kind: "fakeMute" | "fakeDeafen", value?: boolean) {
    // The settings listener sends the new state
    plugin.store[kind] = value ?? !plugin.store[kind];
}

function FakeButton({ kind }: { kind: "fakeMute" | "fakeDeafen"; }) {
    const store = useProxy(plugin.store);
    const Button = getChatInputActionButton();
    const Icon = kind === "fakeMute" ? MicrophoneIcon() : HeadphonesIcon();
    if (!Button || !Icon) return null;
    const on = store[kind];

    return <Button
        accessibilityLabel={kind === "fakeMute" ? t("Fake mute") : t("Fake deafen")}
        accessibilityState={{ checked: on }}
        IconComponent={on ? (props: any) => <SlashedIcon Icon={Icon} {...props} /> : Icon}
        onPress={() => {
            set(kind);
            const now = plugin.store[kind];
            const text = kind === "fakeMute"
                ? (now ? t("Fake mute is on") : t("Fake mute is off"))
                : (now ? t("Fake deafen is on") : t("Fake deafen is off"));
            showToast(text, findAssetId(kind === "fakeMute" ? "MicrophoneSlashIcon" : "HeadphonesSlashIcon"));
        }}
    />;
}

export default plugin;
