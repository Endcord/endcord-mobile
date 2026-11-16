/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Quoter's picture: drawn with react-native-svg, which Discord's app has, and turned into a PNG by it when it's sent.
 * It's sent as Discord's app sends a file: Discord says where to upload it, then the message names the upload.
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack, TableRowGroup, TableSwitchRow, Text } from "@metro/common/components";
import { useEdgeInsets } from "@ui/insets";
import { useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { fromBase64 } from "../crypto";
import { api, describeError, displayName, getUser } from "../hooks";
import { CANVAS, cardFileName, FONT_SIZES, isPng, layoutQuote, MAX_WATERMARK, quoteText, SPACING } from "./card";

const UPLOAD_TIMEOUT = 60_000;
const CAPTURE_TIMEOUT = 15_000;

/** react-native-svg's components, or undefined in a Discord without it */
export function svgModule(): any {
    const svg = findByProps("Svg", "LinearGradient", "Stop");
    return ["Svg", "Rect", "Text", "Image", "Defs", "LinearGradient", "Stop"].every(name => svg?.[name]) ? svg : undefined;
}

/** An avatar as a still PNG, the size the card draws it */
function avatarOf(user: any): string {
    if (user?.avatar && /^[\w]+$/.test(user.avatar)) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=512`;
    const index = Math.floor(Number(user?.id ?? 0) / 4194304) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${Number.isFinite(index) ? index : 0}.png`;
}

/** The card as a PNG, from react-native-svg's drawing of it */
function capture(svg: any): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        if (typeof svg?.toDataURL !== "function") {
            reject(new Error(t("This Discord can't turn the card into a picture.")));
            return;
        }
        const timer = setTimeout(() => reject(new Error(t("This Discord can't turn the card into a picture."))), CAPTURE_TIMEOUT);
        svg.toDataURL((base64: unknown) => {
            clearTimeout(timer);
            const bytes = typeof base64 === "string" ? fromBase64(base64.replace(/^data:image\/png;base64,/, "")) : new Uint8Array(0);
            if (isPng(bytes)) resolve(bytes);
            else reject(new Error(t("This Discord can't turn the card into a picture.")));
        }, { width: CANVAS.width, height: CANVAS.height });
    });
}

/** Puts bytes at an upload link Discord gave, the same way its own app sends a file */
function put(url: string, mime: string, bytes: Uint8Array) {
    return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        // React Native's networking on Android refuses a body without one
        xhr.setRequestHeader("Content-Type", mime);
        xhr.timeout = UPLOAD_TIMEOUT;
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(t("The upload failed ({status})", { status: xhr.status })));
        xhr.onerror = () => reject(new Error(t("The upload failed")));
        xhr.ontimeout = () => reject(new Error(t("The upload took too long")));
        xhr.send(bytes);
    });
}

async function sendPicture(channelId: string, filename: string, bytes: Uint8Array) {
    const res = await api("post", `/channels/${channelId}/attachments`, { files: [{ id: "0", filename, file_size: bytes.length, is_clip: false }] });
    const slot = res?.attachments?.[0];
    // Only to where Discord said, and only over https
    if (typeof slot?.upload_url !== "string" || !/^https:\/\/[^\s/]+\//i.test(slot.upload_url) || typeof slot.upload_filename !== "string") {
        throw new Error(t("Discord didn't say where to upload the picture."));
    }
    await put(slot.upload_url, "image/png", bytes);
    await api("post", `/channels/${channelId}/messages`, {
        content: "",
        attachments: [{ id: "0", filename, uploaded_filename: slot.upload_filename }],
        allowed_mentions: { parse: [] },
    });
}

interface CardStore {
    grayscale: boolean;
    showWatermark: boolean;
    watermark: string;
    quoteFont: string;
}

