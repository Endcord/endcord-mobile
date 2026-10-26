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
import { FluxUtils, NavigationNative } from "@metro/common";
import { Button, Stack, TableRow, TableRowGroup, TableSwitchRow, Text, TextInput } from "@metro/common/components";
import { semanticColorOf } from "@ui/color";
import { createStyles } from "@ui/styles";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { getStore } from "../common";
import { toastError } from "../hooks";
import { choose, prompt } from "../ui/dialogs";
import {
    AVATAR_DECORATIONS, BADGES, BOOST_ICONS, BOOST_LABELS, COLLECTIBLE_PROFILE_EFFECT, type CustomProfileData, getDecorationUrl,
    GIFT_IDS, GIFT_TIER_NAMES, NITRO_LEVELS, OLD_NAME_BADGE_ICON, type SavedPreset, SPECIAL_BADGES, TIERED_BADGES
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
    tile: {
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor: semanticColorOf("BORDER_SUBTLE", "BACKGROUND_MOD_STRONG", "BACKGROUND_MOD_NORMAL"),
        backgroundColor: semanticColorOf("BACKGROUND_MOD_SUBTLE", "BACKGROUND_MOD_NORMAL", "BACKGROUND_BASE_LOW"),
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

function Pill({ label, icon, active, onPress }: { label: string; icon?: string; active: boolean; onPress: () => void; }) {
    const styles = useStyles();
    return <Pressable onPress={onPress} style={[styles.pill, active && styles.pillOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
        {icon ? <Image source={{ uri: icon }} style={{ width: 16, height: 16 }} resizeMode="contain" /> : null}
        <Text variant={active ? "text-xs/bold" : "text-xs/medium"} color={active ? "text-default" : "text-muted"}>{label}</Text>
    </Pressable>;
}

/** Asks the photo picker for an image, as a data: link so it doesn't depend on the file staying where it is */
function pickImage(maxWidth: number, maxHeight: number): Promise<string | undefined> {
    const picker = getNativeModule("ImagePickerManager");
    if (typeof picker?.launchImageLibrary !== "function") return Promise.reject(new Error(t("Couldn't open the photo picker")));
    return new Promise((resolve, reject) => picker.launchImageLibrary(
        { mediaType: "photo", includeBase64: true, maxWidth, maxHeight, quality: 0.9, selectionLimit: 1 },
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
        <View style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: toHex(value) || placeholder.split(" ")[0] }} />
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
    const [text, setText] = useState(value);
    useEffect(() => setText(value), [value]);
    const valid = !text || /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T12:00:00Z`));
    return <TextInput
        label={t("Account creation date")}
        value={text}
        placeholder="2010-06-29"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        isClearable={true}
        state={valid ? undefined : "error"}
        onChange={(v: string) => {
            setText(v);
            if (!v) onChange(undefined);
            else if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`))) onChange(v);
        }}
    />;
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

function BadgePicker({ data, set }: { data: CustomProfileData; set: <K extends keyof CustomProfileData>(key: K, val: CustomProfileData[K]) => void; }) {
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
}

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
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!store) return void setFailed(true);
        if (store.products?.size) return;
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
            list.push({ skuId: product.skuId, name: product.name, thumbnail: item.thumbnailPreviewSrc });
        }
        return list;
    }, [fetchedAt]);

    return { effects, loading: !failed && !effects.length, failed: failed && !effects.length };
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

