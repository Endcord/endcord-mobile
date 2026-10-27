import { t } from "@core/i18n";
import { ApplicationCommand } from "@lib/api/commands/types";
import { BundleUpdaterManager } from "@lib/api/native/modules";

export default () => <ApplicationCommand>{
    name: "reload",
    description: t("Reload Discord"),
    options: [],
    execute() {
        BundleUpdaterManager.reload();
    },
};
