/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.chatgpt

import android.content.Context
import com.aliucord.Http
import com.aliucord.Utils
import com.aliucord.api.CommandsAPI.CommandResult
import com.aliucord.entities.EndcordPlugin
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * `/chatgpt` asks OpenAI with the user's own API key. Commands already run on a background thread, so the
 * request is made right there and the answer is shown only to you.
 */
internal class ChatGPT : EndcordPlugin(
    name = "ChatGPT",
    description = "Allows using ChatGPT directly in Discord with configurable settings",
    authors = arrayOf("ewlle", "kraethis"),
) {
    override val tags = listOf("chat", "utility")

    override val settingsSchema = listOf(
        PluginSetting.Text(
            "apiKey",
            "Your OpenAI API key (obtained from https://platform.openai.com/api-keys)",
            placeholder = "sk-proj-...",
        ),
        PluginSetting.Choice(
            key = "model",
            label = "ChatGPT model to use",
            options = listOf(
                PluginSetting.Choice.Option("gpt-4o-mini", "GPT-4o Mini"),
                PluginSetting.Choice.Option("gpt-4o-2024-08-06", "GPT-4o (2024-08-06) - Recommended"),
                PluginSetting.Choice.Option("gpt-4o-mini-2024-07-18", "GPT-4o Mini (2024-07-18) - Fast & Economical"),
                PluginSetting.Choice.Option("gpt-4o", "GPT-4o"),
                PluginSetting.Choice.Option("gpt-4-turbo-2024-04-09", "GPT-4 Turbo (2024-04-09)"),
                PluginSetting.Choice.Option("gpt-4-turbo-preview", "GPT-4 Turbo"),
                PluginSetting.Choice.Option("gpt-4-0613", "GPT-4 (0613)"),
                PluginSetting.Choice.Option("gpt-4", "GPT-4"),
                PluginSetting.Choice.Option("gpt-3.5-turbo-0125", "GPT-3.5 Turbo (0125)"),
                PluginSetting.Choice.Option("gpt-3.5-turbo", "GPT-3.5 Turbo"),
            ),
            default = "gpt-4o-mini",
        ),
        PluginSetting.Number("maxTokens", "Maximum number of tokens in the response", default = 500, min = 50, max = 4000),
        PluginSetting.Number(
            "temperature",
            "Response creativity in percent (0 = very precise, 100 = very creative)",
            default = 70,
            min = 0,
            max = 100,
        ),
        PluginSetting.Text(
            "systemPrompt",
            "System prompt to customize ChatGPT's behavior",
            default = "You are a helpful and friendly assistant. Respond concisely and clearly.",
            placeholder = "You are an assistant...",
            multiline = true,
        ),
        PluginSetting.Switch("enableNotifications", "Show notifications for errors and successes", default = true),
    )

    private val processing = AtomicBoolean(false)

    override fun start(context: Context) {
        commands.registerCommand(
            "chatgpt",
            "Ask ChatGPT a question",
            listOf(Utils.createCommandOption(name = "question", description = "Your question for ChatGPT", required = true)),
        ) { ctx ->
            val question = ctx.getString("question")
            if (question.isNullOrBlank()) return@registerCommand reply("❌ " + I18n.t("No question provided!"))
            if (!validKey(string("apiKey"))) {
                return@registerCommand reply(
                    "❌ " + I18n.t("API key not configured or invalid. Configure your key in the ChatGPT plugin settings."),
                )
            }
            if (!processing.compareAndSet(false, true)) {
                return@registerCommand reply("⏳ " + I18n.t("A ChatGPT request is already in progress. Please wait..."))
            }
            try {
                val answer = ask(question)
                notify(I18n.t("Response generated successfully"))
                reply("🤖 **ChatGPT** (${model()}):\n\n$answer")
            } catch (e: Throwable) {
                logger.error("ChatGPT request failed", e)
                val message = e.message ?: I18n.t("An error occurred while communicating with ChatGPT.")
                notify(message)
                reply("❌ **${I18n.t("ChatGPT Error")}**: $message")
            } finally {
                processing.set(false)
            }
        }

        commands.registerCommand("chatgpt-info", "Display information about ChatGPT configuration") {
            val keyStatus = if (validKey(string("apiKey"))) "✅ " + I18n.t("Configured") else "❌ " + I18n.t("Not configured or invalid")
            val status = if (processing.get()) "⏳ " + I18n.t("Processing") else "🟢 " + I18n.t("Ready")
            val hint = if (validKey(string("apiKey"))) "" else "\n⚠️ " + I18n.t("Configure your API key in the plugin settings.")
            reply(
                "🤖 **${I18n.t("ChatGPT Configuration")}**\n\n" +
                    "**${I18n.t("API Key")}**: $keyStatus\n" +
                    "**${I18n.t("Model")}**: ${model()}\n" +
                    "**${I18n.t("Max Tokens")}**: ${int("maxTokens")}\n" +
                    "**${I18n.t("Temperature")}**: ${temperature()}\n" +
                    "**${I18n.t("Status")}**: $status\n" + hint,
            )
        }
    }

    private fun reply(content: String) = CommandResult(content, null, false, "ChatGPT", null)

    private fun model() = choice("model").ifEmpty { "gpt-4o-mini" }

    private fun temperature() = int("temperature").coerceIn(0, 100) / 100.0

    private fun notify(message: String) {
        if (bool("enableNotifications")) Utils.showToast(message)
    }

    private fun validKey(key: String): Boolean {
        val trimmed = key.trim()
        return trimmed.startsWith("sk-") && trimmed.length > 20
    }

    /** Calls the chat completions API; runs on the command's background thread. */
    private fun ask(question: String): String {
        val body = JSONObject()
            .put("model", model())
            .put(
                "messages",
                JSONArray()
                    .put(JSONObject().put("role", "system").put("content", string("systemPrompt")))
                    .put(JSONObject().put("role", "user").put("content", question)),
            )
            .put("max_tokens", int("maxTokens").coerceIn(50, 4000))
            .put("temperature", temperature())

        val request = Http.Request(API_URL, "POST")
            .setHeader("Authorization", "Bearer ${string("apiKey").trim()}")
            .setHeader("Content-Type", "application/json")
            .setRequestTimeout(60_000)
        request.use {
            val response = it.executeWithBody(body.toString())
            if (!response.ok()) {
                val error = try {
                    it.conn.errorStream?.bufferedReader()?.use { reader -> reader.readText() }
                        ?.let { text -> JSONObject(text).optJSONObject("error")?.optString("message") }
                } catch (e: Throwable) {
                    null
                }
                val detail = when {
                    !error.isNullOrEmpty() -> ": $error"
                    response.statusCode == 401 -> ": " + I18n.t("Invalid or expired API key")
                    response.statusCode == 429 -> ": " + I18n.t("Rate limit reached, please try again later")
                    else -> ""
                }
                throw IllegalStateException(I18n.t("API Error ({status})", "status" to response.statusCode) + detail)
            }
            val content = JSONObject(response.text())
                .optJSONArray("choices")?.optJSONObject(0)
                ?.optJSONObject("message")?.optString("content")
                ?: throw IllegalStateException(I18n.t("Unexpected response from OpenAI API"))
            return content.trim()
        }
    }

    private companion object {
        const val API_URL = "https://api.openai.com/v1/chat/completions"
    }
}
