/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.petpet

import java.io.ByteArrayOutputStream
import java.io.OutputStream

/**
 * A minimal animated GIF89a writer: one global palette of up to 255 colours plus a transparent index,
 * frames given as palette indices, looping forever. The LZW step follows the classic GIFCOMPR algorithm.
 */
internal class GifEncoder(private val out: OutputStream, private val width: Int, private val height: Int) {
    /**
     * Writes the header and the global palette. [palette] holds up to 255 `0xRRGGBB` colours; index 255
     * is reserved for transparency.
     */
    fun start(palette: IntArray) {
        out.write("GIF89a".toByteArray(Charsets.US_ASCII))
        writeShort(width)
        writeShort(height)
        out.write(0xF7) // global colour table of 256 entries, 8 bits per channel
        out.write(0) // background colour index
        out.write(0) // no aspect ratio
        for (i in 0 until 256) {
            val c = if (i < palette.size && i != TRANSPARENT) palette[i] else 0
            out.write(c shr 16 and 0xFF)
            out.write(c shr 8 and 0xFF)
            out.write(c and 0xFF)
        }
        // NETSCAPE2.0 extension: loop forever
        out.write(byteArrayOf(0x21, 0xFF.toByte(), 0x0B))
        out.write("NETSCAPE2.0".toByteArray(Charsets.US_ASCII))
        out.write(byteArrayOf(0x03, 0x01, 0x00, 0x00, 0x00))
    }

    /** Writes one frame of `width * height` palette indices, shown for [delayCs] hundredths of a second. */
    fun addFrame(indices: ByteArray, delayCs: Int) {
        // Graphic control extension: restore to background after each frame, index 255 is transparent
        out.write(byteArrayOf(0x21, 0xF9.toByte(), 0x04, ((2 shl 2) or 1).toByte()))
        writeShort(delayCs)
        out.write(TRANSPARENT)
        out.write(0)
        // Image descriptor covering the whole canvas, no local palette
        out.write(0x2C)
        writeShort(0)
        writeShort(0)
        writeShort(width)
        writeShort(height)
        out.write(0)
        out.write(MIN_CODE_SIZE)
        Lzw(indices).encode(out)
    }

    fun finish() {
        out.write(0x3B)
        out.flush()
    }

    private fun writeShort(value: Int) {
        out.write(value and 0xFF)
        out.write(value shr 8 and 0xFF)
    }

    /** LZW compression of one frame into GIF data sub-blocks. */
    private class Lzw(private val pixels: ByteArray) {
        private val htab = IntArray(HSIZE)
        private val codetab = IntArray(HSIZE)
        private val clearCode = 1 shl MIN_CODE_SIZE
        private val eofCode = clearCode + 1
        private val initBits = MIN_CODE_SIZE + 1

        private var nBits = initBits
        private var maxCode = (1 shl nBits) - 1
        private var freeEnt = clearCode + 2
        private var clearFlag = false

        private var accum = 0
        private var accumBits = 0
        private val block = ByteArray(255)
        private var blockSize = 0
        private val data = ByteArrayOutputStream(pixels.size / 2 + 64)

        fun encode(out: OutputStream) {
            htab.fill(-1)
            output(clearCode)
            if (pixels.isNotEmpty()) {
                var ent = pixels[0].toInt() and 0xFF
                var i = 1
                outer@ while (i < pixels.size) {
                    val c = pixels[i++].toInt() and 0xFF
                    val fcode = (c shl MAX_BITS) + ent
                    var h = (c shl HSHIFT) xor ent
                    if (htab[h] == fcode) {
                        ent = codetab[h]
                        continue
                    }
                    if (htab[h] >= 0) {
                        // Secondary probe
                        val disp = if (h == 0) 1 else HSIZE - h
                        do {
                            h -= disp
                            if (h < 0) h += HSIZE
                            if (htab[h] == fcode) {
                                ent = codetab[h]
                                continue@outer
                            }
                        } while (htab[h] >= 0)
                    }
                    output(ent)
                    ent = c
                    if (freeEnt < MAX_CODE) {
                        codetab[h] = freeEnt++
                        htab[h] = fcode
                    } else {
                        htab.fill(-1)
                        freeEnt = clearCode + 2
                        clearFlag = true
                        output(clearCode)
                    }
                }
                output(ent)
            }
            output(eofCode)
            if (accumBits > 0) addByte(accum and 0xFF)
            flushBlock()
            data.write(0) // block terminator
            data.writeTo(out)
        }

        private fun output(code: Int) {
            accum = accum or (code shl accumBits)
            accumBits += nBits
            while (accumBits >= 8) {
                addByte(accum and 0xFF)
                accum = accum ushr 8
                accumBits -= 8
            }
            if (freeEnt > maxCode || clearFlag) {
                if (clearFlag) {
                    nBits = initBits
                    maxCode = (1 shl nBits) - 1
                    clearFlag = false
                } else {
                    nBits++
                    maxCode = if (nBits == MAX_BITS) MAX_CODE else (1 shl nBits) - 1
                }
            }
        }

