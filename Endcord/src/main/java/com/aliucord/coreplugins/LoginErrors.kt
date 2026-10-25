/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.coreplugins

import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import com.aliucord.Utils
import com.aliucord.entities.CorePlugin
import com.aliucord.patcher.after
import com.discord.utilities.error.Error
import com.discord.widgets.auth.WidgetAuthCaptcha
import com.discord.widgets.auth.WidgetAuthLogin
import org.json.JSONObject

/**
 * Makes password login failures understandable.
 *
 * The app parses Discord's error body with a reader that expects every unknown field to be a list, so a body
 * that starts with a plain string field (which Discord's current captcha and verification answers do) is thrown
 * away half-read. The user then only sees "A forbidden network request has occurred" and the captcha never
 * opens. This reads the body again: a captcha request opens the captcha screen, a message from Discord is shown
 * as is, and the body is written to the log so a report says what Discord actually answered.
 */
internal class LoginErrors : CorePlugin(Manifest("LoginErrors")) {
    init {
        manifest.description = "Shows Discord's real answer when a password login fails and opens the captcha when it asks for one"
    }

    override val isHidden = true

    override fun start(context: Context) {
        patcher.after<WidgetAuthLogin>("handleError", Error::class.java, String::class.java) { param ->
            try {
                val error = param.args[0] as Error
                val response = error.response
                // The app understood the answer: it showed field errors or opened the captcha itself
                if (!response.messages.isNullOrEmpty()) return@after
                val body = error.bodyText ?: return@after
                val json = try {
                    JSONObject(body)
                } catch (e: Throwable) {
                    logger.warn("Login failed with HTTP ${response.code}, body is not JSON: ${body.take(300)}")
                    return@after
                }
                logger.info("Login failed with HTTP ${response.code}: ${body.take(600)}")

                if (json.has("captcha_key")) {
                    val launcher = captchaLauncher.get(this) as? ActivityResultLauncher<*> ?: return@after
                    // The companion's Kotlin metadata is stripped, so it is called through reflection
                    processErrorsForCaptcha.invoke(companion, requireContext(), launcher, mutableListOf("captcha_key"), error)
                    return@after
                }
                val message = json.optString("message").takeIf { it.isNotEmpty() } ?: return@after
                error.setShowErrorToasts(false)
                Utils.showToast(message, true)
            } catch (e: Throwable) {
                logger.error("Failed to inspect the login error", e)
            }
        }
    }

    private companion object {
        val captchaLauncher by lazy {
            WidgetAuthLogin::class.java.getDeclaredField("captchaLoginLauncher").apply { isAccessible = true }
        }
        val companion: Any by lazy { WidgetAuthCaptcha::class.java.getDeclaredField("Companion").get(null)!! }
        val processErrorsForCaptcha by lazy {
            companion.javaClass.getDeclaredMethod(
                "processErrorsForCaptcha",
                Context::class.java,
                ActivityResultLauncher::class.java,
                List::class.java,
                Error::class.java,
            )
        }
    }
}
