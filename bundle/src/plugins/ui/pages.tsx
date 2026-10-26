/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Pages of a plugin's own, like the windows Endcord PC's plugins open.
 */

import { findByProps } from "@metro";
import type { ComponentType } from "react";

export type PageComponent = ComponentType<{ close: () => void; }>;

/**
 * Opens a page: inside Discord's settings, as the settings' next page; anywhere else (the chat, EndcordToolbox), as a
 * full-screen window with a close button, since the settings' pages can't be reached from outside them.
 */
export function openPage(title: string, Page: PageComponent, navigation?: any) {
    if (navigation) {
        navigation.push("BUNNY_CUSTOM_PAGE", { title, render: () => <Page close={() => navigation.goBack()} /> });
        return;
    }
    const modals = findByProps("pushLazy");
    const { Navigator, getHeaderCloseButton } = findByProps("Navigator", "getHeaderCloseButton") ?? {};
    if (typeof modals?.push !== "function" || !Navigator || typeof getHeaderCloseButton !== "function") throw new Error("Discord's screens weren't found");
    const close = () => modals.pop();
    modals.push(() => <Navigator
        initialRouteName="ENDCORD_PAGE"
        screens={{
            ENDCORD_PAGE: {
                title,
                headerLeft: getHeaderCloseButton(close),
                render: () => <Page close={close} />,
            },
        }}
    />);
}
