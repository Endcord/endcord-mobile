import { type Backup as BackupData, createBackup, MAX_BACKUP_SIZE, parseBackup, restoreBackup } from "@core/backup";
import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { BundleUpdaterManager, NativeFileModule } from "@lib/api/native/modules";
import { openAlert } from "@lib/ui/alerts";
import { showToast } from "@lib/ui/toasts";
import formatDate from "@lib/utils/formatDate";
import { findByProps } from "@metro";
import { AlertActionButton, AlertActions, AlertModal, TableRow, TableRowGroup } from "@metro/common/components";
import { Share } from "react-native";

/** Discord's @react-native-documents/picker, which saves and opens files through Android's own screens */
const documents = () => findByProps("saveDocuments", "keepLocalCopy", "pick");

const cancelled = (e: any) => {
    const picker = documents();
    return Boolean(picker?.isErrorWithCode?.(e) && e.code === picker.errorCodes?.OPERATION_CANCELED);
};

/** Runs a row's action, showing what went wrong; the user backing out of Android's file screen isn't an error */
const run = (action: () => Promise<unknown>) => () => void action().catch(e => {
    if (cancelled(e)) return;
    console.error("[Endcord] backup", e);
    showToast(e instanceof Error ? e.message : String(e), findAssetId("CircleXIcon-primary"));
});

async function saveBackup() {
    const text = await createBackup();
    const picker = documents();
    if (!picker) return void await Share.share({ message: text, title: "Endcord" });

    const fileName = `endcord-backup-${new Date().toISOString().slice(0, 10)}.json`;
    await NativeFileModule.writeFile("cache", fileName, text, "utf8");
    try {
        const [result] = await picker.saveDocuments({
            sourceUris: [`file://${NativeFileModule.getConstants().CacheDirPath}/${fileName}`],
            copy: true,
            mimeType: "application/json",
            fileName,
        });
        if (result?.error) throw new Error(result.error);
        showToast(t("Backup saved"), findAssetId("CircleCheckIcon-primary"));
    } finally {
        NativeFileModule.removeFile?.("cache", fileName)?.catch?.(() => { });
    }
}

/** The text of a file the user picks */
async function openFile(): Promise<string> {
    const picker = documents();
    if (!picker) throw new Error(t("This version of Discord can't open files"));

    const [file] = await picker.pick({ type: [picker.types?.allFiles ?? "*/*"] });
    if (typeof file?.size === "number" && file.size > MAX_BACKUP_SIZE) throw new Error(t("This file isn't an Endcord backup"));
    const [copy] = await picker.keepLocalCopy({
        files: [{ uri: file.uri, fileName: "endcord-restore.json" }],
        destination: "cachesDirectory",
    });
    if (copy?.status !== "success") throw new Error(copy?.copyError ?? t("The file couldn't be opened"));

    const path = decodeURIComponent(String(copy.localUri).replace(/^file:\/\//, ""));
    try {
        return await NativeFileModule.readFile(path, "utf8");
    } finally {
        const cache = `${NativeFileModule.getConstants().CacheDirPath}/`;
        if (path.startsWith(cache)) NativeFileModule.removeFile?.("cache", path.slice(cache.length))?.catch?.(() => { });
    }
}

async function restore(backup: BackupData) {
    showToast(t("Restoring your backup…"), findAssetId("DownloadIcon"));
    const failed = await restoreBackup(backup);
    if (failed) showToast(t("{count} themes or fonts couldn't be installed again", { count: failed }), findAssetId("CircleXIcon-primary"));
    setTimeout(() => BundleUpdaterManager.reload(), failed ? 2000 : 500);
}

async function pickBackup() {
    const backup = parseBackup(await openFile());
    const date = Date.parse(backup.createdAt);
    openAlert("endcord-restore-backup", <AlertModal
        title={t("Restore this backup?")}
        content={t("This backup is from {date}, with {count} plugins on. It replaces your Endcord settings, which plugins are on and their settings, and what you made with plugins, then reloads Discord. Only restore a backup you made yourself: it can turn plugins on and change what they do.", {
            date: Number.isNaN(date) ? "?" : formatDate(date, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
            count: Object.values(backup.plugins).filter(Boolean).length,
        })}
        actions={<AlertActions>
            <AlertActionButton text={t("Restore and reload")} variant="destructive" onPress={run(() => restore(backup))} />
            <AlertActionButton text={t("Cancel")} variant="secondary" />
        </AlertActions>}
    />);
}

export default function Backup() {
    return <TableRowGroup title={t("Backup")}>
        <TableRow
            arrow
            label={t("Back up your settings")}
            subLabel={t("Saves a file with your settings, plugins and what you made with them")}
            icon={<TableRow.Icon source={findAssetId("DownloadIcon")!} />}
            onPress={run(saveBackup)}
        />
        <TableRow
            arrow
            label={t("Restore a backup")}
            subLabel={t("Puts back the settings from a backup file")}
            icon={<TableRow.Icon source={findAssetId("UploadIcon")!} />}
            onPress={run(pickBackup)}
        />
    </TableRowGroup>;
}
