/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * CustomProfile's editor: Endcord PC's Custom Profile window, as a page.
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { getNativeModule } from "@lib/api/native/modules";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { FluxUtils } from "@metro/common";
import { Button, Stack, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@metro/common/components";
import { semanticColorOf } from "@ui/color";
import { createStyles, TextStyleSheet } from "@ui/styles";
import { memo, type ReactNode, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, PixelRatio, Pressable, ScrollView, Text as PlainText, View } from "react-native";

import { getStore } from "../common";
import { toastError } from "../hooks";
import { choose, pickColor, pickDate, prompt } from "../ui/dialogs";
import {
    AVATAR_DECORATIONS, BADGES, BOOST_ICONS, BOOST_LABELS, COLLECTIBLE_PROFILE_EFFECT, type CustomProfileData, getDecorationUrl,
    GIFT_IDS, GIFT_TIER_NAMES, NITRO_LEVELS, OLD_NAME_BADGE_ICON, type SavedPreset, shopThumbnail, SPECIAL_BADGES, TIERED_BADGES
} from "./data";
import { accountData, myId, presetsOf, repair, resetAccount, saveAccount, setPresets } from "./store";

const BRAND = "#5865f2";

const useStyles = createStyles({
    sectionLabel: {
        textTransform: "uppercase",
        letterSpacing: 0.6,
    },
    wrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
    },
    pill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: semanticColorOf("BORDER_SUBTLE", "BACKGROUND_MOD_STRONG", "BACKGROUND_MOD_NORMAL"),
        backgroundColor: semanticColorOf("BACKGROUND_MOD_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOW"),
    },
    pillOn: {
        borderColor: BRAND,
        backgroundColor: "rgba(88, 101, 242, 0.2)",
    },
    // The editor draws a few hundred labels in pills and tiles; plain text styled like Discord's costs a fraction of
    // its Text component
    pillLabel: {
        ...TextStyleSheet["text-xs/medium"],
        color: semanticColorOf("TEXT_MUTED", "TEXT_SUBTLE"),
    },
    pillLabelOn: {
        ...TextStyleSheet["text-xs/bold"],
        color: semanticColorOf("TEXT_DEFAULT", "TEXT_NORMAL"),
    },
    tile: {
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: semanticColorOf("BORDER_SUBTLE", "BACKGROUND_MOD_STRONG", "BACKGROUND_MOD_NORMAL"),
        backgroundColor: semanticColorOf("BACKGROUND_MOD_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOW"),
    },
    effectTile: {
        borderRadius: 8,
        padding: 2,
    },
    effectImage: {
        position: "absolute",
        top: 2,
        left: 2,
        right: 2,
        bottom: 2,
        borderRadius: 6,
    },
    effectName: {
        ...TextStyleSheet["text-xxs/semibold"],
        position: "absolute",
        left: 3,
        right: 3,
        bottom: 3,
        textAlign: "center",
        paddingHorizontal: 2,
        paddingVertical: 1,
        borderRadius: 4,
        overflow: "hidden",
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        color: "#ffffff",
    },
    divider: {
        height: 1,
        backgroundColor: semanticColorOf("BORDER_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_MOD_STRONG"),
    },
    footer: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: semanticColorOf("BORDER_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_MOD_STRONG"),
        backgroundColor: semanticColorOf("BACKGROUND_BASE_LOWER", "BACKGROUND_BASE_LOW"),
    },
});

function SectionLabel({ children }: { children: ReactNode; }) {
    const styles = useStyles();
    return <Text variant="text-xs/bold" color="text-muted" style={styles.sectionLabel}>{children}</Text>;
}

function Divider() {
    return <View style={useStyles().divider} />;
}