export function QuoteCardPage({ message, store, close }: { message: any; store: CardStore; close: () => void; }) {
    const S = svgModule();
    const { bottom } = useEdgeInsets();
    const ref = useRef<any>(null);
    const [gray, setGray] = useState(!!store.grayscale);
    const [watermark, setWatermark] = useState(!!store.showWatermark);
    const [sending, setSending] = useState(false);
    if (!S) return null;
    const canGray = !!(S.Filter && S.FeColorMatrix);

    const author = message.author ?? {};
    const quote = quoteText(message.content ?? "", id => getUser(id)?.username);
    const layout = layoutQuote(quote);
    const font = typeof store.quoteFont === "string" && store.quoteFont ? store.quoteFont : "sans-serif-light";
    const centerX = CANVAS.quoteAreaX + CANVAS.quoteAreaWidth / 2;
    let y = (CANVAS.height - layout.totalHeight) / 2;
    const lineYs = layout.lines.map(() => (y += layout.lineHeight));
    const authorY = y + SPACING.authorTop;
    const usernameY = authorY + SPACING.username + layout.usernameFontSize;
    const watermarkText = String(store.watermark ?? "").slice(0, MAX_WATERMARK);

    const send = async () => {
        if (sending) return;
        setSending(true);
        try {
            const bytes = await capture(ref.current);
            await sendPicture(message.channel_id, cardFileName(message.content ?? "", author.username ?? ""), bytes);
            showToast(t("Quote sent"), findAssetId("CheckmarkLargeIcon"));
            close();
        } catch (e) {
            showToast(describeError(e), findAssetId("CircleXIcon-primary"));
        } finally {
            setSending(false);
        }
    };

    return <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 38 + bottom }}>
        <Stack spacing={16}>
            <View style={{ width: "100%", aspectRatio: CANVAS.width / CANVAS.height, borderRadius: 16, overflow: "hidden", backgroundColor: "#000" }}>
                <S.Svg ref={ref} width="100%" height="100%" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}>
                    <S.Defs>
                        <S.LinearGradient id="endcordQuoteFade" x1={SPACING.gradientStart} y1={0} x2={CANVAS.height} y2={0} gradientUnits="userSpaceOnUse">
                            <S.Stop offset={0} stopColor="#000" stopOpacity={0} />
                            <S.Stop offset={1} stopColor="#000" stopOpacity={1} />
                        </S.LinearGradient>
                        {canGray && <S.Filter id="endcordQuoteGray">
                            <S.FeColorMatrix type="saturate" values={0} />
                        </S.Filter>}
                    </S.Defs>
                    <S.Rect x={0} y={0} width={CANVAS.width} height={CANVAS.height} fill="#000" />
                    <S.Image
                        x={0}
                        y={0}
                        width={CANVAS.height}
                        height={CANVAS.height}
                        href={{ uri: avatarOf(author) }}
                        preserveAspectRatio="xMidYMid slice"
                        filter={canGray && gray ? "url(#endcordQuoteGray)" : undefined}
                    />
                    <S.Rect x={SPACING.gradientStart} y={0} width={SPACING.gradientWidth} height={CANVAS.height} fill="url(#endcordQuoteFade)" />
                    {layout.lines.map((line, i) => <S.Text key={i} x={centerX} y={lineYs[i]} textAnchor="middle" fill="#fff" fontSize={layout.fontSize} fontFamily={font}>
                        {line}
                    </S.Text>)}
                    <S.Text x={centerX} y={authorY} textAnchor="middle" fill="#fff" fontSize={layout.authorFontSize} fontStyle="italic" fontFamily={font}>
                        {`- ${displayName(author)}`}
                    </S.Text>
                    <S.Text x={centerX} y={usernameY} textAnchor="middle" fill="#888" fontSize={layout.usernameFontSize} fontFamily={font}>
                        {`@${author.username ?? ""}`}
                    </S.Text>
                    {watermark && watermarkText && <S.Text
                        x={CANVAS.width - SPACING.watermarkPadding}
                        y={CANVAS.height - SPACING.watermarkPadding}
                        textAnchor="end"
                        fill="#888"
                        fontSize={FONT_SIZES.watermark}
                        fontFamily={font}
                    >
                        {watermarkText}
                    </S.Text>}
                </S.Svg>
            </View>
            <TableRowGroup title={t("Picture")}>
                {canGray && <TableSwitchRow label={t("Grayscale")} value={gray} onValueChange={(v: boolean) => {
                    setGray(v);
                    store.grayscale = v;
                }} />}
                <TableSwitchRow label={t("Show Watermark")} subLabel={watermarkText || undefined} value={watermark} onValueChange={(v: boolean) => {
                    setWatermark(v);
                    store.showWatermark = v;
                }} />
            </TableRowGroup>
            <Text variant="text-sm/medium" color="text-muted">{t("Send puts the picture in this chat as a message from you.")}</Text>
            <Button text={t("Send")} variant="primary" loading={sending} icon={findAssetId("SendMessageIcon")} onPress={() => void send()} />
        </Stack>
    </ScrollView>;
}
