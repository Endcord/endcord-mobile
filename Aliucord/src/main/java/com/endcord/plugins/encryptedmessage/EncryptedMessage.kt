/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.encryptedmessage

import android.app.AlertDialog
import android.content.Context
import android.widget.NumberPicker
import com.aliucord.Utils
import com.aliucord.entities.PluginSetting
import com.aliucord.i18n.I18n
import com.endcord.plugins.api.MessageActions
import com.endcord.plugins.composercommon.ComposerPlugin
import com.endcord.plugins.composercommon.OutgoingMessages
import com.lytefast.flexinput.R
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

/**
 * Same cipher as Endcord PC, so messages encrypted on either side decrypt on the other.
 */
internal class EncryptedMessage : ComposerPlugin(
    name = "EncryptedMessage",
    description = "Encrypts your messages with 400 unique techniques (0–399). Only those who know the key can decrypt.",
    authors = arrayOf("vpg"),
) {
    override val tags = listOf("chat", "privacy")

    override val settingsSchema = listOf(
        PluginSetting.Number(
            key = "technique",
            label = "Encryption technique",
            description = "Also available from the long-press menu of the send button",
            default = 0,
            min = 0,
            max = TECHNIQUES - 1,
        ),
    )

    /** Like the lock button on Endcord PC, encryption starts off every time the app starts. */
    private var enabled = false

    private val technique: Int get() = int("technique").coerceIn(0, TECHNIQUES - 1)

    override fun start(context: Context) {
        composerAction("Encrypt messages", checked = { enabled }) {
            enabled = !enabled
            Utils.showToast(
                if (enabled) I18n.t("Encryption active, technique {technique}", "technique" to technique)
                else I18n.t("Encryption disabled"),
            )
        }
        composerAction("Encryption technique") { input -> pickTechnique(input.context) }

        onOutgoing(OutgoingMessages.Priority.ENCRYPT) { message ->
            if (!enabled || message.content.isBlank()) return@onOutgoing
            val encrypted = encrypt(message.content, technique)
            if (encrypted.length > 2000) {
                Utils.showToast(I18n.t("Message too long to encrypt ({length}/2000)", "length" to encrypted.length))
                message.cancel(clearInput = false)
                return@onOutgoing
            }
            message.content = encrypted
        }

        MessageActions.register(
            name,
            "Decrypt message",
            R.e.ic_lock_light_a60_24dp,
            visible = { it.message.content?.startsWith(MARKER) == true },
        ) { ctx ->
            val found = autoDecrypt(ctx.message.content ?: "")
            if (found == null) {
                Utils.showToast(I18n.t("Could not decrypt this message"))
                return@register
            }
            val (text, usedTechnique) = found
            AlertDialog.Builder(ctx.sheet.requireContext())
                .setTitle(I18n.t("Detected technique: {technique}", "technique" to usedTechnique))
                .setMessage(text)
                .setPositiveButton(android.R.string.ok, null)
                .setNeutralButton(I18n.t("Copy")) { _, _ ->
                    Utils.setClipboard("Decrypted message", text)
                    Utils.showToast(I18n.t("Copied!"))
                }
                .show()
        }
    }

    override fun stop(context: Context) {
        enabled = false
        super.stop(context)
    }

    private fun pickTechnique(context: Context) {
        val picker = NumberPicker(context).apply {
            minValue = 0
            maxValue = TECHNIQUES - 1
            value = technique
            wrapSelectorWheel = true
        }
        AlertDialog.Builder(context)
            .setTitle(I18n.t("Encryption technique"))
            .setView(picker)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                settings.setInt("technique", picker.value)
                Utils.showToast(I18n.t("Encryption technique: {technique}", "technique" to picker.value))
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    // ---- cipher, kept bit for bit identical to Endcord PC ----

    /** mulberry32, the seeded generator Endcord PC uses. */
    private class Rng(private var seed: Int) {
        fun next(): Double {
            seed += 0x6D2B79F5
            var t = (seed xor (seed ushr 15)) * (1 or seed)
            t = t xor (t + (t xor (t ushr 7)) * (61 or t))
            return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL).toDouble() / 4294967296.0
        }

        fun nextByte(): Int = (next() * 256).toInt()
    }

    private fun makeSBox(rng: Rng): IntArray {
        val sbox = IntArray(256) { it }
        for (i in 255 downTo 1) {
            val j = (rng.next() * (i + 1)).toInt()
            val tmp = sbox[i]
            sbox[i] = sbox[j]
            sbox[j] = tmp
        }
        return sbox
    }

    private fun base(technique: Int) = (technique + 1) * 7919 + 31337

    private fun encrypt(plaintext: String, technique: Int): String {
        val raw = ("NC:$plaintext").toByteArray(Charsets.UTF_8)
        val base = base(technique)
        val xorRng = Rng(base)
        val sbox = makeSBox(Rng(base + 65537))
        val noiseRng = Rng(base + 99991)
        val charset = NOISE_CHARSETS[technique % NOISE_CHARSETS.size]

        val out = StringBuilder(MARKER.length + raw.size * 3)
        out.append(MARKER)
        for (byte in raw) {
            val xored = (byte.toInt() and 0xFF) xor xorRng.nextByte()
            val substituted = sbox[xored]
            out.append(HEX[substituted shr 4]).append(HEX[substituted and 0xF])
            if (noiseRng.next() < 0.35) out.append(charset[(noiseRng.next() * charset.length).toInt()])
        }
        return out.toString()
    }

    private fun decrypt(ciphertext: String, technique: Int): String? {
        if (!ciphertext.startsWith(MARKER)) return null
        val stripped = NON_HEX.replace(ciphertext.substring(MARKER.length), "")
        if (stripped.length < 2 || stripped.length % 2 != 0) return null

        val base = base(technique)
        val xorRng = Rng(base)
        val sbox = makeSBox(Rng(base + 65537))
        val inverse = IntArray(256)
        for (i in 0 until 256) inverse[sbox[i]] = i

        val plain = ByteArray(stripped.length / 2)
        for (i in plain.indices) {
            val value = Character.digit(stripped[i * 2], 16) shl 4 or Character.digit(stripped[i * 2 + 1], 16)
            plain[i] = (inverse[value] xor xorRng.nextByte()).toByte()
        }

        val text = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(plain))
                .toString()
        } catch (e: Throwable) {
            return null
        }
        return if (text.startsWith("NC:")) text.substring(3) else null
    }

    /** Tries every technique, returning the text and the technique that worked. */
    private fun autoDecrypt(ciphertext: String): Pair<String, Int>? {
        if (!ciphertext.startsWith(MARKER)) return null
        for (t in 0 until TECHNIQUES) decrypt(ciphertext, t)?.let { return it to t }
        return null
    }

    private companion object {
        const val TECHNIQUES = 400
        const val MARKER = "​‌‍"
        const val HEX = "0123456789abcdef"
        val NON_HEX = Regex("[^0-9a-fA-F]")
        val NOISE_CHARSETS = arrayOf(
            "§¤¦¶†‡•‰™©®",
            "αβγδεζηθικλμ",
            "╔╗╚╝║═╬╠╣╦╩┼",
            "░▒▓█▄▀▐▌◆◇○●",
            "∀∂∃∅∆∇∈∏∑∞∝√",
            "①②③④⑤⑥⑦⑧⑨⑩⑪",
            "ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀ",
            "♠♣♦♥♤♧♢♡★☆✦",
            "♈♉♊♋♌♍♎♏♐♑♒♓",
            "☀☁☂☃❿❀❁❂❃❄❅",
            "⚀⚁⚂⚃⚄⚅◐◑◒◓◔",
            "▲△▴▵▶▷▸▹►▻▼▽",
            "⊕⊖⊗⊘⊙⊚⊛⊜⊝⊞⊟",
            "←→↑↓↔↕↖↗↘↙↚↛",
            "⌐¬√∛∜∝∞∟∠∡∢∣",
            "₠₡₢₣₤₥₦₧₨₩₪₫",
            "♩♪♫♬♭♮♯◊♦◈◇",
            "≈≉≊≋≌≍≎≏≐≑≒≓",
            "⊛⊕⊗⊘⊙⊚⊜⊝⊞⊟⟐",
            "✕✖✗✘✙✚✛✜✝✞✟",
            "☰☱☲☳☴☵☶☷⚊⚋⚌",
        )
    }
}
