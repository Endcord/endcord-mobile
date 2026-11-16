/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's log redaction (src/shared/redact.ts there), the same patterns. People paste their logs and error
 * reports into support channels, so a secret that reaches one has already half leaked.
 */

const REDACTED = "[redacted]";
const MAX_SCANNED_LENGTH = 200_000;

const SECRETS: [RegExp, string][] = [
    // Discord user and bot tokens. The first part is the account's id in base64, so its length follows the id's
    [/\b[\w-]{20,}\.[\w-]{6}\.[\w-]{27,}\b/g, REDACTED],
    [/\bmfa\.[\w-]{80,}\b/g, REDACTED],
    // Keys with a recognisable prefix
    [/\b(?:sk|pk|rk)-[\w-]{20,}\b/g, REDACTED],
    [/\b(?:ghp|gho|ghu|ghs|ghr)_\w{20,}\b|\bgithub_pat_\w{20,}\b/g, REDACTED],
    [/\bAKIA[0-9A-Z]{16}\b/g, REDACTED],
    // Whatever follows a header or field that holds one, keeping the name so the log stays readable
    [/\bBearer\s+[\w.~+/-]{8,}=*/gi, `Bearer ${REDACTED}`],
    [/\b(authorization|x-auth-token|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)(["']?\s*[:=]\s*["']?)[^\s"',;}&]{6,}/gi, `$1$2${REDACTED}`]
];

/** The text with Discord tokens, API keys and passwords in it replaced; very long text is left as it is */
export function redactSecrets(text: string) {
    if (typeof text !== "string" || text.length > MAX_SCANNED_LENGTH) return text;

    return SECRETS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/** A log argument without secrets: text redacted, and an error as a copy with its message and stack redacted */
export function scrub(arg: unknown): unknown {
    if (typeof arg === "string") return redactSecrets(arg);
    if (!(arg instanceof Error)) return arg;

    const clean = new Error(redactSecrets(arg.message));
    clean.name = arg.name;
    if (arg.stack) clean.stack = redactSecrets(arg.stack);
    return clean;
}
