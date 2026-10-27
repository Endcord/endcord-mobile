/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { botMessage, command } from "../hooks";
import { calculate, message } from "../shared/text";

export default definePlugin({
    id: "endcord.calculator",
    name: "Calculator",
    description: tx("/calc does quick maths right in the chat box."),
    tags: ["Utility"],
    start({ cleanup }) {
        cleanup(command({
            name: "calc",
            description: tx("Evaluate a maths expression (+ - * / % and parentheses)"),
            options: [message(tx("The expression, like (2 + 3) * 4"))],
            run: ({ message: expression }, ctx) => {
                if (!/^[\d\s+\-*/().%eE]+$/.test(expression)) {
                    botMessage(ctx.channel.id, t("Only numbers and + - * / % ( ) are allowed."));
                    return;
                }
                let result: number;
                try {
                    result = calculate(expression);
                } catch {
                    result = NaN;
                }
                if (!Number.isFinite(result)) {
                    botMessage(ctx.channel.id, t("Couldn't work that one out."));
                    return;
                }
                return `\`${expression.trim()}\` = **${Number(result.toPrecision(12))}**`;
            },
        }));
    },
});
