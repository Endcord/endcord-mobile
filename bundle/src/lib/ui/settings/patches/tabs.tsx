import { Strings, t } from "@core/i18n";
import { after } from "@lib/api/patcher";
import { findInReactTree } from "@lib/utils";
import { TableRow } from "@metro/common/components";
import { patchWhenLoaded } from "@metro/lazy";
import { findByNameLazy, findByPropsLazy } from "@metro/wrappers";
import { getVisibleSections, registeredSections } from "@ui/settings";

import { CustomPageRenderer, wrapOnPress } from "./shared";

const settingConstants = findByPropsLazy("SETTING_RENDERER_CONFIG");
const createListModule = findByPropsLazy("createList");
const SettingsOverviewScreen = findByNameLazy("SettingsOverviewScreen", false);

/** Marks the sections Endcord adds, whose titles change with the language */
const OURS = "__endcordSection";

/** Takes Endcord's sections out of Discord's list of settings sections */
function removeOurSections(sections: any[]) {
    // And by title, in case Discord copied the sections without the mark
    const titles = new Set(Object.keys(registeredSections).map(name => sectionOf(name).label));
    for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i]?.[OURS] || titles.has(sections[i]?.label)) sections.splice(i, 1);
    }
}

/** A section for Discord's list; the ones kept for plugins made for Bunny and Vendetta are titled by what is in them */
function sectionOf(name: string) {
    const title = name === "Bunny" || name === "Vendetta" ? t("Community plugins") : name;
    return { label: title, title, settings: registeredSections[name].map(row => row.key), [OURS]: true };
}

function useIsFirstRender() {
    let firstRender = false;
    React.useEffect(() => void (firstRender = true), []);
    return firstRender;
}

export function patchTabsUI(unpatches: (() => void | boolean)[]) {
    const getRows = () => Object.values(registeredSections)
        .flatMap(sect => sect.map(row => ({
            [row.key]: {
                type: "pressable",
                // title was renamed to useTitle, both are here for compatibility (thanks kmiioo) https://codeberg.org/raincord/rain/pulls/52
                useTitle: row.title,
                title: row.title,
                icon: row.icon,
                IconComponent: () => <TableRow.Icon source={row.icon} />,
                usePredicate: row.usePredicate,
                useTrailing: row.useTrailing,
                onPress: wrapOnPress(row.onPress, null, row.render, row.title()),
                withArrow: true,
                ...row.rawTabsConfig
            }
        })))
        .reduce((a, c) => Object.assign(a, c), {});

    // Discord loads the module of its settings screens only when settings first open, and a few hundred others with it:
    // patching it once it loads, rather than now, keeps them all out of Discord's startup
    unpatches.push(patchWhenLoaded(settingConstants, constants => patchRendererConfig(constants, getRows)));

    try{
        unpatches.push(after("createList", createListModule, function(args, ret) {
            const [config] = args;

            if (config?.sections && Array.isArray(config.sections)) {
                const { sections } = config;

                // Discord keeps the same list between visits, so sections added before are taken out first: HideEndcord
                // can hide them, and a section that's gone isn't left behind
                removeOurSections(sections);

                const accountSectionIndex = sections.findIndex((i: any) => i.settings?.includes("ACCOUNT"));

                if (accountSectionIndex !== -1) {
                    // Credit to @palmdevs - https://discord.com/channels/1196075698301968455/1243605828783571024/1307940348378742816

                    let index = accountSectionIndex + 1;

                    getVisibleSections().forEach(sect => {
                        sections.splice(index++, 0, sectionOf(sect));
                    });
                }
            }
            return ret;
        },));

    }catch{
        unpatches.push(after("default", SettingsOverviewScreen, (_, ret) => {
            if (useIsFirstRender()) return; // :shrug:

            const { sections } = findInReactTree(ret, i => i.props?.sections).props;
            removeOurSections(sections);
            // Credit to @palmdevs - https://discord.com/channels/1196075698301968455/1243605828783571024/1307940348378742816
            let index = -~sections.findIndex((i: any) => i.settings.includes("ACCOUNT")) || 1;

            getVisibleSections().forEach(sect => {
                sections.splice(index++, 0, sectionOf(sect));
            });
        }));
    }
}

/** Adds Endcord's pages and rows to the renderer config of `constants`, Discord's module of its settings screens */
function patchRendererConfig(constants: any, getRows: () => Record<string, unknown>) {
    let rendererConfigValue = constants.SETTING_RENDERER_CONFIG;

    Object.defineProperty(constants, "SETTING_RENDERER_CONFIG", {
        enumerable: true,
        configurable: true,
        get: () => ({
            ...rendererConfigValue,
            VendettaCustomPage: {
                type: "route",
                useTitle: () => Strings.BUNNY,
                title: () => Strings.BUNNY,
                screen: {
                    route: "VendettaCustomPage",
                    getComponent: () => CustomPageRenderer
                }
            },
            BUNNY_CUSTOM_PAGE: {
                type: "route",
                useTitle: () => Strings.BUNNY,
                title: () => Strings.BUNNY,
                screen: {
                    route: "BUNNY_CUSTOM_PAGE",
                    getComponent: () => CustomPageRenderer
                }
            },
            ...getRows()
        }),
        set: v => rendererConfigValue = v,
    });

    return () => {
        Object.defineProperty(constants, "SETTING_RENDERER_CONFIG", {
            value: rendererConfigValue,
            writable: true,
            configurable: true,
            enumerable: true
        });
    };
}
