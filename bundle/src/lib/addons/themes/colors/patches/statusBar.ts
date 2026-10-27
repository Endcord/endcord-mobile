import { _colorRef } from "@lib/addons/themes/colors/updater";
import { before } from "@lib/api/patcher";
import { StatusBar } from "react-native";

/**
 * Discord picks the status bar's icons from its own light or dark setting, so a dark theme over Discord's light one
 * had a dark clock and dark icons on a dark bar. While a theme is on, its own kind picks them.
 */
export default function patchStatusBar() {
    return before("setBarStyle", StatusBar, args => {
        const theme = _colorRef.current;
        if (!theme || (args[0] !== "dark-content" && args[0] !== "light-content")) return;
        return [theme.reference === "light" ? "dark-content" : "light-content", ...args.slice(1)];
    });
}
