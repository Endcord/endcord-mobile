/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@core/i18n";
import { createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { Button, Card, IconButton, Stack, Text, TextInput } from "@metro/common/components";

interface Rule {
    find: string;
    replace: string;
    onlyIfIncludes: string;
}

type Kind = "stringRules" | "regexRules";

const rules = wrapSync(createStorage<Record<Kind, Rule[]>>(createMMKVBackend("ENDCORD_TEXT_REPLACE_RULES", { stringRules: [], regexRules: [] })));

const list = (kind: Kind): Rule[] => Array.isArray(rules[kind]) ? rules[kind] : [];

/** "/pattern/flags" or a plain pattern, as on Endcord PC */
function toRegex(text: string) {
    const match = text.match(/^\/(.+)\/([gimsuy]*)$/);
    return match ? new RegExp(match[1], match[2]) : new RegExp(text, "g");
}

export function applyRules(content: string): string {
    for (const rule of list("stringRules")) {
        if (!rule.find || rule.onlyIfIncludes && !content.includes(rule.onlyIfIncludes)) continue;
        content = content.split(rule.find).join(rule.replace.replace(/\\n/g, "\n"));
    }
    for (const rule of list("regexRules")) {
        if (!rule.find || rule.onlyIfIncludes && !content.includes(rule.onlyIfIncludes)) continue;
        try {
            content = content.replace(toRegex(rule.find), rule.replace.replace(/\\n/g, "\n"));
        } catch {
            // An invalid pattern is shown as an error in the settings and skipped here
        }
    }
    return content;
}

function regexError(find: string) {
    try {
        toRegex(find);
        return undefined;
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

function RuleCard({ kind, index, rule }: { kind: Kind; index: number; rule: Rule; }) {
    const update = (field: keyof Rule, value: string) => {
        rules[kind] = list(kind).map((r, i) => i === index ? { ...r, [field]: value } : r);
    };
    const error = kind === "regexRules" && rule.find ? regexError(rule.find) : undefined;

    return <Card>
        <Stack spacing={8}>
            <Stack direction="horizontal" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Text variant="text-md/semibold" color="text-strong">{t("Rule {number}", { number: index + 1 })}</Text>
                <IconButton
                    size="sm"
                    variant="secondary"
                    icon={findAssetId("TrashIcon")}
                    onPress={() => void (rules[kind] = list(kind).filter((_, i) => i !== index))}
                />
            </Stack>
            <TextInput
                label={kind === "regexRules" ? t("The regex pattern") : t("The text to replace")}
                value={rule.find}
                onChange={(v: string) => update("find", v)}
                state={error ? "error" : undefined}
                errorMessage={error}
            />
            <TextInput label={t("The text to replace the found text with")} value={rule.replace} onChange={(v: string) => update("replace", v)} />
            <TextInput label={t("Only replace if the message includes")} value={rule.onlyIfIncludes} onChange={(v: string) => update("onlyIfIncludes", v)} />
        </Stack>
    </Card>;
}

function RuleList({ kind, title, description }: { kind: Kind; title: string; description: string; }) {
    return <Stack spacing={8}>
        <Text variant="text-lg/bold" color="text-strong">{title}</Text>
        <Text variant="text-sm/medium" color="text-muted">{description}</Text>
        {list(kind).map((rule, i) => <RuleCard key={i} kind={kind} index={i} rule={rule} />)}
        <Button
            text={t("Add Rule")}
            variant="secondary"
            icon={findAssetId("PlusSmallIcon")}
            onPress={() => rules[kind] = [...list(kind), { find: "", replace: "", onlyIfIncludes: "" }]}
        />
    </Stack>;
}

export default function TextReplaceRules() {
    useProxy(rules);
    return <Stack spacing={24}>
        <RuleList
            kind="stringRules"
            title={t("Text Replace Rules")}
            description={t("Simple find and replace rules. For example, find 'brb' and replace it with 'be right back'")}
        />
        <RuleList
            kind="regexRules"
            title={t("Regex Replace Rules")}
            description={t("More powerful replacements using Regular Expressions. This section is for advanced users. If you don't understand it, just ignore it")}
        />
    </Stack>;
}
