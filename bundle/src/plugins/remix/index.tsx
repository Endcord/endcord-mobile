/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC's RemixRevived: draw on a picture and send it, like Discord's old Remix. Long-press a picture in the chat
 * and choose Remix, or pick one from the phone (Endcord Toolbox, or the chat bar button). There's a brush, lines,
 * arrows, boxes and circles, filled or not, in a few colors and sizes, with undo. The drawing is react-native-svg's,
 * which Discord ships, and is sent as a PNG to the chat it was started from.
 *
 * Not from PC: cropping and the eraser (undo takes back a stroke instead), and its free color picker.
 */

import { t, tx } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Text } from "@metro/common/components";
import { useEdgeInsets } from "@ui/insets";
import { useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, ScrollView, View } from "react-native";

import { definePlugin } from "../api";
import { addToolboxAction } from "../common";
import { base64ToBytes } from "../fileSplitter/parts";
import { extensionOf } from "../fileUpload/files";
import { Progress, showProgress } from "../fileUpload/progress";
import { isCancelled, pickFiles, postWithAttachments, uploadToDiscord } from "../fileUpload/transfer";
import { addMessageAction, currentChannelId, toastError } from "../hooks";
import { chatButton } from "../shared/navigation";
import { openPage } from "../ui/pages";
import { addPoint, arrowPath, box, COLORS, fit, isPng, Mark, MAX_OUTPUT_SIDE, outputSize, Point, SIZES, strokePath, Tool } from "./shapes";

const svgModule = () => findByProps("Svg", "Path", "Image", "Ellipse", "Rect", "Line");

/** Sends under way, cancelled when the plugin stops */
const transfers = new Set<Progress>();

/** How long react-native-svg gets to turn the drawing into a PNG */
const CAPTURE_TIMEOUT = 15_000;

/** The kinds of picture PC remixes */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

interface Picture {
    uri: string;
    width: number;
    height: number;
}

const TOOLS: Array<{ tool: Tool; label: () => string; }> = [
    { tool: "brush", label: () => t("Brush") },
    { tool: "line", label: () => t("Line") },
    { tool: "arrow", label: () => t("Arrow") },
    { tool: "rectangle", label: () => t("Rectangle") },
    { tool: "ellipse", label: () => t("Ellipse") },
];

function MarkShape({ mark, svg: S }: { mark: Mark; svg: any; }) {
    const [a] = mark.points;
    const b = mark.points[mark.points.length - 1] ?? a;
    if (!a) return null;
    const stroke = { stroke: mark.color, strokeWidth: mark.width, strokeLinecap: "round", strokeLinejoin: "round" };
    const fill = mark.fill ? mark.color : "none";
    switch (mark.tool) {
        case "brush": return <S.Path d={strokePath(mark.points)} fill="none" {...stroke} />;
        case "line": return <S.Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...stroke} />;
        case "arrow": return <S.Path d={arrowPath(a, b, mark.width)} fill="none" {...stroke} />;
        case "rectangle": return <S.Rect {...box(a, b)} fill={fill} {...stroke} />;
        case "ellipse": {
            const r = box(a, b);
            return <S.Ellipse cx={r.x + r.width / 2} cy={r.y + r.height / 2} rx={r.width / 2} ry={r.height / 2} fill={fill} {...stroke} />;
        }
    }
}

function Choice({ label, selected, onPress, color }: { label?: string; selected: boolean; onPress: () => void; color?: string; }) {
    return <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label ?? color}
        accessibilityState={{ selected }}
        style={{
            minWidth: color ? 32 : undefined,
            height: 32,
            borderRadius: 16,
            paddingHorizontal: color ? 0 : 12,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: color ?? (selected ? "#5865f2" : "rgba(128,128,128,0.25)"),
            borderWidth: selected && color ? 3 : 0,
            borderColor: "#5865f2",
        }}
    >
        {label ? <Text variant="text-sm/semibold" color={selected ? "text-default" : "text-muted"} style={selected ? { color: "#ffffff" } : undefined}>{label}</Text> : null}
    </Pressable>;
}

