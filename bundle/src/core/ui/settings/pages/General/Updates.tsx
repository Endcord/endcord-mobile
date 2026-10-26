/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { BundleUpdaterManager } from "@lib/api/native/modules";
import { showToast } from "@lib/ui/toasts";
import { safeFetch } from "@lib/utils";
import { BUILDS_URL } from "@lib/utils/constants";
import { TableRow, TableRowGroup } from "@metro/common/components";
import { version } from "bunny-build-info";
import { useState } from "react";

type State =
    | { kind: "idle"; }
    | { kind: "checking"; }
    | { kind: "current"; }
    | { kind: "available"; builtAt?: string; }
    | { kind: "failed"; };

/**
 * Endcord PC's updater, for the bundle: the loader downloads the newest Endcord whenever the app starts, so updating
 * means reloading once a newer build is published.
 */
export default function Updates() {
    const [state, setState] = useState<State>({ kind: "idle" });
    const [hash] = version.split("-");

    const check = async () => {
        setState({ kind: "checking" });
        try {
            const info = await safeFetch(`${BUILDS_URL}/data.json?t=${Date.now()}`, { cache: "no-store" }).then(r => r.json());
            if (typeof info?.commit !== "string") throw new Error("No build information");
            if (info.commit.startsWith(hash)) {
                setState({ kind: "current" });
                showToast(t("No updates found"), findAssetId("CheckmarkLargeIcon"));
            } else {
                setState({ kind: "available", builtAt: info.builtAt });
            }
        } catch {
            setState({ kind: "failed" });
        }
    };

    const status = {
        idle: t("Endcord updates itself every time the app starts."),
        checking: t("Loading..."),
        current: t("Up to date"),
        available: t("There is 1 Update"),
        failed: t("Couldn't check for updates. Check your connection and try again."),
    }[state.kind];

    return <TableRowGroup title={t("Updates")}>
        <TableRow
            label={t("Check for Updates")}
            subLabel={status}
            icon={<TableRow.Icon source={findAssetId("RetryIcon")!} />}
            disabled={state.kind === "checking"}
            onPress={check}
        />
        {state.kind === "available" && <TableRow
            arrow
            label={t("Update Now")}
            subLabel={t("Reload the app to fully apply changes")}
            icon={<TableRow.Icon source={findAssetId("DownloadIcon")!} />}
            onPress={() => BundleUpdaterManager.reload()}
        />}
    </TableRowGroup>;
}
