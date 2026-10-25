/*
 * Endcord for Android
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Helpers shared by Endcord's plugins. Everything that touches Discord's modules is resolved lazily and tolerates the
 * module not being there, so a Discord update can turn a feature off but never crash the app.
 */

import { intercept } from "@lib/api/flux";
import { after } from "@lib/api/patcher";
import { findInReactTree } from "@lib/utils";
import { findByFilePath, findByStoreName } from "@metro";
import { FluxDispatcher } from "@metro/common";
import type { ComponentType, ReactElement } from "react";

const storeCache = new Map<string, any>();

/** A Flux store by name, or undefined when this Discord doesn't have it */
export function getStore<T = any>(name: string): T | undefined {
    if (!storeCache.has(name)) {
        const store = findByStoreName(name);
        if (!store) return undefined;
        storeCache.set(name, store);
    }
    return storeCache.get(name);
}

export const currentUserId = (): string | undefined => getStore("UserStore")?.getCurrentUser?.()?.id;

/**
 * Sees every Flux action of a type before Discord does. Return undefined to let it through, false to drop it, or an
 * object to merge into it.
 */
export function onAction<P extends Record<string, any> = Record<string, any>>(type: string, cb: (payload: P & { type: string; }) => unknown) {
    return intercept(payload => payload.type === type ? cb(payload as any) : undefined);
}

/** Runs after Discord has handled the action */
export function subscribe(type: string, cb: (payload: any) => void) {
    const listener = (payload: any) => {
        try {
            cb(payload);
        } catch (e) {
            console.error(`[Endcord] ${type} listener failed`, e);
        }
    };
    FluxDispatcher.subscribe(type, listener);
    return () => FluxDispatcher.unsubscribe(type, listener);
}

/** Dispatches outside the current dispatch, which Flux doesn't allow nesting */
export function dispatchSoon(action: Record<string, any>) {
    setTimeout(() => {
        try {
            FluxDispatcher.dispatch(action);
        } catch (e) {
            console.error(`[Endcord] dispatching ${action.type} failed`, e);
        }
    }, 0);
}

/** The module at a path in Discord's source tree, which survives the renames that break name lookups */
export function moduleAt<T = any>(path: string): T | undefined {
    return findByFilePath(path) as T | undefined;
}

// Chat input buttons: one patch on Discord's chat input action row, shared by every plugin that adds a button

interface ChatButton {
    key: string;
    side: () => "left" | "right" | "none";
    render: ComponentType;
}

const chatButtons = new Map<string, ChatButton>();
let unpatchChatInput: (() => void) | null = null;

const ACTION_PATHS = {
    left: "modules/chat_input/native/action_buttons/ChatInputActions.tsx",
    right: "modules/chat_input/native/action_buttons/ChatInputRightActions.tsx",
} as const;

export function getChatInputActionButton(): ComponentType<any> | undefined {
    return moduleAt("modules/chat_input/native/action_buttons/ChatInputActionButton.tsx")?.default;
}

function insertButtons(tree: ReactElement, side: "left" | "right") {
    try {
        const node = findInReactTree(tree, n => Array.isArray(n?.props?.children));
        if (!node) return tree;
        const children: any[] = node.props.children;
        for (const button of chatButtons.values()) {
            const index = children.findIndex(c => c?.key === `endcord-${button.key}`);
            if (index !== -1) children.splice(index, 1);
            if (button.side() !== side) continue;
            const element = <button.render key={`endcord-${button.key}`} />;
            // Left: after Discord's attachment button. Right: before the emoji button.
            if (side === "left") children.push(element);
            else children.unshift(element);
        }
    } catch (e) {
        console.error("[Endcord] adding chat input buttons failed", e);
    }
    return tree;
}

function patchChatInput() {
    if (unpatchChatInput) return;
    const unpatches: Array<() => unknown> = [];
    for (const side of ["left", "right"] as const) {
        const actions = moduleAt(ACTION_PATHS[side])?.default;
        if (!actions) {
            console.warn(`[Endcord] chat input ${side} actions not found; plugin buttons won't show there`);
            continue;
        }
        // A memo component: its render function is `type`
        if (typeof actions.type === "function") unpatches.push(after("type", actions, (_, tree) => insertButtons(tree, side)));
        else if (typeof actions === "function") console.warn("[Endcord] chat input actions aren't a memo component");
    }
    unpatchChatInput = () => unpatches.forEach(u => u());
}

/** Adds a button to the row of buttons beside the chat input. Returns the function that removes it. */
export function addChatButton(button: ChatButton) {
    chatButtons.set(button.key, button);
    patchChatInput();
    return () => {
        chatButtons.delete(button.key);
        if (!chatButtons.size) {
            unpatchChatInput?.();
            unpatchChatInput = null;
        }
    };
}