function Editor({ picture, channelId, close }: { picture: Picture; channelId: string; close: () => void; }) {
    const S = svgModule();
    const { bottom } = useEdgeInsets();
    const [area, setArea] = useState({ width: 0, height: 0 });
    const [marks, setMarks] = useState<Mark[]>([]);
    const [current, setCurrent] = useState<Mark | null>(null);
    const [tool, setTool] = useState<Tool>("brush");
    const [color, setColor] = useState(COLORS[0]);
    const [size, setSize] = useState<keyof typeof SIZES>("medium");
    const [fill, setFill] = useState(false);
    const [sending, setSending] = useState(false);
    const svgRef = useRef<any>(null);

    const view = fit(picture.width, picture.height, area.width, area.height);
    const scale = view.width ? picture.width / view.width : 1;
    // The latest choices, for the touch handlers made once
    const latest = useRef({ tool, color, fill, scale, width: 1, current: null as Mark | null });
    latest.current = { ...latest.current, tool, color, fill, scale, width: Math.max(1, Math.max(picture.width, picture.height) * SIZES[size]) };

    const responder = useMemo(() => {
        const at = (event: any): Point => {
            const { scale: s } = latest.current;
            return { x: Number(event?.nativeEvent?.locationX) * s || 0, y: Number(event?.nativeEvent?.locationY) * s || 0 };
        };
        const show = (mark: Mark | null) => {
            latest.current.current = mark;
            setCurrent(mark);
        };
        const finish = () => {
            const mark = latest.current.current;
            if (mark) setMarks(list => [...list, mark]);
            show(null);
        };
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: event => {
                const { tool: kind, color: shade, fill: filled, width } = latest.current;
                show({ tool: kind, color: shade, width, fill: filled, points: [at(event)] });
            },
            onPanResponderMove: event => {
                const mark = latest.current.current;
                if (!mark) return;
                const point = at(event);
                show({ ...mark, points: mark.tool === "brush" ? addPoint(mark.points, point, 2 * latest.current.scale) : [mark.points[0], point] });
            },
            onPanResponderRelease: finish,
            onPanResponderTerminate: finish,
        });
    }, []);

    const send = () => {
        const svg = svgRef.current;
        if (typeof svg?.toDataURL !== "function") return toastError(new Error(t("Discord's drawing parts weren't found")));
        setSending(true);
        const out = outputSize(picture.width, picture.height);
        let answered = false;
        // A Discord whose drawing can't be turned into a picture never answers
        const timer = setTimeout(() => {
            answered = true;
            setSending(false);
            toastError(new Error(t("Couldn't make the picture")));
        }, CAPTURE_TIMEOUT);
        svg.toDataURL(async (data: unknown) => {
            if (answered) return;
            answered = true;
            clearTimeout(timer);
            let bytes: Uint8Array = new Uint8Array(0);
            try {
                if (typeof data === "string") bytes = base64ToBytes(data.replace(/^data:[^,]*,/, "").replace(/\s+/g, ""));
            } catch { }
            if (!isPng(bytes)) {
                setSending(false);
                return toastError(new Error(t("Couldn't make the picture")));
            }
            close();
            const progress = showProgress(t("Remix"), t("Sending the picture"));
            transfers.add(progress);
            try {
                const uploaded = await uploadToDiscord(channelId, [{ name: "remix.png", size: bytes.length, mime: "image/png", body: bytes }], {
                    signal: progress.signal,
                    onProgress: (sent, total) => progress.update({ sent, total }),
                });
                await postWithAttachments(channelId, "", uploaded);
            } catch (e) {
                if (isCancelled(e)) showToast(t("Cancelled"), findAssetId("CircleXIcon-primary"));
                else toastError(e);
            } finally {
                progress.close();
                transfers.delete(progress);
            }
        }, { width: out.width, height: out.height });
    };

    if (!S?.Svg) return <View style={{ padding: 16 }}><Text variant="text-md/medium" color="text-muted">{t("Discord's drawing parts weren't found")}</Text></View>;

    return <View style={{ flex: 1, paddingBottom: bottom }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onLayout={e => setArea({ width: e.nativeEvent.layout.width - 16, height: e.nativeEvent.layout.height - 16 })}>
            {view.width > 0 && <View style={{ width: view.width, height: view.height }}>
                <S.Svg ref={svgRef} width={view.width} height={view.height} viewBox={`0 0 ${picture.width} ${picture.height}`}>
                    <S.Image href={{ uri: picture.uri }} x={0} y={0} width={picture.width} height={picture.height} />
                    {marks.map((mark, i) => <MarkShape key={i} mark={mark} svg={S} />)}
                    {current && <MarkShape mark={current} svg={S} />}
                </S.Svg>
                <View collapsable={false} style={{ position: "absolute", left: 0, top: 0, width: view.width, height: view.height }} {...responder.panHandlers} />
            </View>}
        </View>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
            <ScrollView horizontal={true} contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
                {TOOLS.map(({ tool: kind, label }) => <Choice key={kind} label={label()} selected={tool === kind} onPress={() => setTool(kind)} />)}
                {(tool === "rectangle" || tool === "ellipse") && <Choice label={t("Fill")} selected={fill} onPress={() => setFill(!fill)} />}
            </ScrollView>
            <ScrollView horizontal={true} contentContainerStyle={{ gap: 8, alignItems: "center" }} showsHorizontalScrollIndicator={false}>
                {COLORS.map(shade => <Choice key={shade} color={shade} selected={color === shade} onPress={() => setColor(shade)} />)}
                <Choice label={t("Thin")} selected={size === "thin"} onPress={() => setSize("thin")} />
                <Choice label={t("Medium")} selected={size === "medium"} onPress={() => setSize("medium")} />
                <Choice label={t("Thick")} selected={size === "thick"} onPress={() => setSize("thick")} />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
                <Button size="md" variant="secondary" text={t("Undo")} icon={findAssetId("RetryIcon")} disabled={!marks.length || sending} onPress={() => setMarks(list => list.slice(0, -1))} grow={true} />
                <Button size="md" variant="secondary" text={t("Clear")} icon={findAssetId("TrashIcon")} disabled={!marks.length || sending} onPress={() => setMarks([])} grow={true} />
                <Button size="md" variant="primary" text={t("Send")} icon={findAssetId("SendMessageIcon")} loading={sending} onPress={send} grow={true} />
            </View>
        </View>
    </View>;
}

