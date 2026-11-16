/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Font packs Endcord suggests, each a family with its own files for Discord's weights, so bold text stays bold: fonts
 * that come as one variable file show every weight as the regular one on Android, and aren't here. All are under the
 * SIL Open Font License or the Ubuntu Font Licence, from Google Fonts' repository at a fixed commit, so a file never
 * changes after it was chosen.
 */

import { tx } from "@core/i18n";

import type { FontDefinition } from ".";

const GOOGLE_FONTS = "https://raw.githubusercontent.com/google/fonts/35e77c3854970a550d9894a85aba21420813a019";

/** Discord's own fonts, as React Native names them: each is drawn with the file the pack gives it */
type Weights = {
    normal: string;
    italic: string;
    medium?: string;
    mediumItalic?: string;
    semibold?: string;
    bold: string;
    extraBold?: string;
    /** For code blocks */
    mono?: { normal: string; bold: string; };
};

function pack(folder: string, w: Weights): Record<string, string> {
    const file = (name: string) => `${GOOGLE_FONTS}/${folder}/${name}.ttf`;
    const main: Record<string, string> = {
        "ggsans-Normal": file(w.normal),
        "ggsans-NormalItalic": file(w.italic),
        "ggsans-Medium": file(w.medium ?? w.normal),
        "ggsans-MediumItalic": file(w.mediumItalic ?? w.italic),
        "ggsans-Semibold": file(w.semibold ?? w.bold),
        "ggsans-Bold": file(w.bold),
        "ggsans-ExtraBold": file(w.extraBold ?? w.bold),
    };
    if (w.mono) {
        const [monoFolder, normal] = w.mono.normal.split(":");
        const [, bold] = w.mono.bold.split(":");
        main["ggmono-Normal"] = `${GOOGLE_FONTS}/${monoFolder}/${normal}.ttf`;
        main["ggmono-Bold"] = `${GOOGLE_FONTS}/${monoFolder}/${bold}.ttf`;
    }
    return main;
}

export interface BuiltinFont {
    definition: FontDefinition;
    /** English, translated where it's shown */
    description: string;
}

export const BUILTIN_FONTS: BuiltinFont[] = [
    {
        definition: {
            spec: 1, name: "Barlow", main: pack("ofl/barlow", {
                normal: "Barlow-Regular", italic: "Barlow-Italic", medium: "Barlow-Medium", mediumItalic: "Barlow-MediumItalic",
                semibold: "Barlow-SemiBold", bold: "Barlow-Bold", extraBold: "Barlow-ExtraBold",
            }),
        },
        description: tx("Endcord's own typeface: narrow and clean."),
    },
    {
        definition: {
            spec: 1, name: "Atkinson Hyperlegible", main: pack("ofl/atkinsonhyperlegible", {
                normal: "AtkinsonHyperlegible-Regular", italic: "AtkinsonHyperlegible-Italic", bold: "AtkinsonHyperlegible-Bold",
            }),
        },
        description: tx("Made to be easy to read for people with low vision: every letter looks different from the others."),
    },
    {
        definition: {
            spec: 1, name: "Fira Sans", main: pack("ofl/firasans", {
                normal: "FiraSans-Regular", italic: "FiraSans-Italic", medium: "FiraSans-Medium", mediumItalic: "FiraSans-MediumItalic",
                semibold: "FiraSans-SemiBold", bold: "FiraSans-Bold", extraBold: "FiraSans-ExtraBold",
                mono: { normal: "ofl/firamono:FiraMono-Regular", bold: "ofl/firamono:FiraMono-Bold" },
            }),
        },
        description: tx("Friendly and very readable on small screens, with Fira Mono for code."),
    },
    {
        definition: {
            spec: 1, name: "Poppins", main: pack("ofl/poppins", {
                normal: "Poppins-Regular", italic: "Poppins-Italic", medium: "Poppins-Medium", mediumItalic: "Poppins-MediumItalic",
                semibold: "Poppins-SemiBold", bold: "Poppins-Bold", extraBold: "Poppins-ExtraBold",
            }),
        },
        description: tx("Round and geometric."),
    },
    {
        definition: {
            spec: 1, name: "Ubuntu", main: pack("ufl/ubuntu", {
                normal: "Ubuntu-Regular", italic: "Ubuntu-Italic", medium: "Ubuntu-Medium", mediumItalic: "Ubuntu-MediumItalic",
                bold: "Ubuntu-Bold",
                mono: { normal: "ufl/ubuntumono:UbuntuMono-Regular", bold: "ufl/ubuntumono:UbuntuMono-Bold" },
            }),
        },
        description: tx("Ubuntu's typeface, with Ubuntu Mono for code."),
    },
    {
        definition: {
            spec: 1, name: "Lato", main: pack("ofl/lato", {
                normal: "Lato-Regular", italic: "Lato-Italic", bold: "Lato-Bold", extraBold: "Lato-Black",
            }),
        },
        description: tx("Warm and steady."),
    },
    {
        definition: {
            spec: 1, name: "Comic Neue", main: pack("ofl/comicneue", {
                normal: "ComicNeue-Regular", italic: "ComicNeue-Italic", bold: "ComicNeue-Bold",
            }),
        },
        description: tx("Comic Sans, tidied up. For fun."),
    },
    {
        definition: {
            spec: 1, name: "VT323", main: pack("ofl/vt323", {
                normal: "VT323-Regular", italic: "VT323-Regular", bold: "VT323-Regular",
                mono: { normal: "ofl/vt323:VT323-Regular", bold: "ofl/vt323:VT323-Regular" },
            }),
        },
        description: tx("A pixel terminal font, like Endcord's pixel logo. Best for short chats."),
    },
];

for (const font of BUILTIN_FONTS) font.definition.description = font.description;
