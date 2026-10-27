/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's plugins that change a message as you send it. They all run through onSend, in a fixed order: text
 * rewrites first, then formatting, then the signature, so they combine the same way every time.
 *
 * What more than one of these plugins uses.
 */

import { tx } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";

import { getChatInputActionButton } from "../common";
import { generatedIcon } from "../hooks";
import { SlashedIcon } from "../silentTyping";

export const chatButtonSetting = {
    type: "select" as const,
    label: tx("Chat bar button"),
    default: "none",
    options: [
        { label: tx("Hidden"), value: "none" },
        { label: tx("Left of the message box"), value: "left" },
        { label: tx("Right of the message box"), value: "right" },
    ],
};

export const toFullwidth = (text: string) => text.replace(/[ -~]/g, c => c === " " ? "\u3000" : String.fromCharCode(c.charCodeAt(0) + 0xFEE0));

/** Capitalises the first letter of every sentence, leaving words in `blocked` alone */
export function capitalizeSentences(text: string, blocked: string[]) {
    return text.split(/([.!?]+['")\]]*\s+|\n+)/).map((part, i) => {
        if (i % 2 === 1 || !part) return part;
        const lower = part.toLowerCase();
        if (blocked.some(word => word && lower.startsWith(word))) return part;
        return part.replace(/^(\s*)(\S)/, (_, space, first) => space + first.toUpperCase());
    }).join("");
}

export const splitList = (text: string) => text.split(",").map(w => w.trim().toLowerCase()).filter(Boolean);

/** Removes the shortest indentation from every line of each code block */
export function unindentCodeBlocks(content: string) {
    return content.replace(/```[\s\S]*?```/g, block => {
        const lines = block.split("\n");
        if (lines.length < 2) return block;
        const suffix = lines[lines.length - 1] === "```" ? lines.pop()! : "";
        const body = lines.slice(1).join("\n").replace(/\t/g, "    ");
        const indent = Math.min(...(body.match(/^ *(?=\S)/gm) ?? [""]).map(s => s.length));
        const trimmed = indent > 0 && Number.isFinite(indent) ? body.replace(new RegExp(`^ {${indent}}`, "gm"), "") : body;
        return `${lines[0]}\n${trimmed}\n${suffix}`;
    });
}

/** A chat bar button that switches a boolean setting, with a line through its icon when it's off */
export function ToggleButton({ store, field, icon, label, on, off, slashWhenOn }: { store: any; field: string; icon: string; label: string; on: string; off: string; slashWhenOn?: boolean; }) {
    const values = useProxy(store);
    const Button = getChatInputActionButton();
    const Icon = generatedIcon(icon);
    if (!Button || !Icon) return null;
    const enabled = !!values[field];
    const slashed = slashWhenOn ? enabled : !enabled;
    return <Button
        accessibilityLabel={label}
        accessibilityState={{ checked: enabled }}
        IconComponent={slashed ? (props: any) => <SlashedIcon Icon={Icon} {...props} /> : Icon}
        onPress={() => {
            store[field] = !store[field];
            showToast(store[field] ? on : off, findAssetId(icon));
        }}
    />;
}
