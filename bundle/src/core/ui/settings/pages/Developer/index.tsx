import { Strings, t } from "@core/i18n";
import { CheckState, useFileExists } from "@core/ui/hooks/useFS";
import AssetBrowser from "@core/ui/settings/pages/Developer/AssetBrowser";
import { showConfirmationAlert } from "@core/vendetta/alerts";
import { useProxy } from "@core/vendetta/storage";
import { findAssetId } from "@lib/api/assets";
import { connectToDebugger, connectToReactDevTools, isOwnMachineDebugger } from "@lib/api/debug";
import { disconnectDt, useIsDtConnected } from "@lib/api/debug/devtools";
import { disconnectRdt, useIsRdtConnected } from "@lib/api/debug/react";
import { writeDocument } from "@lib/api/native/fs";
import { getReactDevToolsVersion, isLoaderConfigSupported, isReactDevToolsPreloaded, isVendettaLoader } from "@lib/api/native/loader";
import { loaderConfig, settings } from "@lib/api/settings";
import { showToast } from "@lib/ui/toasts";
import { isAddonUrl } from "@lib/utils/addonUrl";
import { lazyDestructure } from "@lib/utils/lazy";
import { NavigationNative } from "@metro/common";
import { Button, LegacyFormText, Stack, TableRow, TableRowGroup, TableSwitchRow, TextInput } from "@metro/common/components";
import { findByProps } from "@metro/wrappers";
import { hex, sha256 } from "@plugins/crypto";
import { DevToolsClient } from "@revenge-mod/devtools-client";
import { semanticColors } from "@ui/color";
import { ErrorBoundary } from "@ui/components";
import { createStyles, TextStyleSheet } from "@ui/styles";
import { NativeModules, ScrollView } from "react-native";

const { hideActionSheet } = lazyDestructure(() => findByProps("openLazy", "hideActionSheet"));
const { showSimpleActionSheet } = lazyDestructure(() => findByProps("showSimpleActionSheet"));
const { openAlert } = lazyDestructure(() => findByProps("openAlert", "dismissAlert"));
const { AlertModal, AlertActionButton } = lazyDestructure(() => findByProps("AlertModal", "AlertActions"));

// React DevTools goes into the preloads folder, where it runs in Discord on every start: only this exact release's
// file is taken, by its SHA-256, not whatever "latest" serves
const RDT_VERSION = "7.0.1";
const RDT_EMBED_LINK = `https://github.com/revenge-mod/react-devtools-core/releases/download/${RDT_VERSION}/index.bundle`;
const RDT_SHA256 = "63ed06bb1a1b6d023f9b98fe0897aa5817045bba0950bef20604918d82b7f18b";
const RDT_PRELOAD = "preloads/reactDevtools.js";

