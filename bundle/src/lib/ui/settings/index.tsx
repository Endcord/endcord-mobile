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
 * @internal
 */
export function patchSettings() {
    const unpatches = new Array<() => boolean>;

    patchTabsUI(unpatches);

    return () => unpatches.forEach(u => u());
}
