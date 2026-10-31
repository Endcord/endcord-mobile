/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Small dialogs for plugins, built from Discord's own alert and action sheet so they look like the rest of the app:
 * prompt (a text field), choose (a list of options) and showText (read-only text with a copy button).
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { dismissAlert, openAlert } from "@lib/ui/alerts";
import { hideSheet, showSheet } from "@lib/ui/sheets";
import { findByFilePath } from "@metro";
import { ActionSheet, ActionSheetRow, AlertActionButton, AlertModal, BottomSheetTitleHeader, Button, Stack, Text, TextInput } from "@metro/common/components";
import { useState } from "react";
import { ScrollView } from "react-native";

import { copy, describeError, generatedIcon } from "../hooks";

export interface PromptOptions {
    title: string;
    description?: string;
    placeholder?: string;
    initial?: string;
    confirm?: string;
    multiline?: boolean;
    keyboardType?: "default" | "numeric";
    /** Whether an empty field can be saved, for prompts where that removes the value */
    allowEmpty?: boolean;
    /** Throw to keep the dialog open and show the error under the field */
    onSubmit(value: string): void | Promise<void>;
}

let promptCount = 0;

function PromptAlert({ id, options }: { id: string; options: PromptOptions; }) {
    const [value, setValue] = useState(options.initial ?? "");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = () => {
        setBusy(true);
        Promise.resolve()
            .then(() => options.onSubmit(value))
            .then(() => dismissAlert(id))
            .catch((e: unknown) => setError(describeError(e)))
            .finally(() => setBusy(false));
    };

    return <AlertModal
        title={options.title}
        content={options.description}
        extraContent={<TextInput
            autoFocus={true}
            isClearable={!options.multiline}
            multiline={options.multiline}
            placeholder={options.placeholder}
            keyboardType={options.keyboardType}
            value={value}
            onChange={(v: string) => {
                setValue(v);
                if (error) setError("");
            }}
            returnKeyType={options.multiline ? undefined : "done"}
            onSubmitEditing={options.multiline ? undefined : submit}
            state={error ? "error" : undefined}
            errorMessage={error || undefined}
        />}
        actions={<Stack>
            <Button loading={busy} text={options.confirm ?? t("Save")} variant="primary" disabled={!options.allowEmpty && !value.trim()} onPress={submit} />
            <AlertActionButton disabled={busy} text={t("Cancel")} variant="secondary" />
        </Stack>}
    />;
}

/** Asks for a line of text */
export function prompt(options: PromptOptions) {
    const id = `endcord-prompt-${++promptCount}`;
    openAlert(id, <PromptAlert id={id} options={options} />);
}

export interface Choice<T> {
    label: string;
    value: T;
    /** A generated icon's name, like "ClockIcon" */
    icon?: string;
    subLabel?: string;
    danger?: boolean;
}

const CHOOSE_SHEET = "endcord-choose";

function ChooseSheet({ title, choices, onPick }: { title: string; choices: Choice<any>[]; onPick(value: any): void; }) {
    return <ActionSheet>
        <BottomSheetTitleHeader title={title} />
        <ScrollView style={{ maxHeight: 520 }}>
            <ActionSheetRow.Group>
                {choices.map((c, i) => {
                    const Icon = c.icon ? generatedIcon(c.icon) : undefined;
                    return <ActionSheetRow
                        key={i}
                        label={c.label}
                        subLabel={c.subLabel}
                        variant={c.danger ? "danger" : undefined}
                        icon={Icon ? <ActionSheetRow.Icon IconComponent={Icon} /> : undefined}
                        onPress={() => {
                            hideSheet(CHOOSE_SHEET);
                            onPick(c.value);
                        }}
                    />;
                })}
            </ActionSheetRow.Group>
        </ScrollView>
    </ActionSheet>;
}

/** Lets the user pick one of a few options from a bottom sheet */
export function choose<T>(title: string, choices: Choice<T>[], onPick: (value: T) => void) {
    // Sheets opened from another sheet's row only show once the first one has closed
    setTimeout(() => showSheet(CHOOSE_SHEET, ChooseSheet, { title, choices, onPick }), 300);
}

/** Shows text that is too long for a toast, with a button to copy it */
export function showText(title: string, text: string) {
    const id = `endcord-text-${++promptCount}`;
    openAlert(id, <AlertModal
        title={title}
        extraContent={<ScrollView style={{ maxHeight: 360 }}>
            <Text variant="text-sm/medium" color="text-default" selectable={true}>{text}</Text>
        </ScrollView>}
        actions={<Stack>
            <Button
                text={t("Copy")}
                variant="primary"
                icon={findAssetId("CopyIcon")}
                onPress={() => {
                    copy(text);
                    dismissAlert(id);
                }}
            />
            <AlertActionButton text={t("Close")} variant="secondary" />
        </Stack>}
    />);
}

/** The key an open picker's sheet has, for closing it */
export const DATE_PICKER_SHEET = "endcord-date-picker";
export const COLOR_PICKER_SHEET = "endcord-color-picker";

/** Discord's date picker sheet, on Android and iOS. Dates are YYYY-MM-DD, in the device's time zone. */
export function pickDate({ title, value, min, max, onPick }: { title: string; value?: string; min?: string; max?: string; onPick: (date: string) => void; }) {
    const Sheet = findByFilePath("components_native/DatePickerActionSheet.tsx", true) as any;
    if (!Sheet) throw new Error(t("Discord's date picker wasn't found"));
    const toDate = (date?: string) => date ? new Date(`${date}T12:00:00`) : undefined;
    showSheet(DATE_PICKER_SHEET, Sheet, {
        mode: "date",
        title,
        startDate: toDate(value) ?? new Date(),
        minimumDate: toDate(min),
        maximumDate: toDate(max) ?? new Date(),
        // A moment, or a Date, depending on the Discord
        onSubmit: (picked: any) => {
            const date: Date = picked?.toDate?.() ?? new Date(picked);
            const pad = (n: number) => String(n).padStart(2, "0");
            onPick(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
        },
    });
}

/** Discord's color picker sheet with its color field and hue bar, on Android and iOS. Colors are 0xRRGGBB numbers. */
export function pickColor(color: number, onPick: (color: number) => void) {
    const show = findByFilePath("modules/color_picker/native/showCustomColorPickerActionSheet.tsx", true) as any;
    if (typeof show !== "function") throw new Error(t("Discord's color picker wasn't found"));
    show({ color, suggestedColors: [], onSelect: onPick });
}

