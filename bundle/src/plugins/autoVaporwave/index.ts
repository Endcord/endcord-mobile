/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { onSend, outsideCode } from "../hooks";
import { toFullwidth } from "../shared/compose";

export default definePlugin({
    id: "endcord.auto-vaporwave",
    name: "AutoVaporwave",
    description: tx("Turn every message you send into ｆｕｌｌｗｉｄｔｈ text automatically."),
    tags: ["Chat", "Fun"],
    start({ cleanup }) {
        cleanup(onSend("auto-vaporwave", (content, { editing }) => editing ? undefined : outsideCode(content, toFullwidth), 20));
    },
});
