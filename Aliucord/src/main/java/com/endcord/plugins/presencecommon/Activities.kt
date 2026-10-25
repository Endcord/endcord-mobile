/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.presencecommon

import com.aliucord.Logger
import com.aliucord.utils.GsonUtils
import com.discord.api.activity.Activity
import com.discord.api.activity.ActivityAssets
import com.discord.api.activity.ActivityMetadata
import com.discord.api.activity.ActivityParty
import com.discord.api.activity.ActivityTimestamps
import com.discord.api.activity.ActivityType
import org.json.JSONArray
import org.json.JSONObject
import java.lang.reflect.Field

/**
 * Builds and copies the app's [Activity] model. Its getters are obfuscated:
 * a applicationId, b assets, c buttons, d createdAt, e details, f emoji, g flags, h name, i party, j platform,
 * k sessionId, l state, m supportedPlatforms, n syncId, o timestamps, p type. `url` and `metadata` have no getter.
 */
internal object Activities {
    private val logger = Logger("Endcord/Activities")

    /** Discord's INSTANCE activity flag, set by every rich presence Endcord PC sends. */
    const val FLAG_INSTANCE = 1

    private val fUrl: Field? by lazy { field("url") }
    private val fMetadata: Field? by lazy { field("metadata") }

    private fun field(name: String): Field? = try {
        Activity::class.java.getDeclaredField(name).apply { isAccessible = true }
    } catch (e: Throwable) {
        logger.error("Activity.$name not found", e)
        null
    }

    fun create(
        name: String,
        type: ActivityType,
        applicationId: Long? = null,
        details: String? = null,
        state: String? = null,
        url: String? = null,
        start: Long? = null,
        end: Long? = null,
        assets: ActivityAssets? = null,
        party: ActivityParty? = null,
        buttons: List<String>? = null,
        buttonUrls: List<String>? = null,
        flags: Int? = FLAG_INSTANCE,
    ): Activity {
        val timestamps = if (start != null || end != null) ActivityTimestamps(start?.toString(), end?.toString()) else null
        return Activity(
            name, type, url, System.currentTimeMillis(), timestamps, applicationId, details, state,
            null, party, assets, flags, null, null, metadata(buttonUrls), null, null,
            if (buttons.isNullOrEmpty()) null else buttons,
        )
    }

    /** [ActivityMetadata] has no usable constructor in the compile jar, so it is filled in through Gson. */
    private fun metadata(buttonUrls: List<String>?): ActivityMetadata? {
        if (buttonUrls.isNullOrEmpty()) return null
        return try {
            val json = JSONObject().put("buttonUrls", JSONArray(buttonUrls)).toString()
            @Suppress("DEPRECATION")
            GsonUtils.fromJson(json, ActivityMetadata::class.java)
        } catch (e: Throwable) {
            logger.error("Failed to build activity metadata", e)
            null
        }
    }

    fun assets(largeImage: String?, largeText: String?, smallImage: String?, smallText: String?): ActivityAssets? =
        if (largeImage == null && smallImage == null) null
        else ActivityAssets(largeImage, largeText?.ifEmpty { null }, smallImage, smallText?.ifEmpty { null })

    /** A copy of [activity] with another name, everything else unchanged. */
    fun withName(activity: Activity, name: String): Activity = Activity(
        name, activity.p(), fUrl?.get(activity) as String?, activity.d(), activity.o(), activity.a(), activity.e(),
        activity.l(), activity.f(), activity.i(), activity.b(), activity.g(), activity.n(), activity.k(),
        fMetadata?.get(activity) as ActivityMetadata?, activity.j(), activity.m(), activity.c(),
    )

    /** Identifies an activity across updates of its details: type, name and application. */
    fun signature(activity: Activity): String = "${activity.p()?.name}|${activity.h()}|${activity.a()}"
}
