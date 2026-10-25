/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.wellbeing

import android.app.ActivityManager
import android.content.Context
import androidx.appcompat.app.AlertDialog
import com.aliucord.Utils
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.entities.PluginSetting.Choice.Option
import com.aliucord.i18n.I18n
import com.aliucord.utils.RxUtils.await
import com.discord.api.presence.ClientStatus
import com.discord.stores.StoreStream
import com.discord.utilities.rest.RestAPI
import com.endcord.plugins.api.OutgoingMessages
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

internal class Wellbeing : EndcordPlugin(
    name = "Wellbeing",
    description = "A gentle, private dashboard of how you use Discord: screen time, messages and calm controls. Everything stays on your phone.",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("utility")

    override val settingsSchema = listOf(
        PluginSetting.Action("dashboard", "Open dashboard", "Today's time and messages, and the last 7 days") { showDashboard(it) },
        PluginSetting.Switch("breakReminders", "Show a gentle nudge to take a break after a while", null, true),
        PluginSetting.Choice(
            "breakInterval", "Nudge me after this much continuous time", null,
            listOf(Option("45", "45 minutes"), Option("60", "1 hour"), Option("90", "1.5 hours"), Option("120", "2 hours")),
            default = "90",
        ),
        PluginSetting.Choice(
            "dailyGoalMin", "A soft daily time goal — only a gentle note, never a limit", null,
            listOf(Option("0", "No goal"), Option("60", "1 hour"), Option("120", "2 hours"), Option("180", "3 hours")),
        ),
        PluginSetting.Action("break15", "Break · 15 min", "Do Not Disturb for a while, then back to your status") { takeBreak(15) },
        PluginSetting.Action("break30", "Break · 30 min") { takeBreak(30) },
        PluginSetting.Action("cancelBreak", "Cancel break") { cancelBreak() },
    )

    private class Day(val date: String, var activeMin: Int, var messages: Int, var sessions: Int)

    /** The last [KEEP_DAYS] days, oldest first. Only touched on the main thread. */
    private val days = ArrayList<Day>()
    private var continuousMin = 0
    private var dirty = false
    private var running = false
    private var breakRestore: ClientStatus? = null

    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            try {
                onMinute()
            } catch (e: Throwable) {
                logger.error("Wellbeing tick failed", e)
            }
            Utils.mainThread.postDelayed(this, MINUTE_MS)
        }
    }
    private val endBreak = Runnable { cancelBreak() }

    override fun start(context: Context) {
        Utils.mainThread.post {
            load()
            today().sessions++
            dirty = true
            running = true
            continuousMin = 0
            Utils.mainThread.postDelayed(tick, MINUTE_MS)
        }
        OutgoingMessages.register(name, OutgoingMessages.Priority.DELIVERY + 50) { message ->
            message.afterSend { Utils.mainThread.post { today().messages++; dirty = true } }
        }
    }

    override fun stop(context: Context) {
        super.stop(context)
        Utils.mainThread.post {
            running = false
            Utils.mainThread.removeCallbacks(tick)
            if (breakRestore != null) cancelBreak()
            save()
        }
    }

    private fun onMinute() {
        if (!isForeground()) {
            continuousMin = 0
        } else {
            today().activeMin++
            dirty = true
            continuousMin++
            val interval = choice("breakInterval").toIntOrNull() ?: 90
            if (bool("breakReminders") && continuousMin >= interval) {
                continuousMin = 0
                Utils.showToast(I18n.t("You've been on Discord for a while. Time to stretch and drink some water."), true)
            }
        }
        save()
    }

    private fun isForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    private fun key(cal: Calendar) = String.format(Locale.ROOT, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))

    private fun today(): Day {
        val key = key(Calendar.getInstance())
        days.lastOrNull()?.let { if (it.date == key) return it }
        val day = Day(key, 0, 0, 0)
        days.add(day)
        while (days.size > KEEP_DAYS) days.removeAt(0)
        return day
    }

    private fun load() {
        days.clear()
        try {
            val array = JSONArray(settings.getString(DATA_KEY, "[]") ?: "[]")
            for (i in 0 until array.length()) {
                val o = array.optJSONObject(i) ?: continue
                days.add(Day(o.optString("date"), o.optInt("activeMin"), o.optInt("messages"), o.optInt("sessions")))
            }
            days.sortBy { it.date }
            while (days.size > KEEP_DAYS) days.removeAt(0)
        } catch (e: Throwable) {
            logger.error("Failed to read the wellbeing data", e)
        }
    }

    /** Writes the stats in the background, at most once a minute. */
    private fun save() {
        if (!dirty) return
        dirty = false
        val array = JSONArray()
        for (d in days) {
            array.put(JSONObject().put("date", d.date).put("activeMin", d.activeMin).put("messages", d.messages).put("sessions", d.sessions))
        }
        val json = array.toString()
        Utils.threadPool.execute {
            try {
                settings.setString(DATA_KEY, json)
            } catch (e: Throwable) {
                logger.error("Failed to save the wellbeing data", e)
            }
        }
    }

    private fun fmt(min: Int): String = if (min < 60) "${min}m" else "${min / 60}h ${min % 60}m"

    private fun showDashboard(ctx: Context) {
        if (!running) load()
        val today = today()
        val goal = choice("dailyGoalMin").toIntOrNull() ?: 0
        val text = StringBuilder()
        text.append(I18n.t("A little picture of how you spend time here. All of it stays on your phone and is never sent anywhere.")).append("\n\n")
        text.append(I18n.t("Today: {time}", "time" to fmt(today.activeMin))).append('\n')
        if (goal > 0) {
            text.append(
                if (today.activeMin <= goal) I18n.t("Within your {goal} goal — nice 💖", "goal" to fmt(goal))
                else I18n.t("A little past your {goal} goal — be kind to yourself 🌿", "goal" to fmt(goal)),
            ).append('\n')
        }
        text.append(I18n.t("Messages sent today: {count}", "count" to today.messages)).append("\n\n")
        text.append(I18n.t("Last 7 days")).append('\n')
        val format = SimpleDateFormat("EEE d", Locale.getDefault())
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -6)
        for (i in 0 until 7) {
            val day = days.firstOrNull { it.date == key(cal) }
            text.append(format.format(cal.time)).append(": ").append(fmt(day?.activeMin ?: 0))
                .append(" · ").append(I18n.t("{count} messages", "count" to (day?.messages ?: 0))).append('\n')
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        AlertDialog.Builder(ctx)
            .setTitle(I18n.t("Your Discord, gently 🌿"))
            .setMessage(text.toString().trimEnd())
            .setPositiveButton(I18n.t("Close"), null)
            .show()
    }

    private fun setStatus(status: ClientStatus) {
        Utils.threadPool.execute {
            val (_, error) = RestAPI.getApi().updateUserSettings(StatusParams.withStatus(status)).await()
            if (error != null) {
                logger.error("Failed to change the status", error)
                Utils.showToast(I18n.t("Failed to set the status"))
            }
        }
    }

    private fun takeBreak(minutes: Int) {
        Utils.mainThread.removeCallbacks(endBreak)
        if (breakRestore == null) breakRestore = StoreStream.getPresences().localPresence?.status ?: ClientStatus.ONLINE
        setStatus(ClientStatus.DND)
        Utils.mainThread.postDelayed(endBreak, minutes * MINUTE_MS)
        Utils.showToast(I18n.t("Enjoy your break. Your status goes back in {minutes} minutes.", "minutes" to minutes))
    }

    private fun cancelBreak() {
        Utils.mainThread.removeCallbacks(endBreak)
        val restore = breakRestore ?: return
        breakRestore = null
        setStatus(restore)
    }

    private companion object {
        const val DATA_KEY = "days"
        const val KEEP_DAYS = 14
        const val MINUTE_MS = 60_000L
    }
}
