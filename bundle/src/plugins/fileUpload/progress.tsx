/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * A dialog that shows how far a file transfer has got, with a button to cancel it, like the progress bar Endcord PC's
 * FileUpload draws above the message box.
 */

import { t } from "@core/i18n";
import { dismissAlert, openAlert } from "@lib/ui/alerts";
import { AlertActionButton, AlertActions, AlertModal, Text } from "@metro/common/components";
import { semanticColorOf } from "@ui/color";
import { createStyles } from "@ui/styles";
import { useEffect, useReducer } from "react";
import { View } from "react-native";

import { formatBytes } from "./files";

const useStyles = createStyles({
    track: {
        height: 8,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: semanticColorOf("BACKGROUND_MOD_STRONG", "BACKGROUND_MOD_NORMAL", "BACKGROUND_MOD_SUBTLE"),
    },
    fill: { height: 8, borderRadius: 4, backgroundColor: "#5865f2" },
});

export interface ProgressState {
    /** What's being done, like "Uploading clip.mp4 (2/3)" */
    status: string;
    sent: number;
    total: number;
}

export interface Progress {
    /** Aborted when the user cancels, or the plugin stops */
    signal: AbortSignal;
    update(state: Partial<ProgressState>): void;
    /** Closes the dialog */
    close(): void;
    cancel(): void;
}

let count = 0;

/** Opens the progress dialog; close() it when the transfer is over, however it went */
export function showProgress(title: string, status = ""): Progress {
    const id = `endcord-transfer-${++count}`;
    const controller = new AbortController();
    let state: ProgressState = { status, sent: 0, total: 0 };
    const listeners = new Set<() => void>();

    function ProgressAlert() {
        const styles = useStyles();
        const [, redraw] = useReducer((n: number) => n + 1, 0);
        useEffect(() => {
            listeners.add(redraw);
            return () => void listeners.delete(redraw);
        }, []);
        const fraction = state.total > 0 ? Math.min(1, Math.max(0, state.sent / state.total)) : 0;
        return <AlertModal
            title={title}
            content={state.status}
            extraContent={<View style={{ gap: 8 }}>
                <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
                </View>
                <Text variant="text-sm/medium" color="text-muted">
                    {state.total > 0
                        ? t("{percent}% · {sent} of {total}", { percent: Math.round(fraction * 100), sent: formatBytes(state.sent), total: formatBytes(state.total) })
                        : t("Getting ready…")}
                </Text>
            </View>}
            actions={<AlertActions>
                <AlertActionButton text={t("Cancel")} variant="secondary" onPress={() => controller.abort()} />
            </AlertActions>}
        />;
    }

    openAlert(id, <ProgressAlert />);
    return {
        signal: controller.signal,
        update(next) {
            state = { ...state, ...next };
            for (const listener of listeners) listener();
        },
        close: () => dismissAlert(id),
        cancel() {
            controller.abort();
            dismissAlert(id);
        },
    };
}
