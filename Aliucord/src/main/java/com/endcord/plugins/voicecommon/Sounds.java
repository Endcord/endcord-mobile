/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.voicecommon;

import android.content.Context;
import android.media.Ringtone;
import android.media.RingtoneManager;

import com.aliucord.Logger;
import com.discord.utilities.media.AppSound;
import com.discord.utilities.media.AppSoundManager;

/**
 * Sounds for the voice plugins, from the app itself (no downloads): Discord's own call sounds through its
 * AppSoundManager, and the phone's notification sound. Java because AppSound's companion isn't reachable from
 * Kotlin.
 */
public final class Sounds {
    private static final Logger logger = new Logger("VoiceSounds");

    private Sounds() {}

    private static void play(AppSound sound) {
        try {
            AppSoundManager.Provider.INSTANCE.get().play(sound);
        } catch (Throwable e) {
            logger.error("Failed to play a sound", e);
        }
    }

    /** Discord's "stream started" sound, used when a camera turns on. */
    public static void cameraOn() {
        play(AppSound.Companion.getSOUND_STREAM_STARTED());
    }

    /** Discord's "stream ended" sound, used when a camera turns off. */
    public static void cameraOff() {
        play(AppSound.Companion.getSOUND_STREAM_ENDED());
    }

    /** The phone's default notification sound. */
    public static void notification(Context context) {
        try {
            Ringtone ringtone = RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
            if (ringtone != null) ringtone.play();
        } catch (Throwable e) {
            logger.error("Failed to play the notification sound", e);
        }
    }
}