async function installReactDevTools() {
    const response = await fetch(RDT_EMBED_LINK);
    if (!response.ok) throw new Error(`${RDT_EMBED_LINK}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (hex(sha256(bytes)) !== RDT_SHA256) {
        throw new Error(t("The React DevTools file didn't match its pinned checksum, so it wasn't installed."));
    }
    await writeDocument(`pyoncord/${RDT_PRELOAD}`, Buffer.from(bytes).toString("base64"), "base64");
}

const useStyles = createStyles({
    leadingText: {
        ...TextStyleSheet["heading-md/semibold"],
        color: semanticColors.TEXT_MUTED,
        marginRight: -4
    },
});

export default function Developer() {
    const [rdtFileExists, fs] = useFileExists(RDT_PRELOAD);
    const dtConnected = useIsDtConnected();
    const rdtConnected = useIsRdtConnected();

    const styles = useStyles();
    const navigation = NavigationNative.useNavigation();

    useProxy(settings);
    useProxy(loaderConfig);

    return (
        <ErrorBoundary>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }} keyboardShouldPersistTaps="handled">
                <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                    <TextInput
                        label={Strings.DEBUGGER_URL}
                        placeholder="localhost:7864"
                        size="md"
                        leadingIcon={() => <LegacyFormText style={styles.leadingText}>ws://</LegacyFormText>}
                        defaultValue={settings.debuggerUrl}
                        onChange={(v: string) => settings.debuggerUrl = v}
                    />
                    <TableRowGroup title={Strings.DEBUG}>
                        <TableSwitchRow
                            label={Strings.DEBUGGER_AUTOCONNECT}
                            subLabel={Strings.DEBUGGER_AUTOCONNECT_DESC}
                            icon={<TableRow.Icon source={findAssetId("BookmarkIcon")} />}
                            value={!!settings.enableAutoDebugger}
                            onValueChange={(v: boolean) => {
                                settings.enableAutoDebugger = v;
                                // Whoever answers at the address runs code in Discord: on start, only this machine
                                if (v && !isOwnMachineDebugger(settings.debuggerUrl ?? "")) {
                                    showToast(t("DevTools connects on start only to this machine (localhost or 10.0.2.2). For another address, connect by hand each time."), findAssetId("WarningIcon"));
                                }
                            }}
                        />
                        <TableRow
                            label={dtConnected ? Strings.DISCONNECT_FROM_DEBUG_WEBSOCKET : Strings.CONNECT_TO_DEBUG_WEBSOCKET}
                            subLabel={`Version ${DevToolsClient.version}`}
                            icon={<TableRow.Icon source={findAssetId(dtConnected ? "DenyIcon" : "LinkIcon")} />}
                            onPress={() => dtConnected ? disconnectDt() : connectToDebugger(settings.debuggerUrl)}
                        />
                        {isReactDevToolsPreloaded() && <>
                            <TableRow
                                label={rdtConnected ? Strings.DISCONNECT_FROM_REACT_DEVTOOLS : Strings.CONNECT_TO_REACT_DEVTOOLS}
                                subLabel={`Version ${getReactDevToolsVersion()}`}
                                icon={<TableRow.Icon source={findAssetId(rdtConnected ? "DenyIcon" : "StaffBadgeIcon")} />}
                                onPress={() => rdtConnected ? disconnectRdt() : connectToReactDevTools(settings.debuggerUrl)}
                            />
                        </>}
                    </TableRowGroup>
                    {isLoaderConfigSupported() && <>
                        <TableRowGroup title={t("Loader settings")}>
                            <TableSwitchRow
                                label={Strings.LOAD_FROM_CUSTOM_URL}
                                subLabel={Strings.LOAD_FROM_CUSTOM_URL_DEC}
                                icon={<TableRow.Icon source={findAssetId("LinkIcon")} />}
                                value={loaderConfig.customLoadUrl.enabled}
                                onValueChange={(v: boolean) => {
                                    if (!v) {
                                        loaderConfig.customLoadUrl.enabled = false;
                                        return;
                                    }
                                    // The loaders refuse other links anyway; said here, where it can be fixed
                                    if (!isAddonUrl(loaderConfig.customLoadUrl.url)) {
                                        showToast(t("Bundle links must be https:// (plain http:// only from this machine)."), findAssetId("CircleXIcon-primary"));
                                        return;
                                    }
                                    showConfirmationAlert({
                                        title: t("Load the bundle from your own link?"),
                                        content: t("This turns off Medslol's signature check: whatever that link serves runs in Discord with everything your account can do. Only use a link you control."),
                                        confirmText: t("Turn it on"),
                                        confirmColor: "red",
                                        cancelText: Strings.CANCEL,
                                        onConfirm: () => {
                                            loaderConfig.customLoadUrl.enabled = true;
                                        },
                                    });
                                }}
                            />
                            {loaderConfig.customLoadUrl.enabled && <TableRow label={<TextInput
                                defaultValue={loaderConfig.customLoadUrl.url}
                                size="md"
                                onChange={(v: string) => loaderConfig.customLoadUrl.url = v}
                                placeholder="http://localhost:4040/endcord.js"
                                label={Strings.BUNNY_URL}
                            />} />}
                            {isReactDevToolsPreloaded() && isVendettaLoader() && <TableSwitchRow
                                label={Strings.LOAD_REACT_DEVTOOLS}
                                subLabel={`${Strings.VERSION}: ${getReactDevToolsVersion()}`}
                                icon={<TableRow.Icon source={findAssetId("StaffBadgeIcon")} />}
                                value={loaderConfig.loadReactDevTools}
                                onValueChange={(v: boolean) => {
                                    loaderConfig.loadReactDevTools = v;
                                }}
                            />}
                        </TableRowGroup>
                    </>}
                    <TableRowGroup title={t("Other")}>
                        <TableRow
                            label={Strings.CLEAR_BUNDLE}
                            subLabel={Strings.CLEAR_BUNDLE_DESC}
                            icon={<TableRow.Icon source={findAssetId("TrashIcon")} variant="danger" />}
                            onPress={() => {
                                openAlert("revenge-clear-bundle-reload-confirmation", <AlertModal
                                    title={Strings.MODAL_RELOAD_REQUIRED}
                                    content={Strings.MODAL_RELOAD_REQUIRED_DESC}
                                    actions={
                                        <Stack>
                                            <AlertActionButton text={Strings.RELOAD} variant="destructive" onPress={() => NativeModules.BundleUpdaterManager.reload()} />
                                            <AlertActionButton text={Strings.CANCEL} variant="secondary" />
                                        </Stack>
                                    }
                                />);
                            }}
                            variant="danger"
                        />
                        <TableRow
                            arrow
                            label={Strings.ASSET_BROWSER}
                            icon={<TableRow.Icon source={findAssetId("ImageIcon")} />}
                            trailing={TableRow.Arrow}
                            onPress={() => navigation.push("BUNNY_CUSTOM_PAGE", {
                                title: Strings.ASSET_BROWSER,
                                render: AssetBrowser,
                            })}
                        />
                        <TableRow
                            arrow
                            label={Strings.ERROR_BOUNDARY_TOOLS_LABEL}
                            icon={<TableRow.Icon source={findAssetId("WarningIcon")} />}
                            onPress={() => showSimpleActionSheet({
                                key: "ErrorBoundaryTools",
                                header: {
                                    title: t("Which error screen should be tested?"),
                                    icon: <TableRow.Icon style={{ marginRight: 8 }} source={findAssetId("WarningIcon")} />,
                                    onClose: () => hideActionSheet(),
                                },
                                options: [
                                    // @ts-expect-error
                                    // Of course, to trigger an error, we need to do something incorrectly. The below will do!
                                    { label: Strings.BUNNY, onPress: () => navigation.push("BUNNY_CUSTOM_PAGE", { render: () => <undefined /> }) },
                                    { label: "Discord", isDestructive: true, onPress: () => navigation.push("BUNNY_CUSTOM_PAGE", { noErrorBoundary: true }) },
                                ],
                            })}
                        />
                        <TableRow
                            label={Strings.INSTALL_REACT_DEVTOOLS}
                            subLabel={Strings.RESTART_REQUIRED_TO_TAKE_EFFECT}
                            icon={<TableRow.Icon source={findAssetId("DownloadIcon")} />}
                            trailing={
                                <Button
                                    size="sm"
                                    loading={rdtFileExists === CheckState.LOADING}
                                    disabled={rdtFileExists === CheckState.LOADING}
                                    variant={rdtFileExists === CheckState.TRUE ? "secondary" : "primary"}
                                    text={rdtFileExists === CheckState.TRUE ? Strings.UNINSTALL : Strings.INSTALL}
                                    onPress={async () => {
                                        if (rdtFileExists === CheckState.FALSE) {
                                            installReactDevTools()
                                                .then(() => showToast(t("Installed. Reload Discord to use it."), findAssetId("DownloadIcon")))
                                                .catch(e => showToast(e instanceof Error ? e.message : String(e), findAssetId("CircleXIcon-primary")))
                                                // Through the hook's copy, so the button shows what is there now
                                                .finally(() => fs.fileExists(RDT_PRELOAD));
                                        } else if (rdtFileExists === CheckState.TRUE) {
                                            fs.removeFile(RDT_PRELOAD);
                                        }
                                    }}
                                    icon={findAssetId(rdtFileExists === CheckState.TRUE ? "TrashIcon" : "DownloadIcon")}
                                    style={{ marginLeft: 8 }}
                                />
                            }
                        />
                        <TableSwitchRow
                            label={Strings.ENABLE_EVAL_COMMAND}
                            subLabel={Strings.ENABLE_EVAL_COMMAND_DESC}
                            icon={<TableRow.Icon source={findAssetId("PencilIcon")} />}
                            value={!!settings.enableEvalCommand}
                            onValueChange={(v: boolean) => {
                                settings.enableEvalCommand = v;
                            }}
                        />
                    </TableRowGroup>
                </Stack>
            </ScrollView>
        </ErrorBoundary>
    );
}
