/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ShareX custom uploader configs (.sxcu), as Endcord PC's FileUpload reads them: where to send the file, how, and where
 * the link is in the answer ($json:path$, {json:path}, $response$, {response}).
 */

import { t } from "@core/i18n";

export interface ShareXConfig {
    DestinationType?: string;
    RequestMethod?: string;
    RequestURL: string;
    Headers?: Record<string, string>;
    Body?: string;
    FileFormName?: string;
    Arguments?: Record<string, string>;
    URL?: string;
    ErrorMessage?: string;
}

/** The longest config read; real ones are a few hundred characters */
const MAX_CONFIG_LENGTH = 20_000;
const MAX_ENTRIES = 50;
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;

/** A config's headers or arguments as plain strings, without anything that could change an object's prototype */
function stringRecord(value: unknown, what: string): Record<string, string> | undefined {
    if (value == null) return undefined;
    if (typeof value !== "object" || Array.isArray(value)) throw new Error(t("ShareX {what} must be an object", { what }));
    const out: Record<string, string> = Object.create(null);
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_ENTRIES) throw new Error(t("ShareX {what} has too many entries", { what }));
    for (const [key, raw] of entries) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
        if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") continue;
        const text = String(raw);
        // A line break in a header would start another one
        if (/[\r\n\0]/.test(text) || /[\r\n\0]/.test(key)) throw new Error(t("ShareX {what} can't have line breaks", { what }));
        out[key] = text;
    }
    return out;
}

export function parseShareXConfig(text: string): ShareXConfig {
    const normalized = text.replace(/^\uFEFF/, "").trim();
    if (!normalized) throw new Error(t("ShareX config is required"));
    if (normalized.length > MAX_CONFIG_LENGTH) throw new Error(t("Invalid ShareX JSON"));
    let parsed: any;
    try {
        parsed = JSON.parse(normalized);
    } catch {
        throw new Error(t("Invalid ShareX JSON"));
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(t("ShareX config must be a JSON object"));
    if (typeof parsed.RequestURL !== "string" || !parsed.RequestURL.trim()) throw new Error(t("ShareX RequestURL is required"));
    const destinations = typeof parsed.DestinationType === "string" ? parsed.DestinationType.split(",").map((d: string) => d.trim()).filter(Boolean) : [];
    if (destinations.length && !destinations.includes("FileUploader") && !destinations.includes("ImageUploader")) {
        throw new Error(t("ShareX DestinationType must include FileUploader or ImageUploader"));
    }
    const headers = stringRecord(parsed.Headers, "Headers");
    for (const name of Object.keys(headers ?? {})) if (!HEADER_NAME.test(name)) throw new Error(t("ShareX header {name} isn't a valid header name", { name: name.slice(0, 40) }));
    const optional = (value: unknown) => typeof value === "string" ? value : undefined;
    return {
        DestinationType: optional(parsed.DestinationType),
        RequestMethod: optional(parsed.RequestMethod),
        RequestURL: parsed.RequestURL.trim(),
        Headers: headers,
        Body: optional(parsed.Body),
        FileFormName: optional(parsed.FileFormName),
        Arguments: stringRecord(parsed.Arguments, "Arguments"),
        URL: optional(parsed.URL),
        ErrorMessage: optional(parsed.ErrorMessage),
    };
}

/** $filename$ and {filename} in a header or argument */
export const withFilename = (value: string, filename: string) => value.replace(/\$filename\$|\{filename\}/g, () => filename);

/** A value at a path like files[0].url, only through the answer's own keys */
function valueAt(data: unknown, path: string): unknown {
    let current: unknown = data;
    for (const segment of path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
        if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

/** Fills a config's URL or ErrorMessage template from the server's answer */
export function resolveShareXTemplate(template: string | undefined, responseText: string, responseJson: unknown): string | undefined {
    const trimmed = template?.trim();
    if (!trimmed) return undefined;
    return trimmed
        .replace(/\$response\$|\{response\}/g, () => responseText)
        .replace(/\$json:([^$]{1,200})\$|\{json:([^}]{1,200})\}/g, (_, a: string | undefined, b: string | undefined) => {
            const value = valueAt(responseJson, (a ?? b ?? "").trim());
            return value == null || typeof value === "object" ? "" : String(value);
        });
}
