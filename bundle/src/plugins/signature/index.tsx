/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { addChatButton } from "../common";
import { botMessage, command, onSend } from "../hooks";
import { chatButtonSetting, ToggleButton } from "../shared/compose";

const Signature = definePlugin({
    id: "endcord.signature",
    name: "Signature",
    description: tx("Adds your signature to the end of every message you send"),
    authors: [ENDCORD_AUTHOR],
    icon: "PencilIcon",
    tags: ["Chat", "Customisation"],
    settings: {
        isEnabled: { type: "boolean", label: tx("Add my signature"), description: tx("Turn this off to stop adding it without turning the plugin off"), default: true },
        name: { type: "string", label: tx("Signature"), description: tx("The signature that will be added to the end of your messages"), default: "a chronic discord user" },
        textHeader: { type: "string", label: tx("Text before the signature"), description: tx("Shown before the signature, like > for a quote"), default: ">" },
        button: chatButtonSetting,
    },
    start({ store, cleanup }) {
        cleanup(
            onSend("signature", (content, { editing }) => {
                if (editing || !store.isEnabled || !store.name.trim() || !content.trim()) return;
                return `${content}\n${store.textHeader ? `${store.textHeader} ` : ""}${store.name}`;
            }, 80),
            command({
                name: "signature",
                description: tx("Turn your signature on or off"),
                options: [{ name: "value", description: tx("On or off (default: switch)"), type: "boolean" }],
                run: ({ value }, ctx) => {
                    store.isEnabled = value ?? !store.isEnabled;
                    botMessage(ctx.channel.id, store.isEnabled ? t("Signature enabled!") : t("Signature disabled!"));
                },
            }),
            addChatButton({
                key: "signature",
                side: () => store.button as "left" | "right" | "none",
                render: () => <ToggleButton store={Signature.store} field="isEnabled" icon="PencilIcon" label={t("Signature")} on={t("Signature enabled!")} off={t("Signature disabled!")} />,
            }),
        );
    },
});

export default Signature;
