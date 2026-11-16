/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Adapted from Endcord PC's VolumeBooster, which raises the maximum of Discord's volume sliders. The phone's sliders
 * can't be told apart by name, so here a boost is set with /volumebooster and given straight to the live voice
 * connections, the same way Discord hands them its own volumes. Discord's saved volume and its settings sync never
 * see a value above 200% (PC has to patch both so they don't fight the boost); moving Discord's own slider for that
 * person ends the boost.
 */

import { t, tx } from "@core/i18n";
import { awaitStorage, createMMKVBackend, createStorage, useProxy, wrapSync } from "@core/vendetta/storage";
import { findByProps } from "@metro";

import { definePlugin, onSettingChange } from "../api";
import { getStore, moduleAt, subscribe } from "../common";
import { botMessage, command, displayName, getUser } from "../hooks";
import { choose } from "../ui/dialogs";
import LogList from "../ui/LogList";
import { boostChanges, type BoostContext, boostKey, clampVolume, escapeMarkdown, maxVolume, NORMAL_MAX, parseBoostKey, validBoosts, withBoost } from "./logic";

const saved = wrapSync(createStorage<{ boosts: Record<string, number>; }>(createMMKVBackend("ENDCORD_VOLUME_BOOSTS", { boosts: {} })));

const audioActions = () => moduleAt("actions/AudioActionCreators.tsx")?.default ?? findByProps("setLocalVolume", "toggleLocalMute");

/** Set while the plugin runs: ends a boost and gives the connections Discord's own volume back */
let endBoost: ((key: string) => void) | undefined;

function BoostsPage() {
    useProxy(saved);
    const boosts = validBoosts(saved.boosts, plugin.store.multiplier);
    return <LogList
        title={t("Boosted volumes")}
        empty={t("Boost someone with /volumebooster in any chat")}
        entries={boosts.map(([key, volume]) => {
            const { userId, context } = parseBoostKey(key)!;
            const name = displayName(getUser(userId) ?? { id: userId });
            return {
                key,
                label: `${name} · ${volume}%`,
                subLabel: context === "stream" ? t("Stream sound") : t("Voice"),
                icon: "VoiceNormalIcon",
                onPress: () => choose(name, [{ label: t("End the boost"), value: key }], k => {
                    if (endBoost) endBoost(k);
                    else saved.boosts = withBoost(saved.boosts, k, undefined, plugin.store.multiplier);
                }),
            };
        })}
    />;
}

const plugin = definePlugin({
    id: "endcord.volume-booster",
    name: "VolumeBooster",
    description: tx("Set a person's or a stream's volume above 200% with /volumebooster. Moving Discord's own volume slider for them ends the boost."),
    icon: "VoiceNormalIcon",
    tags: ["Voice", "Utility"],
    settings: {
        multiplier: {
            type: "number",
            label: tx("Volume Multiplier"),
            description: tx("The loudest /volumebooster goes is 200% times this"),
            default: 2,
            min: 1,
            max: 5,
        },
    },
    SettingsComponent: BoostsPage,
    async start({ store, cleanup, logger }) {
        await awaitStorage(saved);
        const engineStore = getStore("MediaEngineStore");
        if (typeof engineStore?.getMediaEngine !== "function") throw new Error("Discord's voice engine wasn't found");
        if (typeof engineStore.getMediaEngine()?.eachConnection !== "function") throw new Error("Discord's voice connections weren't found");
        if (typeof audioActions()?.setLocalVolume !== "function") throw new Error("Discord's volume actions weren't found");

        let warned = false;
        /** Gives every live connection of the context this volume for the person, as Discord does with its own */
        const setOnConnections = (userId: string, context: BoostContext, volume: number) => {
            engineStore.getMediaEngine()?.eachConnection?.((connection: any) => {
                if (connection?.context != null && connection.context !== context) return;
                if (typeof connection?.setLocalVolume !== "function") {
                    if (!warned) logger.warn("a voice connection has no setLocalVolume; boosts don't reach it");
                    warned = true;
                    return;
                }
                connection.setLocalVolume(userId, volume);
            });
        };

        const discordVolume = (userId: string, context: BoostContext): number => {
            const volume = engineStore.getLocalVolume?.(userId, context);
            return typeof volume === "number" && Number.isFinite(volume) ? volume : 100;
        };

        /**
         * The boost keys of the people given a boost on the connections: who gets Discord's own volume back when their
         * boost no longer stands, and when the plugin stops, whatever the saved boosts or the multiplier say by then
         */
        const applied = new Set<string>();

        const give = (key: string, volume: number) => {
            const parsed = parseBoostKey(key);
            if (!parsed) return;
            applied.add(key);
            setOnConnections(parsed.userId, parsed.context, volume);
        };

        /** Discord's own volume again for someone given a boost */
        const giveBack = (key: string) => {
            applied.delete(key);
            const parsed = parseBoostKey(key);
            if (parsed) setOnConnections(parsed.userId, parsed.context, discordVolume(parsed.userId, parsed.context));
        };

        const applyAll = () => {
            const { apply, restore } = boostChanges(applied, validBoosts(saved.boosts, store.multiplier), key => {
                const parsed = parseBoostKey(key);
                // A person muted for you stays muted, however their volume is set
                return !!parsed && !!engineStore.isLocalMute?.(parsed.userId, parsed.context);
            });
            for (const key of restore) giveBack(key);
            for (const [key, volume] of apply) give(key, volume);
        };

        // Discord hands connections its own volumes when one is made or its settings change: the boosts go on again
        // right after, once for all the changes of the moment. Nothing is scheduled once the plugin has stopped, even
        // when it was turned off while its storage loaded (its cleanups then run as they're registered, below)
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const applySoon = (delay = 300) => {
            if (timer || stopped) return;
            timer = setTimeout(() => {
                timer = undefined;
                if (stopped) return;
                try {
                    applyAll();
                } catch (e) {
                    logger.error("couldn't apply the boosts", e);
                }
            }, delay);
        };

        endBoost = (key: string) => {
            saved.boosts = withBoost(saved.boosts, key, undefined, store.multiplier);
            giveBack(key);
        };

        const onEngineChange = () => applySoon();
        engineStore.addChangeListener?.(onEngineChange);
        // Cleanups run last first: the listeners and the timer go, then the connections get Discord's volumes back
        cleanup(
            // Discord's own volumes again on the live connections for everyone given a boost; the boosts stay saved for
            // the next time
            () => {
                endBoost = undefined;
                for (const key of [...applied]) {
                    try {
                        giveBack(key);
                    } catch (e) {
                        logger.error("couldn't give a voice connection Discord's own volume back", e);
                    }
                }
                applied.clear();
            },
            () => {
                stopped = true;
                clearTimeout(timer);
                timer = undefined;
            },
            () => engineStore.removeChangeListener?.(onEngineChange),
            // A lower multiplier lowers the boosts on the connections at once, or ends the ones it leaves at 200% or less
            onSettingChange(store, () => applySoon(0)),
            ...["RTC_CONNECTION_STATE", "VOICE_CHANNEL_SELECT", "VOICE_STATE_UPDATES", "STREAM_CREATE", "STREAM_UPDATE", "AUDIO_TOGGLE_LOCAL_MUTE"]
                .map(type => subscribe(type, () => applySoon())),
            // Discord's own slider (or another plugin) set a volume for someone boosted: theirs wins, and Discord gives it
            // to the connections itself
            subscribe("AUDIO_SET_LOCAL_VOLUME", ({ userId, context }) => {
                if (typeof userId !== "string") return;
                const key = boostKey(userId, context === "stream" ? "stream" : "default");
                applied.delete(key);
                if (validBoosts(saved.boosts, store.multiplier).some(([k]) => k === key)) {
                    saved.boosts = withBoost(saved.boosts, key, undefined, store.multiplier);
                }
            }),
            command({
                name: "volumebooster",
                description: tx("Set someone's volume, above 200% too"),
                options: [
                    { name: "user", description: tx("Whose volume"), type: "user", required: true },
                    { name: "volume", description: tx("In percent: 100 is normal, above 200 is a boost"), type: "integer", required: true },
                    { name: "stream", description: tx("Their stream's sound instead of their voice"), type: "boolean" },
                ],
                run: ({ user, volume, stream }, ctx) => {
                    const userId = String(user ?? "");
                    if (!/^\d{15,21}$/.test(userId)) return botMessage(ctx.channel.id, t("Pick someone first."));
                    const context: BoostContext = stream ? "stream" : "default";
                    const key = boostKey(userId, context);
                    const value = clampVolume(Number(volume), store.multiplier);
                    // Someone else's name, in a message that draws markdown: shown as they wrote it
                    const name = escapeMarkdown(displayName(getUser(userId) ?? { id: userId }));
                    if (value <= NORMAL_MAX) {
                        // Discord's own volume, as its slider sets it; Discord gives it to the connections itself
                        saved.boosts = withBoost(saved.boosts, key, undefined, store.multiplier);
                        applied.delete(key);
                        audioActions()?.setLocalVolume?.(userId, value, context);
                        return botMessage(ctx.channel.id, t("{user} is at {volume}%.", { user: name, volume: value }));
                    }
                    saved.boosts = withBoost(saved.boosts, key, value, store.multiplier);
                    give(key, value);
                    const capped = Number(volume) > value ? ` ${t("That's the most the multiplier allows ({max}%).", { max: maxVolume(store.multiplier) })}` : "";
                    botMessage(ctx.channel.id, t("{user} is boosted to {volume}% in your calls.", { user: name, volume: value }) + capped);
                },
            }),
        );
        applySoon(0);
    },
});

export default plugin;
