package io.github.revenge.xposed.tweaks

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.SystemClock
import android.view.animation.Interpolator
import android.view.animation.LinearInterpolator
import android.view.animation.PathInterpolator
import android.widget.TextView
import de.robv.android.xposed.XposedBridge
import io.github.revenge.xposed.api.registerNativeMethod
import io.github.revenge.xposed.hook
import io.github.revenge.xposed.method
import io.github.revenge.xposed.tweak
import java.util.WeakHashMap
import kotlin.math.cos
import kotlin.math.max

/**
 * SmoothType's caret in Discord's message box, like Endcord PC's: it glides to where the cursor goes over the
 * transition delay with the chosen easing, blinks once it has been still for a second, and has its own color.
 *
 * The message box is a native view (DCDChatInput) that offers JS no caret color or position, so the caret is drawn
 * here. The bundle turns it on and sets it with the `endcord.smoothType.configure` bridge method.
 */
private const val CHAT_INPUT_CLASS = "com.discord.chat.input.views.DCDChatInput"
private const val WIDTH_DP = 2f
private const val BLINK_AFTER_MS = 1000L
private const val BLINK_PERIOD_MS = 1000L
/** How often the caret is drawn again while it blinks */
private const val BLINK_FRAME_MS = 40L

private class CaretState {
    var x = 0f
    var top = 0f
    var height = 0f
    var fromX = 0f
    var fromTop = 0f
    var fromHeight = 0f
    var toX = Float.NaN
    var toTop = 0f
    var toHeight = 0f
    var movedAt = 0L
    var shown = false
    /** Whether Discord wants the cursor shown; the view's own is hidden while this caret is drawn */
    var wanted: Boolean? = null
    var hidNative = false
}

private object Caret {
    @Volatile var enabled = false
    @Volatile var color = 0xFFFFFFFF.toInt()
    @Volatile var durationMs = 60L
    @Volatile var interpolator: Interpolator = easing("ease")

    val states = WeakHashMap<TextView, CaretState>()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val rect = RectF()

    /** CSS's timing functions, which Endcord PC's caret transition uses */
    fun easing(name: String): Interpolator = when (name) {
        "linear" -> LinearInterpolator()
        "ease-in" -> PathInterpolator(0.42f, 0f, 1f, 1f)
        "ease-out" -> PathInterpolator(0f, 0f, 0.58f, 1f)
        "ease-in-out" -> PathInterpolator(0.42f, 0f, 0.58f, 1f)
        else -> PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
    }
}

private val setCursorVisible = TextView::class.java.method("setCursorVisible", Boolean::class.javaPrimitiveType)

val smoothCaret by tweak {
    registerNativeMethod("endcord.smoothType.configure") { args ->
        Caret.enabled = args.getOrNull(0) as? Boolean ?: false
        (args.getOrNull(1) as? Number)?.let { Caret.color = 0xFF000000.toInt() or (it.toInt() and 0xFFFFFF) }
        (args.getOrNull(2) as? Number)?.let { Caret.durationMs = it.toLong().coerceIn(0L, 2000L) }
        (args.getOrNull(3) as? String)?.let { Caret.interpolator = Caret.easing(it) }
        synchronized(Caret.states) { Caret.states.keys.toList() }.forEach { it.postInvalidate() }
        null
    }

    // Discord shows and hides the message box's cursor; that is remembered, and the view's own stays hidden while this
    // caret is drawn
    setCursorVisible.hook {
        before {
            val view = thisObject as? TextView ?: return@before
            if (view.javaClass.name != CHAT_INPUT_CLASS) return@before
            stateOf(view).wanted = args[0] as? Boolean ?: true
            if (Caret.enabled) args[0] = false
        }
    }

    TextView::class.java.method("onDraw", Canvas::class.java).hook {
        after {
            val view = thisObject as? TextView ?: return@after
            if (view.javaClass.name != CHAT_INPUT_CLASS) return@after
            val canvas = args[0] as? Canvas ?: return@after
            draw(view, canvas)
        }
    }
}

private fun stateOf(view: TextView) = synchronized(Caret.states) { Caret.states.getOrPut(view) { CaretState() } }

private fun draw(view: TextView, canvas: Canvas) {
    val state = stateOf(view)

    if (!Caret.enabled) {
        if (state.hidNative) {
            XposedBridge.invokeOriginalMethod(setCursorVisible, view, arrayOf(state.wanted ?: true))
            state.hidNative = false
        }
        return
    }
    if (!state.hidNative) {
        if (state.wanted == null) state.wanted = view.isCursorVisible
        XposedBridge.invokeOriginalMethod(setCursorVisible, view, arrayOf(false))
        state.hidNative = true
    }

    val layout = view.layout
    // Like Endcord PC, only while the box has focus, and at the end of the selection
    if (layout == null || !view.isFocused || !view.hasWindowFocus() || state.wanted == false || view.selectionEnd < 0) {
        state.shown = false
        state.toX = Float.NaN
        return
    }

    val offset = view.selectionEnd.coerceAtMost(view.text.length)
    val line = layout.getLineForOffset(offset)
    val x = view.totalPaddingLeft + layout.getPrimaryHorizontal(offset)
    val top = (view.totalPaddingTop + layout.getLineTop(line)).toFloat()
    val height = (layout.getLineBottom(line) - layout.getLineTop(line)).toFloat()
    val now = SystemClock.uptimeMillis()

    if (state.toX.isNaN() || !state.shown) {
        // Appears where it is, without gliding in from where it last was
        state.x = x; state.top = top; state.height = height
        state.fromX = x; state.fromTop = top; state.fromHeight = height
        state.toX = x; state.toTop = top; state.toHeight = height
        state.movedAt = now
        state.shown = true
    } else if (x != state.toX || top != state.toTop || height != state.toHeight) {
        state.fromX = state.x; state.fromTop = state.top; state.fromHeight = state.height
        state.toX = x; state.toTop = top; state.toHeight = height
        state.movedAt = now
    }

    val elapsed = now - state.movedAt
    val duration = Caret.durationMs
    val progress = if (duration <= 0L) 1f else (elapsed.toFloat() / duration).coerceIn(0f, 1f)
    val eased = Caret.interpolator.getInterpolation(progress)
    state.x = state.fromX + (state.toX - state.fromX) * eased
    state.top = state.fromTop + (state.toTop - state.fromTop) * eased
    state.height = state.fromHeight + (state.toHeight - state.fromHeight) * eased

    // Solid while it moves and for a second after, then fades in and out once a second
    val opacity = if (elapsed < duration + BLINK_AFTER_MS) 1f else {
        val phase = ((elapsed - duration - BLINK_AFTER_MS) % BLINK_PERIOD_MS).toFloat() / BLINK_PERIOD_MS
        ((1 + cos(phase * 2 * Math.PI)) / 2).toFloat()
    }

    val density = view.resources.displayMetrics.density
    val width = max(1f, WIDTH_DP * density)
    Caret.paint.color = Caret.color
    Caret.paint.alpha = (255 * opacity).toInt()
    Caret.rect.set(state.x, state.top, state.x + width, state.top + state.height)
    canvas.drawRoundRect(Caret.rect, width, width, Caret.paint)

    // Keeps drawing while it glides or blinks
    if (progress < 1f) view.postInvalidateOnAnimation() else view.postInvalidateDelayed(BLINK_FRAME_MS)
}