export default function CustomProfileEditor() {
    const navigation = NavigationNative.useNavigation();
    const styles = useStyles();
    const shopEffects = useShopProfileEffects();
    const me = myId() ?? "";
    const accounts = useAccounts();
    const [accountId, setAccountId] = useState(me);
    const [data, setData] = useState<CustomProfileData>(() => accountData(me));
    const [saving, setSaving] = useState(false);
    useEffect(() => setData(accountData(accountId)), [accountId]);

    const set = <K extends keyof CustomProfileData>(key: K, val: CustomProfileData[K]) => setData(d => ({ ...d, [key]: val }));
    const close = () => navigation.goBack();
    const account = accounts.find(a => a?.id === accountId);

    const save = () => {
        try {
            setSaving(true);
            const id = accountId || me;
            if (!id) throw new Error("No account is logged in");
            saveAccount(id, { ...data });
            showToast(t("Profile Saved"), findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            showToast(`Save error: ${(e as Error)?.message ?? e}`, findAssetId("CircleXIcon-primary"));
        } finally {
            setSaving(false);
            close();
        }
    };
    const reset = () => {
        try {
            resetAccount(accountId || me);
            showToast(t("Profile Reset"), findAssetId("CheckmarkLargeIcon"));
        } catch (e) {
            showToast(`Reset error: ${(e as Error)?.message ?? e}`, findAssetId("CircleXIcon-primary"));
        } finally {
            close();
        }
    };
    const runRepair = () => {
        try {
            repair();
        } catch (e) {
            console.error("[Endcord] CustomProfile repair failed", e);
        }
        close();
    };

    return <View style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16 }} keyboardShouldPersistTaps="handled">
            <Stack spacing={18}>
                {accounts.length > 1 && <TableRowGroup title={t("Select Account")}>
                    <TableRow
                        label={account?.globalName || account?.username || t("Select Account")}
                        icon={avatarOf(account) ? <Image source={{ uri: avatarOf(account) }} style={{ width: 24, height: 24, borderRadius: 12 }} /> : undefined}
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
                <BadgePicker data={data} set={set} />
                <Divider />

                <Stack spacing={10}>
                    <SectionLabel>{t("Avatar decoration")}</SectionLabel>
                    <View style={styles.wrap}>
                        <Pill label={t("None")} active={!data.decorationAsset} onPress={() => set("decorationAsset", undefined)} />
                        {AVATAR_DECORATIONS.map(dec => <Pressable
                            key={`${dec.id}-${dec.label}`}
                            accessibilityLabel={dec.label}
                            onPress={() => set("decorationAsset", data.decorationAsset === dec.id ? undefined : dec.id)}
                            style={[styles.tile, { width: 52, height: 52, borderRadius: 6 }, data.decorationAsset === dec.id && styles.pillOn]}
                        >
                            <Image source={{ uri: getDecorationUrl(dec.id) }} style={{ width: 46, height: 46 }} resizeMode="contain" />
                        </Pressable>)}
                    </View>
                </Stack>
                <Divider />

                <Stack spacing={10}>
                    <SectionLabel>{t("Profile Effect")}</SectionLabel>
                    <View style={styles.wrap}>
                        <Pill label={t("None")} active={!data.profileEffectId} onPress={() => set("profileEffectId", undefined)} />
                        {shopEffects.effects.map(eff => <Pressable
                            key={eff.skuId}
                            accessibilityLabel={eff.name}
                            onPress={() => set("profileEffectId", data.profileEffectId === eff.skuId ? undefined : eff.skuId)}
                            style={[styles.tile, { width: 64, height: 86, borderRadius: 8, padding: 2 }, data.profileEffectId === eff.skuId && styles.pillOn]}
                        >
                            {eff.thumbnail
                                ? <Image source={{ uri: eff.thumbnail }} style={{ width: "100%", height: "100%", borderRadius: 6 }} resizeMode="cover" />
                                : <Text variant="text-xxs/medium" color="text-default" style={{ textAlign: "center" }}>{eff.name}</Text>}
                        </Pressable>)}
                    </View>
                    {shopEffects.loading && <Text variant="text-xs/medium" color="text-muted">{t("Loading effects from the Discord shop…")}</Text>}
                    {shopEffects.failed && <Text variant="text-xs/medium" color="text-muted">{t("Couldn't load effects from the Discord shop. Close this window and try again.")}</Text>}
                </Stack>

                <Text variant="text-xs/medium" color="text-muted">{t("Visual and local modifications only — persistent between restarts.")}</Text>
                <Text variant="text-xs/medium" color="text-muted">{t("Only you see these changes. Clear them before you edit your real profile, so they don't end up in it.")}</Text>
            </Stack>
        </ScrollView>
        <View style={styles.footer}>
            <Button size="sm" variant="secondary" text={t("Cancel")} onPress={close} grow={true} />
            <Button size="sm" variant="destructive" text={t("Reset")} icon={findAssetId("TrashIcon")} onPress={reset} grow={true} />
            <Button size="sm" variant="secondary" text={t("Repair")} onPress={runRepair} grow={true} />
            <Button size="sm" variant="primary" text={saving ? t("Saving...") : t("Save")} loading={saving} onPress={save} grow={true} />
        </View>
    </View>;
}
