/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { tx } from "@core/i18n";

import { definePlugin } from "../api";
import { enc, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.qr-code",
    name: "QRCode",
    description: tx("Send a QR code of any text or link with /qr"),
    icon: "QrCodeIcon",
    tags: ["Utility"],
    start: only({
        name: "qr",
        description: tx("Send a QR code"),
        options: [{ name: "text", description: tx("The text or link it holds"), required: true }],
        run: ({ text }) => `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&format=png&data=${enc(String(text))}`,
    }),
});
