import { Strings, t } from "@core/i18n";
import AddonPage from "@core/ui/components/AddonPage";
import FontEditor from "@core/ui/settings/pages/Fonts/FontEditor";
import { useProxy } from "@core/vendetta/storage";
import { FontDefinition, fonts } from "@lib/addons/fonts";
import { settings } from "@lib/api/settings";
import compareNames from "@lib/utils/compareNames";
import { NavigationNative } from "@metro/common";

import FontCard from "./FontCard";

export default function Fonts() {
    useProxy(settings);
    useProxy(fonts);

    const navigation = NavigationNative.useNavigation();

    return (
        <AddonPage<FontDefinition>
            title={Strings.FONTS}
            searchKeywords={["name", "description"]}
            sortOptions={{
                [t("Name (A-Z)")]: (a, b) => compareNames(a.name, b.name),
                [t("Name (Z-A)")]: (a, b) => compareNames(b.name, a.name)
            }}
            items={Object.values(fonts)}
            safeModeHint={{ message: Strings.SAFE_MODE_NOTICE_FONTS }}
            CardComponent={FontCard}
            installAction={{
                label: Strings.INSTALL_FONT,
                onPress: () => {
                    navigation.push("BUNNY_CUSTOM_PAGE", {
                        title: t("Import font"),
                        render: () => <FontEditor />
                    });
                }
            }}
        />
    );
}