const Pill = memo(function Pill({ label, icon, active, onPress }: { label: string; icon?: string; active: boolean; onPress: () => void; }) {
    const styles = useStyles();
    return <Pressable onPress={onPress} style={[styles.pill, active && styles.pillOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
        {icon ? <Image source={{ uri: icon }} style={{ width: 16, height: 16 }} resizeMode="contain" resizeMethod="resize" /> : null}
        <PlainText style={active ? styles.pillLabelOn : styles.pillLabel}>{label}</PlainText>
    </Pressable>;
});

/**
 * Every option the native picker reads. It reads each one without a default and crashes the app on any that's missing
 * (react-native-image-picker's own JS fills them in from its DEFAULT_OPTIONS before calling it).
 */
const PICKER_DEFAULTS = {
    mediaType: "photo",
    videoQuality: "high",
    quality: 1,
    maxWidth: 0,
    maxHeight: 0,
    includeBase64: false,
    cameraType: "back",
    selectionLimit: 1,
    saveToPhotos: false,
    durationLimit: 0,
    includeExtra: false,
    presentationStyle: "pageSheet",
};

/** Asks the photo picker for an image, as a data: link so it doesn't depend on the file staying where it is */
function pickImage(maxWidth: number, maxHeight: number): Promise<string | undefined> {
    const picker = getNativeModule("ImagePickerManager");
    if (typeof picker?.launchImageLibrary !== "function") return Promise.reject(new Error(t("Couldn't open the photo picker")));
    return new Promise((resolve, reject) => picker.launchImageLibrary(
        { ...PICKER_DEFAULTS, includeBase64: true, maxWidth, maxHeight, quality: 0.9 },
        (res: any) => {
            if (res?.didCancel) return resolve(undefined);
            const asset = res?.assets?.[0];
            if (res?.errorCode || !asset?.base64) return reject(new Error(res?.errorMessage || t("Couldn't open the photo picker")));
            resolve(`data:${asset.type || "image/jpeg"};base64,${asset.base64}`);
        },
    ));
}

function ImageField({ label, value, onChange, isAvatar }: { label: string; value: string; onChange: (v: string) => void; isAvatar?: boolean; }) {
    const pick = () => pickImage(isAvatar ? 512 : 1200, isAvatar ? 512 : 480).then(uri => uri && onChange(uri)).catch(toastError);
    return <Stack spacing={8}>
        <SectionLabel>{label}</SectionLabel>
        {value ? <View style={{ alignItems: isAvatar ? "center" : "stretch" }}>
            <Image
                source={{ uri: value }}
                resizeMode="cover"
                resizeMethod="resize"
                style={isAvatar
                    ? { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: BRAND }
                    : { width: "100%", height: 100, borderRadius: 8 }}
            />
        </View> : null}
        <TextInput
            placeholder={t("Image URL...")}
            value={value.startsWith("data:") ? "" : value}
            onChange={onChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            isClearable={true}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
            <Button size="sm" variant="secondary" text={t("Choose a file")} icon={findAssetId("ImageIcon")} onPress={pick} grow={true} />
            {value ? <Button size="sm" variant="destructive" text={t("Delete")} icon={findAssetId("TrashIcon")} onPress={() => onChange("")} grow={true} /> : null}
        </View>
    </Stack>;
}

const toHex = (n?: number) => n != null ? `#${n.toString(16).padStart(6, "0")}` : "";

function ColorField({ label, value, placeholder, onChange }: { label: string; value?: number; placeholder: string; onChange: (v?: number) => void; }) {
    const [text, setText] = useState(toHex(value));
    useEffect(() => setText(toHex(value)), [value]);
    const hex = text.replace("#", "");
    const valid = !text || text === "#" || /^[0-9a-f]{6}$/i.test(hex);
    return <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text variant="text-xs/medium" color="text-muted" style={{ width: 56 }}>{label}</Text>
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Choose a color")}
            onPress={() => {
                try {
                    pickColor(value ?? parseInt(placeholder.slice(1, 7), 16), onChange);
                } catch (e) {
                    toastError(e);
                }
            }}
            style={{ width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: toHex(value) || placeholder.split(" ")[0] }}
        >
            <Image source={findAssetId("PencilIcon")} style={{ width: 18, height: 18, tintColor: "#ffffff" }} />
        </Pressable>
        <View style={{ flex: 1 }}>
            <TextInput
                value={text}
                placeholder={placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
                isClearable={true}
                state={valid ? undefined : "error"}
                onChange={(v: string) => {
                    setText(v);
                    const h = v.replace("#", "");
                    const n = parseInt(h, 16);
                    if (!Number.isNaN(n) && h.length === 6) onChange(n);
                    else if (!v || v === "#") onChange(undefined);
                }}
            />
        </View>
    </View>;
}

function DateField({ value, onChange }: { value: string; onChange: (v?: string) => void; }) {
    const pick = () => {
        try {
            pickDate({ title: t("Account creation date"), value, min: "2000-01-01", onPick: onChange });
        } catch (e) {
            toastError(e);
        }
    };
    return <Stack spacing={8}>
        <SectionLabel>{t("Account creation date")}</SectionLabel>
        <View style={{ flexDirection: "row", gap: 8 }}>
            <Button size="md" variant="secondary" text={value || t("Choose a date")} icon={findAssetId("CalendarIcon")} onPress={pick} grow={true} />
            {value ? <Button size="md" variant="destructive" text={t("Delete")} icon={findAssetId("TrashIcon")} onPress={() => onChange(undefined)} /> : null}
        </View>
    </Stack>;
}

function PresetsBar({ accountId, currentData, onLoad }: { accountId: string; currentData: CustomProfileData; onLoad: (data: CustomProfileData) => void; }) {
    const styles = useStyles();
    const [presets, setLocal] = useState<SavedPreset[]>(() => presetsOf(accountId));
    useEffect(() => setLocal(presetsOf(accountId)), [accountId]);

    const update = (next: SavedPreset[]) => {
        setPresets(accountId, next);
        setLocal(next);
    };
    const savePreset = () => prompt({
        title: t("Save current as preset"),
        placeholder: t("Preset name..."),
        confirm: t("Save preset"),
        onSubmit: name => update([...presets, { name: name.trim().slice(0, 32), data: { ...currentData } }]),
    });

    return <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
        {!presets.length && <Text variant="text-xs/medium" color="text-muted">{t("No saved presets")}</Text>}
        {presets.map((p, i) => <View key={`${i}-${p.name}`} style={[styles.pill, { paddingRight: 6 }]}>
            <Pressable onPress={() => onLoad({ ...p.data })} accessibilityHint={t("Click to load")} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Image source={findAssetId("BookmarkIcon")} style={{ width: 13, height: 13, tintColor: semanticColorOf("ICON_DEFAULT", "INTERACTIVE_ICON_DEFAULT") }} />
                <Text variant="text-xs/semibold" color="text-default">{p.name}</Text>
            </Pressable>
            <Pressable onPress={() => update(presets.filter((_, j) => j !== i))} accessibilityLabel={t("Delete preset")} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                <Text variant="text-xs/bold" color="text-muted">✕</Text>
            </Pressable>
        </View>)}
        <Pill label={`+ ${t("Save preset")}`} active={false} onPress={savePreset} />
    </ScrollView>;
}

type Setter = <K extends keyof CustomProfileData>(key: K, val: CustomProfileData[K]) => void;

type BadgeData = Pick<CustomProfileData, "badgeFlags" | "nitroLevel" | "boostMonths" | "customBadgeIds" | "tieredBadges" | "oldName">;

// Drawn again only when the badges change, not on every letter typed elsewhere in the editor
const BadgePicker = memo(function BadgePicker({ set, ...data }: BadgeData & { set: Setter; }) {
    const selected = data.badgeFlags ?? 0;
    const nitroType = data.nitroLevel ?? -1;
    const boostLevel = data.boostMonths ?? -1;
    const customIds = data.customBadgeIds ?? [];
    const tiered = data.tieredBadges ?? {};
    const hasOldName = customIds.includes("oldname");
    // Discord shows one Gifting tier at a time, so the tiers are a single choice
    const giftId = customIds.find(x => GIFT_IDS.includes(x));
    const toggleSpecial = (id: string) => set("customBadgeIds", customIds.includes(id) ? customIds.filter(x => x !== id) : [...customIds, id]);
    const styles = useStyles();

    return <Stack spacing={10}>
        <SectionLabel>{t("Badges")}</SectionLabel>
        <View style={styles.wrap}>
            {BADGES.map(b => <Pill key={b.flag} label={t(b.label)} icon={b.icon} active={!!(selected & b.flag)} onPress={() => set("badgeFlags", selected ^ b.flag)} />)}
        </View>

        <SectionLabel>{t("Evolving Nitro Badge")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("None")} active={nitroType === -1} onPress={() => set("nitroLevel", -1)} />
            {NITRO_LEVELS.map((n, i) => <Pill key={i} label={t(n.label)} icon={n.icon} active={nitroType === i} onPress={() => {
                set("nitroLevel", i);
                if (i >= 1) set("nitro", true);
            }} />)}
        </View>

        <SectionLabel>{t("Special Badges")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("Old username")} icon={OLD_NAME_BADGE_ICON} active={hasOldName} onPress={() => toggleSpecial("oldname")} />
            {(["quest", "meadow", "orbs"] as const).map(id => <Pill key={id} label={t(SPECIAL_BADGES[id].label)} icon={SPECIAL_BADGES[id].icon} active={customIds.includes(id)} onPress={() => toggleSpecial(id)} />)}
        </View>
        {hasOldName && <TextInput
            label={t("Old username displayed in tooltip")}
            description={t("Ex : Triggerr#5954 — will appear as \"Old username: Triggerr#5954\" when hovering the badge.")}
            value={data.oldName ?? ""}
            placeholder={t("OldUser#0000")}
            autoCapitalize="none"
            onChange={(v: string) => set("oldName", v)}
        />}

        <SectionLabel>{t("Gifting")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("None")} active={!giftId} onPress={() => set("customBadgeIds", customIds.filter(x => !GIFT_IDS.includes(x)))} />
            {GIFT_IDS.map((id, i) => <Pill key={id} label={t(GIFT_TIER_NAMES[i])} icon={SPECIAL_BADGES[id].icon} active={giftId === id} onPress={() => set("customBadgeIds", [...customIds.filter(x => !GIFT_IDS.includes(x)), id])} />)}
        </View>

        <SectionLabel>{t("Boost Badge (Server Booster)")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("None")} active={boostLevel === -1} onPress={() => set("boostMonths", -1)} />
            {BOOST_LABELS.map((label, i) => <Pill key={i} label={t(label)} icon={BOOST_ICONS[i]} active={boostLevel === i} onPress={() => set("boostMonths", i)} />)}
        </View>

        {TIERED_BADGES.map(type => {
            const current = tiered[type.key] ?? -1;
            const pick = (tier: number) => {
                const next = { ...tiered };
                if (tier < 0) delete next[type.key];
                else next[type.key] = tier;
                set("tieredBadges", next);
            };
            return <Stack key={type.key} spacing={10}>
                <SectionLabel>{t(type.label)}</SectionLabel>
                <View style={styles.wrap}>
                    <Pill label={t("None")} active={current === -1} onPress={() => pick(-1)} />
                    {type.tiers.map((tier, i) => <Pill key={i} label={t(tier.label)} icon={tier.icon} active={current === i} onPress={() => pick(i)} />)}
                </View>
            </Stack>;
        })}
    </Stack>;
});

const DecorationPicker = memo(function DecorationPicker({ selected, set }: { selected?: string; set: Setter; }) {
    const styles = useStyles();
    return <Stack spacing={10}>
        <SectionLabel>{t("Avatar decoration")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("None")} active={!selected} onPress={() => set("decorationAsset", undefined)} />
            {AVATAR_DECORATIONS.map(dec => <Pressable
                key={`${dec.id}-${dec.label}`}
                accessibilityLabel={dec.label}
                onPress={() => set("decorationAsset", selected === dec.id ? undefined : dec.id)}
                style={[styles.tile, { width: 52, height: 52, borderRadius: 6 }, selected === dec.id && styles.pillOn]}
            >
                <Image source={{ uri: shopThumbnail(getDecorationUrl(dec.id), DECORATION_THUMB, DECORATION_THUMB) }} style={{ width: 46, height: 46 }} resizeMode="contain" resizeMethod="resize" />
            </Pressable>)}
        </View>
    </Stack>;
});

const EFFECT_TILE = { width: 64, height: 86 };
const EFFECT_GAP = 6;
// Profile effects are drawn for a 450×880 profile; asking for that shape keeps the proxy from stretching them. The
// tiles grow a little to fill the row, hence the room above their nominal width.
const EFFECT_ASPECT = 880 / 450;
const EFFECT_THUMB_WIDTH = PixelRatio.getPixelSizeForLayoutSize(EFFECT_TILE.width + EFFECT_GAP);
const DECORATION_THUMB = PixelRatio.getPixelSizeForLayoutSize(46);

const EffectTile = memo(function EffectTile({ effect, size, active, onPick }: { effect: ShopProfileEffect; size: { width: number; height: number; }; active: boolean; onPick: (skuId: string) => void; }) {
    const styles = useStyles();
    return <Pressable
        accessibilityLabel={effect.name}
        accessibilityState={{ selected: active }}
        onPress={() => onPick(effect.skuId)}
        style={[styles.tile, size, styles.effectTile, active && styles.pillOn]}
    >
        {effect.thumbnail && <Image source={{ uri: effect.thumbnail }} style={styles.effectImage} resizeMode="cover" resizeMethod="resize" />}
        {/* Endcord PC names the effect when the pointer rests on it; a touch screen has no pointer */}
        <PlainText numberOfLines={2} style={styles.effectName}>{effect.name}</PlainText>
    </Pressable>;
});

// The shop has hundreds of effects: a list that only draws the rows on screen, in a box like Endcord PC's
const EffectPicker = memo(function EffectPicker({ selected, set }: { selected?: string; set: Setter; }) {
    const styles = useStyles();
    const shopEffects = useShopProfileEffects();
    const [width, setWidth] = useState(0);
    const columns = Math.max(1, Math.floor((width + EFFECT_GAP) / (EFFECT_TILE.width + EFFECT_GAP)));
    // The row's leftover width goes to the tiles, so the grid fills the box edge to edge
    const tileWidth = (width - EFFECT_GAP * (columns - 1)) / columns;
    const tile = useMemo(() => ({ width: tileWidth, height: tileWidth * EFFECT_TILE.height / EFFECT_TILE.width }), [tileWidth]);
    const rowHeight = tile.height + EFFECT_GAP;
    const pick = useCallback((skuId: string) => set("profileEffectId", selected === skuId ? undefined : skuId), [selected, set]);

    return <Stack spacing={10}>
        <SectionLabel>{t("Profile Effect")}</SectionLabel>
        <View style={styles.wrap}>
            <Pill label={t("None")} active={!selected} onPress={() => set("profileEffectId", undefined)} />
        </View>
        {shopEffects.effects.length > 0 && <View style={{ height: 300 }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && <FlatList
                key={columns}
                data={shopEffects.effects}
                extraData={selected}
                numColumns={columns}
                nestedScrollEnabled={true}
                // With columns, the list counts rows: a box's worth to start with, then a couple at a time
                initialNumToRender={Math.ceil(300 / rowHeight)}
                maxToRenderPerBatch={2}
                windowSize={3}
                getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
                keyExtractor={eff => eff.skuId}
                columnWrapperStyle={columns > 1 ? { gap: EFFECT_GAP } : undefined}
                contentContainerStyle={{ gap: EFFECT_GAP }}
                renderItem={({ item }) => <EffectTile effect={item} size={tile} active={selected === item.skuId} onPick={pick} />}
            />}
        </View>}
        {shopEffects.loading && <Text variant="text-xs/medium" color="text-muted">{t("Loading effects from the Discord shop…")}</Text>}
        {shopEffects.failed && <Text variant="text-xs/medium" color="text-muted">{t("Couldn't load effects from the Discord shop. Close this window and try again.")}</Text>}
    </Stack>;
});

interface ShopProfileEffect {
    skuId: string;
    name: string;
    thumbnail?: string;
}

// Discord draws a profile effect only when its SKU is a shop product it can look up, so the choices come from its own
// shop catalog: always current, in the user's language, with previews
function useShopProfileEffects() {
    const store = getStore("CollectiblesCategoryStore");
    const fetchedAt = FluxUtils.useStateFromStores(store ? [store] : [], () => store?.lastSuccessfulFetch);
    const fetchError = FluxUtils.useStateFromStores(store ? [store] : [], () => store?.lastErrorTimestamp);
    const [failed, setFailed] = useState(false);
    const [openedAt] = useState(Date.now);

    useEffect(() => {
        if (!store) return void setFailed(true);
        // Not the products already there: a profile on screen makes Discord look up its effect alone, which isn't
        // the catalog
        if (store.lastSuccessfulFetch || store.isFetchingCategories) return;
        const fetchCategories = findByProps("fetchCollectiblesCategories")?.fetchCollectiblesCategories;
        if (typeof fetchCategories !== "function") return void setFailed(true);
        Promise.resolve().then(() => fetchCategories({})).catch(() => setFailed(true));
    }, []);

    const effects = useMemo(() => {
        const seen = new Set<string>();
        const list: ShopProfileEffect[] = [];
        const products = store?.products;
        const all: any[] = products instanceof Map ? [...products.values()] : Object.values(products ?? {});
        for (const product of all) {
            const item = product?.items?.length === 1 ? product.items[0] : null;
            if (item?.type !== COLLECTIBLE_PROFILE_EFFECT || seen.has(product.skuId)) continue;
            seen.add(product.skuId);
            // The shop's preview, like Endcord PC, but shrunk to the tile: the originals are over a megabyte each, and
            // the list shows dozens at once
            const preview = item.thumbnailPreviewSrc ?? item.staticFrameSrc ?? item.reducedMotionSrc;
            list.push({ skuId: product.skuId, name: product.name, thumbnail: preview && shopThumbnail(preview, EFFECT_THUMB_WIDTH, EFFECT_THUMB_WIDTH * EFFECT_ASPECT) });
        }
        return list;
    }, [fetchedAt]);

    const gaveUp = failed || !fetchedAt && fetchError >= openedAt;
    return { effects: fetchedAt || gaveUp ? effects : [], loading: !fetchedAt && !gaveUp, failed: gaveUp };
}

function useAccounts(): any[] {
    return useMemo(() => {
        try {
            const users = getStore("MultiAccountStore")?.getUsers?.();
            if (Array.isArray(users) && users.length) return users;
        } catch (e) {
            console.error("[Endcord] CustomProfile couldn't list the accounts", e);
        }
        const me = getStore("UserStore")?.getCurrentUser?.();
        return me ? [me] : [];
    }, []);
}

const avatarOf = (user: any): string | undefined => {
    try {
        return findByProps("getUserAvatarURL")?.getUserAvatarURL?.(user, false, 64) ?? undefined;
    } catch {
        return undefined;
    }
};


const LAST_STAGE = 4;

export default function CustomProfileEditor({ onClose }: { onClose: () => void; }) {
    const styles = useStyles();
    const me = myId() ?? "";
    const accounts = useAccounts();
    const [accountId, setAccountId] = useState(me);
    const [data, setData] = useState<CustomProfileData>(() => accountData(me));
    const [saving, setSaving] = useState(false);
    // The page opens with what fits on the first screen; the rest of the form, the badges, the decorations and the
    // effects follow one at a time, so drawing their hundreds of buttons and images never holds the app up for long. As
    // transitions, React draws each in small slices and lets touches and typing go first.
    const [stage, setStage] = useState(0);
    useEffect(() => {
        if (stage >= LAST_STAGE) return;
        const timer = setTimeout(() => startTransition(() => setStage(s => s + 1)), stage ? 16 : 50);
        return () => clearTimeout(timer);
    }, [stage]);
    useEffect(() => setData(accountData(accountId)), [accountId]);

    const set: Setter = useCallback((key, val) => setData(d => ({ ...d, [key]: val })), []);
    const account = accounts.find(a => a?.id === accountId);
    const accountAvatar = useMemo(() => account && avatarOf(account), [account]);

    const save = () => {
        try {
            setSaving(true);
            const id = accountId || me;
            if (!id) throw new Error("No account is logged in");
            saveAccount(id, { ...data });
            showToast(t("Profile Saved"), findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            toastError(e);
        } finally {
            setSaving(false);
            onClose();
        }
    };
    const reset = () => {
        try {
            resetAccount(accountId || me);
            showToast(t("Profile Reset"), findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            toastError(e);
        } finally {
            onClose();
        }
    };
    const runRepair = () => {
        try {
            repair();
        } catch (e) {
            console.error("[Endcord] CustomProfile repair failed", e);
        }
        onClose();
    };

    return <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }} keyboardShouldPersistTaps="handled">
            <Stack spacing={18}>
                {accounts.length > 1 && <TableRowGroup title={t("Select Account")}>
                    <TableRow
                        label={account?.globalName || account?.username || t("Select Account")}
                        icon={accountAvatar ? <Image source={{ uri: accountAvatar }} style={{ width: 24, height: 24, borderRadius: 12 }} /> : undefined}
                        arrow={true}
                        onPress={() => choose(t("Select Account"), accounts.map(a => ({ label: a.globalName || a.username, value: a.id })), setAccountId)}
                    />
                </TableRowGroup>}

                <PresetsBar accountId={accountId} currentData={data} onLoad={setData} />

                <TextInput label={t("Username")} value={data.username ?? ""} placeholder="my_username_00" autoCapitalize="none" autoCorrect={false} onChange={(v: string) => set("username", v)} />
                <TextInput label={t("Display name")} value={data.globalName ?? ""} placeholder={t("My Name")} onChange={(v: string) => set("globalName", v)} />
                <ImageField label={t("Profile picture")} value={data.avatar ?? ""} onChange={v => set("avatar", v)} isAvatar={true} />
                <TableRowGroup title={t("Nitro")}>
                    <TableSwitchRow label={t("Simulate Nitro")} subLabel={t("Enables gradient profile color")} value={data.nitro ?? false} onValueChange={(v: boolean) => set("nitro", v)} />
                </TableRowGroup>
                {stage >= 1 && <>
                    <ImageField label={t("Banner")} value={data.banner ?? ""} onChange={v => set("banner", v)} />
                    <Divider />
                    <TextInput label={t("Bio")} value={data.bio ?? ""} placeholder={t("My description...")} multiline={true} onChange={(v: string) => set("bio", v)} />
                    <TextInput label={t("Pronouns")} value={data.pronouns ?? ""} placeholder={t("he/him")} onChange={(v: string) => set("pronouns", v)} />
                    <Stack spacing={8}>
                        <SectionLabel>{t("Profile color (Nitro — gradient possible)")}</SectionLabel>
                        <ColorField label={t("Color 1")} value={data.accentColor} placeholder="#5865f2" onChange={v => set("accentColor", v)} />
                        <ColorField label={t("Color 2")} value={data.accentColor2} placeholder={`#eb459e (${t("optional")})`} onChange={v => set("accentColor2", v)} />
                    </Stack>
                    <DateField value={data.createdAt ?? ""} onChange={v => set("createdAt", v)} />
                    <TextInput label={t("Email address (local display)")} value={data.email ?? ""} placeholder={t("exemple@mail.com")} keyboardType="email-address" autoCapitalize="none" onChange={(v: string) => set("email", v)} />
                    <TextInput label={t("Phone (local display)")} value={data.phone ?? ""} placeholder="+33 6 00 00 00 00" keyboardType="phone-pad" onChange={(v: string) => set("phone", v)} />
                    <Divider />
                </>}
                {stage >= 2 ? <BadgePicker
                    badgeFlags={data.badgeFlags}
                    nitroLevel={data.nitroLevel}
                    boostMonths={data.boostMonths}
                    customBadgeIds={data.customBadgeIds}
                    tieredBadges={data.tieredBadges}
                    oldName={data.oldName}
                    set={set}
                /> : <ActivityIndicator style={{ marginVertical: 24 }} />}
                {stage >= 3 && <>
                    <Divider />
                    <DecorationPicker selected={data.decorationAsset} set={set} />
                </>}
                {stage >= LAST_STAGE && <>
                    <Divider />
                    <EffectPicker selected={data.profileEffectId} set={set} />
                </>}

                <Text variant="text-xs/medium" color="text-muted">{t("Visual and local modifications only — persistent between restarts.")}</Text>
                <Text variant="text-xs/medium" color="text-muted">{t("Only you see these changes. Clear them before you edit your real profile, so they don't end up in it.")}</Text>
            </Stack>
        </ScrollView>
        <View style={styles.footer}>
            <Button size="sm" variant="secondary" text={t("Cancel")} onPress={onClose} grow={true} />
            <Button size="sm" variant="destructive" text={t("Reset")} icon={findAssetId("TrashIcon")} onPress={reset} grow={true} />
            <Button size="sm" variant="secondary" text={t("Repair")} onPress={runRepair} grow={true} />
            <Button size="sm" variant="primary" text={saving ? t("Saving...") : t("Save")} loading={saving} onPress={save} grow={true} />
        </View>
    </View>;
}