        private fun addByte(b: Int) {
            block[blockSize++] = b.toByte()
            if (blockSize == 255) flushBlock()
        }

        private fun flushBlock() {
            if (blockSize == 0) return
            data.write(blockSize)
            data.write(block, 0, blockSize)
            blockSize = 0
        }
    }

    companion object {
        /** Palette index used for transparent pixels. */
        const val TRANSPARENT = 255
        private const val MIN_CODE_SIZE = 8
        private const val MAX_BITS = 12
        private const val MAX_CODE = 1 shl MAX_BITS
        private const val HSIZE = 5003
        private const val HSHIFT = 4
    }
}

/**
 * Builds a palette of at most [maxColors] colours for the opaque pixels of [images] by median cut, and maps
 * pixels onto it. Colours are bucketed to 15 bits, which keeps both steps fast.
 */
internal class Palette private constructor(val colors: IntArray) {
    private val cache = IntArray(1 shl 15) { -1 }

    /** The palette index for an opaque `0xAARRGGBB` pixel. */
    fun indexOf(argb: Int): Int {
        val key = key(argb)
        val cached = cache[key]
        if (cached >= 0) return cached
        val r = argb shr 16 and 0xFF
        val g = argb shr 8 and 0xFF
        val b = argb and 0xFF
        var best = 0
        var bestDist = Int.MAX_VALUE
        for (i in colors.indices) {
            val c = colors[i]
            val dr = (c shr 16 and 0xFF) - r
            val dg = (c shr 8 and 0xFF) - g
            val db = (c and 0xFF) - b
            val dist = dr * dr * 2 + dg * dg * 4 + db * db * 3
            if (dist < bestDist) {
                bestDist = dist
                best = i
            }
        }
        cache[key] = best
        return best
    }

    companion object {
        private fun key(argb: Int) = (argb shr 9 and 0x7C00) or (argb shr 6 and 0x3E0) or (argb shr 3 and 0x1F)

        fun build(images: List<IntArray>, maxColors: Int, alphaThreshold: Int): Palette {
            val count = IntArray(1 shl 15)
            val sumR = LongArray(1 shl 15)
            val sumG = LongArray(1 shl 15)
            val sumB = LongArray(1 shl 15)
            for (pixels in images) for (p in pixels) {
                if (p ushr 24 < alphaThreshold) continue
                val k = key(p)
                count[k]++
                sumR[k] += (p shr 16 and 0xFF).toLong()
                sumG[k] += (p shr 8 and 0xFF).toLong()
                sumB[k] += (p and 0xFF).toLong()
            }

            // One entry per used bucket: its average colour and how many pixels it holds
            val buckets = ArrayList<IntArray>()
            for (k in count.indices) {
                val n = count[k]
                if (n == 0) continue
                buckets += intArrayOf((sumR[k] / n).toInt(), (sumG[k] / n).toInt(), (sumB[k] / n).toInt(), n)
            }
            if (buckets.isEmpty()) return Palette(intArrayOf(0))

            val boxes = ArrayList<MutableList<IntArray>>()
            boxes += buckets
            while (boxes.size < maxColors) {
                // Split the box with the widest colour range that can still be split
                var target = -1
                var targetRange = -1
                var targetChannel = 0
                for ((i, box) in boxes.withIndex()) {
                    if (box.size < 2) continue
                    for (ch in 0..2) {
                        var min = 255
                        var max = 0
                        for (e in box) {
                            if (e[ch] < min) min = e[ch]
                            if (e[ch] > max) max = e[ch]
                        }
                        if (max - min > targetRange) {
                            targetRange = max - min
                            target = i
                            targetChannel = ch
                        }
                    }
                }
                if (target < 0 || targetRange <= 0) break

                val box = boxes[target]
                box.sortBy { it[targetChannel] }
                val total = box.sumOf { it[3].toLong() }
                var acc = 0L
                var split = 1
                for ((i, e) in box.withIndex()) {
                    acc += e[3]
                    if (acc * 2 >= total) {
                        split = (i + 1).coerceIn(1, box.size - 1)
                        break
                    }
                }
                boxes[target] = ArrayList(box.subList(0, split))
                boxes += ArrayList(box.subList(split, box.size))
            }

            val colors = IntArray(boxes.size) { i ->
                var r = 0L
                var g = 0L
                var b = 0L
                var n = 0L
                for (e in boxes[i]) {
                    r += e[0].toLong() * e[3]
                    g += e[1].toLong() * e[3]
                    b += e[2].toLong() * e[3]
                    n += e[3]
                }
                ((r / n).toInt() shl 16) or ((g / n).toInt() shl 8) or (b / n).toInt()
            }
            return Palette(colors)
        }
    }
}
