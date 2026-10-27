/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin } from "../api";
import { addMessageAction, openUrl } from "../hooks";
import { mediaOf, pickOne } from "../shared/actions";
import { choose } from "../ui/dialogs";

const ENGINES: Record<string, string> = {
    Google: "https://lens.google.com/uploadbyurl?url=",
    Yandex: "https://yandex.com/images/search?rpt=imageview&url=",
    SauceNAO: "https://saucenao.com/search.php?url=",
    IQDB: "https://iqdb.org/?url=",
    Bing: "https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:",
    TinEye: "https://www.tineye.com/search?url=",
    ImgOps: "https://imgops.com/start?url=",
};

export default definePlugin({
    id: "endcord.reverse-image-search",
    name: "ReverseImageSearch",
    description: tx("Search for a message's image on Google Lens, Yandex, SauceNAO and more from the message menu"),
    icon: "MagnifyingGlassIcon",
    tags: ["Media", "Utility"],
    start({ cleanup }) {
        const images = (message: any) => mediaOf(message).filter(m => m.image);
        cleanup(addMessageAction({
            key: "reverse-image-search",
            icon: "MagnifyingGlassIcon",
            label: () => t("Search Image"),
            visible: message => images(message).length > 0,
            onPress: message => pickOne(t("Search Image"), images(message), m => m.label, image => {
                choose(t("Search Image"), Object.keys(ENGINES).map(name => ({ label: name, value: name })), engine => {
                    openUrl(ENGINES[engine] + encodeURIComponent(image.url));
                });
            }),
        }));
    },
});
