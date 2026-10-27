/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction } from "../hooks";
import { convertUnits } from "../shared/actions";
import { showText } from "../ui/dialogs";

export default definePlugin({
    id: "endcord.unit-converter",
    name: "UnitConverter",
    description: tx("Convert metric and imperial units in a message from the message menu"),
    icon: "ArrowsLeftRightIcon",
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(addMessageAction({
            key: "unit-converter",
            icon: "ArrowsLeftRightIcon",
            label: () => t("Convert Units"),
            visible: message => convertUnits(message.content ?? "").length > 0,
            onPress: message => showText(t("Convert Units"), convertUnits(message.content).join("\n")),
        }));
    },
});
