import { semanticColorOf } from "@ui/color";
import { createStyles } from "@ui/styles";

// The theme's icon color; LOGO_PRIMARY, which this used before, is gone from newer Discord, leaving icons untinted
const iconColor = semanticColorOf("ICON_DEFAULT", "INTERACTIVE_ICON_DEFAULT", "INTERACTIVE_NORMAL", "TEXT_DEFAULT", "TEXT_NORMAL", "LOGO_PRIMARY");

export const usePluginCardStyles = createStyles({
    smallIcon: {
        tintColor: iconColor,
        height: 18,
        width: 18,
    },
    badgeIcon: {
        tintColor: iconColor,
        height: 12,
        width: 12,
    },
    badgesContainer: {
        flexWrap: "wrap",
        flexDirection: "row",
        gap: 6,
        borderRadius: 6,
        padding: 4
    }
});
