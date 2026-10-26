// Good luck reading this!
import { lazy } from "react";
import type { ImageURISource } from "react-native";

import { patchTabsUI } from "./patches/tabs";

export interface RowConfig {
    key: string;
    title: () => string;
    onPress?: () => any;
    render?: Parameters<typeof lazy>[0];
    icon?: ImageURISource | number;
    IconComponent?: React.ReactNode,
    usePredicate?: () => boolean,
    useTrailing?: () => string | JSX.Element,
    rawTabsConfig?: Record<string, any>;
}

export const registeredSections = {} as {
    [key: string]: RowConfig[];
};

/** Set by the HideEndcord plugin: Endcord's sections are left out of Discord's settings */
export const sectionVisibility = { hidden: false };

/** The sections to show: empty ones (kept for plugins that add rows to them) and hidden ones are left out */
export function getVisibleSections(): string[] {
    if (sectionVisibility.hidden) return [];
    return Object.keys(registeredSections).filter(name => registeredSections[name].length > 0);
}

export function registerSection(section: { name: string; items: RowConfig[]; }) {
    registeredSections[section.name] = section.items;
    return () => delete registeredSections[section.name];
}

/**
 * Adds a row to a registered section, after the row with the key `after` or else at the end. It shows from the next
 * time Discord's settings open.
 */
export function addSectionRow(section: string, row: RowConfig, after?: string) {
    const rows = registeredSections[section] ??= [];
    const anchor = after ? rows.findIndex(r => r.key === after) : -1;
    if (anchor >= 0) rows.splice(anchor + 1, 0, row);
    else rows.push(row);
    return () => {
        const index = registeredSections[section]?.indexOf(row) ?? -1;
        if (index >= 0) registeredSections[section].splice(index, 1);
    };
}

/**
 * @internal
 */
export function patchSettings() {
    const unpatches = new Array<() => boolean>;

    patchTabsUI(unpatches);

    return () => unpatches.forEach(u => u());
}
