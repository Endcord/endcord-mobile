/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR, onSettingChange } from "../api";
import { command } from "../hooks";

export default definePlugin({
    id: "endcord.custom-commands",
    name: "CustomCommands",
    description: tx("Allows you to create custom slash commands / tags"),
    authors: [ENDCORD_AUTHOR],
    icon: "SlashBoxIcon",
    tags: ["Chat", "Utility"],
    settings: {
        commands: {
            type: "string",
            label: tx("Commands"),
            description: tx("One per line: name = what it sends. Use \\n for a new line."),
            placeholder: "rules = Please read #rules before posting",
            multiline: true,
            default: "",
        },
    },
    start({ store, cleanup }) {
        let unregister: Array<() => void> = [];
        const register = () => {
            unregister.forEach(u => u());
            unregister = [];
            for (const line of store.commands.split("\n")) {
                const index = line.indexOf("=");
                // Discord's rules for command names: lowercase letters, digits, - and _, at most 32 of them
                const name = line.slice(0, index).trim().toLowerCase().replace(/[^\w-]/g, "").slice(0, 32);
                const response = line.slice(index + 1).trim().replace(/\\n/g, "\n");
                if (index <= 0 || !name || !response) continue;
                unregister.push(command({
                    name,
                    description: response.length > 90 ? `${response.slice(0, 89)}…` : response,
                    options: [{ name: "extra", description: tx("Text to add after it") }],
                    run: ({ extra }) => extra ? `${response} ${extra}` : response,
                }));
            }
        };
        register();
        let timer: ReturnType<typeof setTimeout> | undefined;
        cleanup(
            () => {
                clearTimeout(timer);
                unregister.forEach(u => u());
            },
            onSettingChange(store, () => {
                clearTimeout(timer);
                timer = setTimeout(register, 800);
            }),
        );
    },
});
