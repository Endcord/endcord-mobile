/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoii and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@core/i18n";
import { useProxy } from "@core/vendetta/storage";
import { Stack, TableRadioGroup, TableRadioRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@metro/common/components";
import { ErrorBoundary } from "@ui/components";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import type { EndcordPlugin, SettingDef } from "../api";

function NumberSetting({ def, value, onChange }: { def: Extract<SettingDef, { type: "number"; }>; value: number; onChange(v: number): void; }) {
    const [text, setText] = useState(String(value));
    const parsed = Number(text);
    const valid = text.trim() !== "" && Number.isFinite(parsed) && parsed >= def.min && parsed <= def.max;

    return <TextInput
        label={t(def.label)}
        description={def.description ? t(def.description) : undefined}
        value={text}
        keyboardType="numeric"
        onChange={(v: string) => {
            setText(v);
            const n = Number(v);
            if (v.trim() !== "" && Number.isFinite(n) && n >= def.min && n <= def.max) onChange(n);
        }}
        state={valid ? undefined : "error"}
        errorMessage={valid ? undefined : t("Enter a number from {min} to {max}", { min: def.min, max: def.max })}
    />;
}

function SwitchRow({ id, def, store }: { id: string; def: SettingDef; store: any; }) {
    return <TableSwitchRow
        label={t(def.label)}
        subLabel={def.description ? t(def.description) : undefined}
        value={!!store[id]}
        onValueChange={(v: boolean) => store[id] = v}
    />;
}

function Setting({ id, def, store }: { id: string; def: SettingDef; store: any; }) {
    switch (def.type) {
        case "boolean":
            return <SwitchRow id={id} def={def} store={store} />;
        case "select":
            return <TableRadioGroup
                title={t(def.label)}
                value={store[id]}
                onChange={(v: string) => store[id] = v}
            >
                {def.options.map(o => <TableRadioRow key={o.value} label={t(o.label)} value={o.value} />)}
            </TableRadioGroup>;
        case "number":
            return <NumberSetting def={def} value={store[id]} onChange={v => store[id] = v} />;
        case "string":
            return <TextInput
                label={t(def.label)}
                description={def.description ? t(def.description) : undefined}
                placeholder={def.placeholder ? t(def.placeholder) : undefined}
                value={store[id] ?? ""}
                multiline={def.multiline}
                onChange={(v: string) => store[id] = v}
                isClearable={!def.multiline}
            />;
    }
}

export default function PluginSettings({ plugin }: { plugin: EndcordPlugin<any>; }) {
    const store = useProxy(plugin.store);
    const entries = Object.entries(plugin.settings ?? {}) as [string, SettingDef][];

    // Switches next to each other share a group, like Discord's own settings
    const blocks: Array<[string, SettingDef][]> = [];
    for (const entry of entries) {
        const last = blocks.at(-1);
        if (entry[1].type === "boolean" && last?.[0][1].type === "boolean") last.push(entry);
        else blocks.push([entry]);
    }

    return <ErrorBoundary>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={16}>
                <Text variant="text-md/medium" color="text-muted">{t(plugin.description)}</Text>
                {blocks.map(block => block[0][1].type === "boolean"
                    ? <TableRowGroup key={block[0][0]} title={t("Settings")}>
                        {block.map(([id, def]) => <SwitchRow key={id} id={id} def={def} store={store} />)}
                    </TableRowGroup>
                    : <View key={block[0][0]}>
                        <Setting id={block[0][0]} def={block[0][1]} store={store} />
                        {block[0][1].type === "select" && block[0][1].description && <Text variant="text-sm/medium" color="text-muted" style={{ marginTop: 6, marginHorizontal: 4 }}>
                            {t(block[0][1].description)}
                        </Text>}
                    </View>)}
                {plugin.SettingsComponent && <plugin.SettingsComponent store={store} />}
            </Stack>
        </ScrollView>
    </ErrorBoundary>;
}
