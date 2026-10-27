import { awaitStorage, createMMKVBackend, createStorage, wrapSync } from "@core/vendetta/storage";
import { clearFolder, downloadFile, fileExists, removeFile, writeFile } from "@lib/api/native/fs";
import { safeFetch } from "@lib/utils";

type FontMap = Record<string, string>;

export type FontDefinition = {
    spec: 1;
    name: string;
    description?: string;
    main: FontMap;
    source?: string
}

type FontStorage = Record<string, FontDefinition> & { __selected?: string; };
export const fonts = wrapSync(createStorage<FontStorage>(createMMKVBackend("BUNNY_FONTS")));

async function writeFont(font: FontDefinition | null) {
    if (!font && font !== null) throw new Error("Arg font must be a valid object or null");
    if (font) {
        await writeFile("fonts.json", JSON.stringify(font));
    } else {
        await removeFile("fonts.json");
    }
}

/**
 * Whether a font's name, or the name of one of its files, can name a folder or file: both go into the path the font is
 * saved at, so one like "../.." would write, and on removal delete, outside the fonts folder
 */
function isSafeFileName(name: unknown): name is string {
    return typeof name === "string"
        && name.length > 0 && name.length <= 100
        && !/[\\/\u0000-\u001f]/.test(name)
        && !name.startsWith(".");
}

export function validateFont(font: FontDefinition) {
    if (!font || typeof font !== "object") throw new Error("URL returned a null/non-object JSON");
    if (typeof font.spec !== "number") throw new Error("Invalid font 'spec' number");
    if (font.spec !== 1) throw new Error("Only fonts which follows spec:1 are supported");

    const requiredFields = ["name", "main"] as const;

    if (requiredFields.some(f => !font[f])) throw new Error(`Font is missing one of the fields: ${requiredFields}`);
    if (!isSafeFileName(font.name)) throw new Error("Font names can't contain slashes or start with a dot");
    if (font.name.startsWith("__")) throw new Error("Font names cannot start with __");
    if (typeof font.main !== "object" || Array.isArray(font.main)) throw new Error("A font's 'main' must map its fonts to their links");
    for (const [file, url] of Object.entries(font.main)) {
        if (!isSafeFileName(file)) throw new Error(`The font file name '${file}' can't contain slashes or start with a dot`);
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error(`The font file '${file}' needs an http(s) link`);
    }
    if (font.name in fonts) throw new Error(`There is already a font named '${font.name}' installed`);
}

export async function saveFont(data: string | FontDefinition, selected = false) {
    let fontDefJson: FontDefinition;

    if (typeof data === "string") {
        try {
            fontDefJson = await (await safeFetch(data)).json();
        } catch (e) {
            throw new Error(`Failed to fetch fonts at ${data}`, { cause: e });
        }
    } else {
        fontDefJson = data;
    }

    validateFont(fontDefJson);
    await downloadFontFiles(fontDefJson);

    fonts[fontDefJson.name] = fontDefJson;

    if (selected) await selectFont(fontDefJson.name);
    return fontDefJson;
}

/** Downloads the files of a font that aren't saved yet */
async function downloadFontFiles(font: FontDefinition) {
    // Fonts saved before their names were checked are checked here too, as the names make the paths
    if (!isSafeFileName(font.name) || Object.keys(font.main ?? {}).some(file => !isSafeFileName(file))) {
        throw new Error(`The font '${font.name}' has names that can't be saved as files`);
    }
    const errors = await Promise.allSettled(Object.entries(font.main).map(async ([file, url]) => {
        let ext = url.split(".").pop();
        if (ext !== "ttf" && ext !== "otf") ext = "ttf";
        const path = `downloads/fonts/${font.name}/${file}.${ext}`;
        if (!await fileExists(path)) await downloadFile(url, path);
    })).then(it => it.map(it => it.status === "fulfilled" ? undefined : it.reason));

    if (errors.some(it => it)) throw errors;
}

/**
 * Saves a font again from its source, or as edited; `previousName` is its name before, when the edit renamed it. It
 * stays selected if it was, and a font that can't be saved again is put back as it was.
 */
export async function updateFont(fontDef: FontDefinition, previousName = fontDef.name) {
    let fontDefCopy = { ...fontDef };
    if (fontDefCopy.source) fontDefCopy = {
        ...await fetch(fontDefCopy.source).then(it => it.json()),
        // Can't change these properties
        name: fontDef.name,
        source: fontDef.source
    };

    const previous = fonts[previousName];
    const selected = fonts.__selected === previousName;
    await removeFont(previousName);
    try {
        await saveFont(fontDefCopy, selected);
    } catch (e) {
        if (previous) await saveFont(previous, selected).catch(() => { });
        throw e;
    }
}

export async function installFont(url: string, selected = false) {
    const font = await saveFont(url);
    if (selected) await selectFont(font.name);
}

export async function selectFont(name: string | null) {
    if (name && !(name in fonts)) throw new Error("Selected font does not exist!");

    if (name) {
        fonts.__selected = name;
    } else {
        delete fonts.__selected;
    }
    await writeFont(name == null ? null : fonts[name]);
}

export async function removeFont(name: string) {
    const selected = fonts.__selected === name;
    if (selected) await selectFont(null);
    delete fonts[name];
    // Fonts saved before names were checked may have any name, and this deletes a folder
    if (!isSafeFileName(name)) return;
    try {
        await clearFolder(`downloads/fonts/${name}`);
    } catch {
        // ignore
    }
}

/** Downloads again the files fonts are missing, like after the app's data was cleared or a backup was restored */
export async function updateFonts() {
    await awaitStorage(fonts);
    await Promise.allSettled(
        Object.entries(fonts)
            .filter(([name, font]) => name !== "__selected" && typeof font === "object")
            .map(([, font]) => downloadFontFiles(font as FontDefinition))
    );
}
