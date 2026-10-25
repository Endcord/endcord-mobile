/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.userscommon

import android.content.Context
import android.content.ContextWrapper
import androidx.fragment.app.FragmentActivity
import com.aliucord.Logger
import com.aliucord.Utils
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.aliucord.wrappers.users.globalName
import com.discord.models.domain.ModelUserRelationship
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.discord.models.user.User as ModelUser

/** User lookups shared by the plugins of the users batch. */
internal object Users {
    private val logger = Logger("UsersCommon")

    /** The name Discord shows for [user]: their display name, or their username without one. */
    @JvmStatic
    fun displayName(user: ModelUser): String {
        val global = try {
            user.globalName
        } catch (_: Throwable) {
            null
        }
        return if (global.isNullOrBlank()) user.username else global
    }

    /** The display name of a cached user, or their id when the app doesn't know them. */
    @JvmStatic
    fun displayName(userId: Long): String =
        StoreStream.getUsers().users[userId]?.let { displayName(it) } ?: userId.toString()

    /** The activity a view's [context] belongs to, falling back to the app's main activity. */
    @JvmStatic
    fun activityOf(context: Context): FragmentActivity {
        var current: Context? = context
        while (current != null) {
            if (current is FragmentActivity) return current
            current = (current as? ContextWrapper)?.baseContext
        }
        return Utils.appActivity
    }

    /** The relationship type the app has stored for [userId], see [ModelUserRelationship]. */
    @JvmStatic
    fun relationshipType(userId: Long): Int =
        StoreStream.getUserRelationships().relationships[userId] ?: ModelUserRelationship.TYPE_NONE

    @JvmStatic
    fun isOutgoingRequest(userId: Long): Boolean =
        relationshipType(userId) == ModelUserRelationship.TYPE_INVITE_OUTGOING

    /**
     * Cancels the friend request you sent to [userId], the same request Discord sends when you remove a
     * friend. Runs in the background and confirms the result with a toast.
     */
    @JvmStatic
    fun cancelOutgoingRequest(userId: Long) {
        if (!isOutgoingRequest(userId)) return
        Utils.threadPool.execute {
            val error = try {
                val (_, err) = RestAPI.getApi().removeRelationship("User Profile", userId).await()
                err
            } catch (e: Throwable) {
                e
            }
            if (error != null) logger.error("Failed to cancel the friend request to $userId", error)
            Utils.mainThread.post {
                Utils.showToast(
                    if (error == null) I18n.t("Friend request cancelled")
                    else I18n.t("Couldn't cancel the friend request")
                )
            }
        }
    }
}
