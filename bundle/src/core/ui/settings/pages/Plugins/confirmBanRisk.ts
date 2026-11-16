import { Strings, t } from "@core/i18n";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { BAN_RISK_LEAD, banRiskOf } from "@plugins/banRisk";

/**
 * Turns a built-in plugin on, asking first when Discord can suspend accounts for what it does (plugins/banRisk.ts):
 * every switch and button that turns one on goes through here
 */
export function turnOnAfterBanRisk(name: string, turnOn: () => void) {
    const risk = banRiskOf({ name, endcord: true });
    if (!risk) {
        turnOn();
        return;
    }
    showConfirmationAlert({
        title: t("Turn on {name}?", { name }),
        content: `${t(BAN_RISK_LEAD)} ${t(risk)}`,
        confirmText: t("Turn it on"),
        confirmColor: "red",
        cancelText: Strings.CANCEL,
        onConfirm: turnOn,
    });
}
