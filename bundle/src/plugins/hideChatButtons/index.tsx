/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's HideChatButtons: an eye button beside the message box hides the buttons there, and shows them again.
 * On a phone it hides the ones left of the message box that aren't Discord's file button: Discord's Apps and Gift (or
 * Thread) buttons and the buttons other Endcord plugins put there. The emoji button stays, as Discord's phone app has
 * no other way to it.
 *
 * Discord draws that row as a memo, which only draws again when what it's given changes; the row is shown through a
 * component of this plugin that gives it whether the buttons are hidden, so it draws again when you tap the eye.
 */

import { t, tx } from "@core/i18n";
import { createProxy, useProxy } from "@core/vendetta/storage";
import { findInReactTree } from "@lib/utils";
import { createElement, forwardRef, memo } from "react";

import { definePlugin } from "../api";
import { addChatButton, afterRender, getChatInputActionButton, moduleAt } from "../common";
import { generatedIcon } from "../hooks";
import { shownButtons } from "./hide";

const ACTIONS = "modules/chat_input/native/action_buttons/ChatInputActions.tsx";
const TOGGLE_KEY = "endcord-hide-chat-buttons";
/** Discord's buttons this hides */
const DISCORD_BUTTONS = ["ChatInputActionButtonApps", "ChatInputActionButtonGiftOrThread", "ChatInputActionButtonGift"];

/** Whether the buttons show, until Discord restarts; the "opened by default" setting is where it starts, as on PC */
const state: { open: boolean; } = createProxy({ open: false }).proxy;

const plugin = definePlugin({
    id: "endcord.hide-chat-buttons",
    name: "HideChatButtons",
    description: tx("Able to hide the chat buttons"),
    icon: "EyeSlashIcon",
    tags: ["Chat", "Utility"],
    settings: {
        open: { type: "boolean", label: tx("opened by default"), default: false },
        color: { type: "boolean", label: tx("Color it red on open"), default: false },
    },
    start({ store, cleanup, logger }) {
        const module = moduleAt(ACTIONS);
        const original = module?.default;
        if (!original) throw new Error(t("Discord's chat bar buttons weren't found"));
        state.open = store.open;

        const discordTypes = new Set<unknown>(DISCORD_BUTTONS.map(name => {
            const component = moduleAt(`modules/chat_input/native/action_buttons/${name}.tsx`)?.default;
            if (!component) logger.warn(`${name} wasn't found; it won't be hidden`);
            return component;
        }).filter(Boolean));

        // The eye, first so it's always there; common's patch adds the other plugins' buttons to the same row
        cleanup(addChatButton({ key: "hide-chat-buttons", side: () => "left", render: Toggle }));

        // Leaves out the hidden buttons whenever the row is drawn
        const unpatch = afterRender(module, "default", (props, tree) => {
            if (props?.endcordShowButtons !== false) return tree;
            const row = findInReactTree(tree, (node: any) => Array.isArray(node?.props?.children));
            if (!row) return tree;
            row.props.children = shownButtons(row.props.children, discordTypes, TOGGLE_KEY);
            return tree;
        });
        if (!unpatch) throw new Error(t("Discord's chat bar buttons weren't found"));
        cleanup(unpatch);

        // The row, given whether the buttons show, so it draws again when that changes
        const Row = memo(forwardRef((props: any, ref) => {
            const { open } = useProxy(state);
            return createElement(original, { ...props, ref, endcordShowButtons: open });
        }));
        module.default = Row;
        cleanup(() => {
            if (module.default === Row) module.default = original;
        });
    },
});

function Toggle() {
    const { open } = useProxy(state);
    const { color } = useProxy(plugin.store);
    const Button = getChatInputActionButton();
    const Icon = generatedIcon(open ? "EyeSlashIcon" : "EyeIcon");
    if (!Button || !Icon) return null;
    return <Button
        accessibilityLabel={open ? t("Close") : t("Open")}
        accessibilityState={{ expanded: open }}
        IconComponent={open && color ? (props: any) => <Icon {...props} color="#c32a32" /> : Icon}
        onPress={() => state.open = !state.open}
    />;
}

export default plugin;
