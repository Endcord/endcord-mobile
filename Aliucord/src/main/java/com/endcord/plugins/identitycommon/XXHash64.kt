/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.identitycommon

/**
 * XXH64 with seed 0, the hash Endcord PC's IrcColors takes of a user id (`@intrnl/xxhash64` over the UTF-8 bytes),
 * so both clients give a user the same color.
 */
internal object XXHash64 {
    private const val P1 = -0x61C8864E7A143579L // 0x9E3779B185EBCA87
    private const val P2 = -0x3D4D51C2D82B14B1L // 0xC2B2AE3D27D4EB4F
    private const val P3 = 0x165667B19E3779F9L
    private const val P4 = -0x7A1435883D4D519DL // 0x85EBCA77C2B2AE63
    private const val P5 = 0x27D4EB2F165667C5L

    fun hash(text: String): Long = hash(text.toByteArray(Charsets.UTF_8))

    fun hash(input: ByteArray): Long {
        val len = input.size
        var i = 0
        var h: Long
        if (len >= 32) {
            var v1 = P1 + P2
            var v2 = P2
            var v3 = 0L
            var v4 = -P1
            while (i <= len - 32) {
                v1 = round(v1, long(input, i)); i += 8
                v2 = round(v2, long(input, i)); i += 8
                v3 = round(v3, long(input, i)); i += 8
                v4 = round(v4, long(input, i)); i += 8
            }
            h = java.lang.Long.rotateLeft(v1, 1) + java.lang.Long.rotateLeft(v2, 7) +
                java.lang.Long.rotateLeft(v3, 12) + java.lang.Long.rotateLeft(v4, 18)
            h = merge(h, v1)
            h = merge(h, v2)
            h = merge(h, v3)
            h = merge(h, v4)
        } else {
            h = P5
        }
        h += len.toLong()

        while (i <= len - 8) {
            h = h xor round(0, long(input, i))
            h = java.lang.Long.rotateLeft(h, 27) * P1 + P4
            i += 8
        }
        if (i <= len - 4) {
            h = h xor (int(input, i) * P1)
            h = java.lang.Long.rotateLeft(h, 23) * P2 + P3
            i += 4
        }
        while (i < len) {
            h = h xor ((input[i].toLong() and 0xFF) * P5)
            h = java.lang.Long.rotateLeft(h, 11) * P1
            i++
        }

        h = h xor (h ushr 33)
        h *= P2
        h = h xor (h ushr 29)
        h *= P3
        h = h xor (h ushr 32)
        return h
    }

    /** [value] read as an unsigned 64 bit number, modulo [divisor] (which must be even and positive). */
    fun unsignedMod(value: Long, divisor: Int): Int {
        if (value >= 0) return (value % divisor).toInt()
        val half = (value ushr 1) % (divisor / 2)
        return ((half * 2 + (value and 1)) % divisor).toInt()
    }

    private fun round(acc: Long, input: Long): Long = java.lang.Long.rotateLeft(acc + input * P2, 31) * P1

    private fun merge(acc: Long, v: Long): Long = (acc xor round(0, v)) * P1 + P4

    private fun long(b: ByteArray, i: Int): Long {
        var r = 0L
        for (k in 7 downTo 0) r = (r shl 8) or (b[i + k].toLong() and 0xFF)
        return r
    }

    private fun int(b: ByteArray, i: Int): Long {
        var r = 0L
        for (k in 3 downTo 0) r = (r shl 8) or (b[i + k].toLong() and 0xFF)
        return r
    }
}