function openEditor(picture: Picture, channelId: string) {
    openPage(t("Remix"), ({ close }) => <Editor picture={picture} channelId={channelId} close={close} />);
}

/** A picture's size as the phone reads it */
const sizeOf = (uri: string) => new Promise<{ width: number; height: number; }>((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), () => reject(new Error(t("Couldn't open the picture"))));
});

async function remixFromPhone() {
    const channelId = currentChannelId();
    if (!channelId) return showToast(t("Open a chat to send the remix to"), findAssetId("CircleInformationIcon-primary"));
    const [file] = await pickFiles(false, IMAGE_TYPES.filter(type => type !== "image/jpg"));
    if (!file) return;
    const { width, height } = await sizeOf(file.uri);
    if (!(width > 0 && height > 0)) throw new Error(t("Couldn't open the picture"));
    openEditor({ uri: file.uri, width, height }, channelId);
}

/** A picture attachment PC would remix, from Discord's media proxy at no more than the size it's sent at */
function remixable(attachment: any): Picture | undefined {
    const type = String(attachment?.content_type ?? "").toLowerCase();
    const ext = extensionOf(String(attachment?.filename ?? ""));
    if (!IMAGE_TYPES.includes(type) && !["png", "jpg", "jpeg", "webp"].includes(ext)) return undefined;
    const proxy = String(attachment?.proxy_url ?? "");
    const width = Number(attachment?.width), height = Number(attachment?.height);
    if (!/^https:\/\/media\.discordapp\.net\//i.test(proxy) || !(width > 0 && height > 0)) return undefined;
    const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height));
    const w = Math.round(width * scale), h = Math.round(height * scale);
    return { uri: `${proxy}${proxy.includes("?") ? "&" : "?"}width=${w}&height=${h}`, width: w, height: h };
}

const plugin = definePlugin({
    id: "endcord.remix-revived",
    name: "RemixRevived",
    description: tx("Draw on a picture and send it, like Discord's old Remix: long-press a picture and choose Remix, or pick one from your phone."),
    icon: "PaintbrushThinIcon",
    tags: ["Customisation", "Fun"],
    settings: {
        button: {
            type: "select",
            label: tx("Chat bar button"),
            default: "none",
            options: [
                { label: tx("Hidden"), value: "none" },
                { label: tx("Left of the message box"), value: "left" },
                { label: tx("Right of the message box"), value: "right" },
            ],
        },
    },
    start({ store, cleanup }) {
        if (typeof svgModule()?.Svg !== "function") throw new Error(t("Discord's drawing parts weren't found"));
        cleanup(
            addMessageAction({
                key: "remix",
                icon: "PaintbrushThinIcon",
                label: () => t("Remix"),
                visible: message => (message?.attachments ?? []).some((a: any) => remixable(a)),
                onPress: message => {
                    const picture = (message.attachments ?? []).map(remixable).find(Boolean);
                    if (picture) openEditor(picture, message.channel_id);
                },
            }),
            addToolboxAction("remix", { label: () => t("Remix"), icon: "PaintbrushThinIcon", run: remixFromPhone }),
            chatButton("remix", store, "PaintbrushThinIcon", () => t("Remix"), remixFromPhone),
            () => {
                for (const transfer of transfers) transfer.cancel();
                transfers.clear();
            },
        );
    },
});

export default plugin;
