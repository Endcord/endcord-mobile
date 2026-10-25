package com.endcord.installer.ui.screens.iconopts

import android.app.Application
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import cafe.adriel.voyager.core.model.ScreenModel
import cafe.adriel.voyager.core.model.screenModelScope
import com.endcord.installer.BuildConfig
import com.endcord.installer.R
import com.endcord.installer.ui.screens.patchopts.PatchOptions.IconReplacement
import com.endcord.installer.util.*
import dev.zt64.compose.pipette.HsvColor
import java.io.IOException

class IconOptionsModel(
    prefilledOptions: IconReplacement,
    private val application: Application,
) : ScreenModel {
    // ---------- Icon patching mode ---------- //
    var mode by mutableStateOf(IconOptionsMode.Original)
        private set

    fun changeMode(mode: IconOptionsMode) {
        this.mode = mode
    }

    // ---------- Replacement color ---------- //
    var selectedColor by mutableStateOf(HsvColor(IconReplacement.EndcordColor))
        private set

    fun changeSelectedColor(color: HsvColor) {
        selectedColor = color
    }

    private fun initSelectedColor(color: Color) {
        selectedColor = HsvColor(color)
    }

    // ---------- Replacement image ---------- //
    var selectedImage by mutableStateOf<ByteArray?>(null)

    /** Endcord's own icon: the pixel art logo on its night blue background. */
    val endcordIcon: ByteArray by lazy {
        application.resources.openRawResource(R.raw.endcord_app_icon).use { it.readBytes() }
    }

    /** The image that will be used as the icon for the current mode, if the mode uses one. */
    fun previewImage(): ByteArray? = when (mode) {
        IconOptionsMode.Endcord -> endcordIcon
        IconOptionsMode.CustomImage -> selectedImage
        else -> null
    }

    fun changeSelectedImageUri(uri: Uri) = screenModelScope.launchIO {
        try {
            // Check file size first
            val query = application.contentResolver.query(uri, null, null, null, null)
                ?: throw IOException("Failed to query selected image uri")

            val size = query.use { cursor ->
                cursor.moveToFirst()
                cursor.getLong(cursor.getColumnIndexOrThrow(OpenableColumns.SIZE))
            }

            if (size > 1024 * 256) { // 256KiB
                mainThread { application.showToast(R.string.iconopts_failed_image_too_big) }
                return@launchIO
            }

            // Read file bytes
            val bytes = application.contentResolver
                .openInputStream(uri)
                ?.use { it.readBytes() }
                ?: throw IOException("Failed to open input stream")

            mainThread { selectedImage = bytes }
        } catch (t: Throwable) {
            Log.w(BuildConfig.TAG, "Failed to open selected foreground replacement image", t)
            mainThread { application.showToast(R.string.iconopts_failed_image) }
        }
    }

    // ---------- Other ---------- //
    init {
        when (prefilledOptions) {
            is IconReplacement.CustomColor if prefilledOptions.color == IconReplacement.EndcordColor -> {
                changeMode(IconOptionsMode.Endcord)
                initSelectedColor(IconReplacement.EndcordColor)
            }

            is IconReplacement.CustomImage if prefilledOptions.imageBytes.contentEquals(endcordIcon) -> {
                changeMode(IconOptionsMode.Endcord)
            }

            is IconReplacement.CustomColor -> {
                changeMode(IconOptionsMode.CustomColor)
                initSelectedColor(prefilledOptions.color)
            }

            is IconReplacement.CustomImage -> {
                changeMode(IconOptionsMode.CustomImage)
                selectedImage = prefilledOptions.imageBytes
            }

            IconReplacement.Original -> changeMode(IconOptionsMode.Original)
            IconReplacement.OldDiscord -> changeMode(IconOptionsMode.OldDiscord)
        }
    }

    fun generateConfig(): IconReplacement? {
        return when (mode) {
            IconOptionsMode.Original -> IconReplacement.Original
            IconOptionsMode.OldDiscord -> IconReplacement.OldDiscord
            // Adaptive icons are needed for a custom image, older Android versions get Endcord's color instead
            IconOptionsMode.Endcord -> if (Build.VERSION.SDK_INT >= 26) {
                IconReplacement.CustomImage(imageBytes = endcordIcon)
            } else {
                IconReplacement.CustomColor(IconReplacement.EndcordColor)
            }
            IconOptionsMode.CustomColor -> IconReplacement.CustomColor(color = selectedColor.toColor())
            IconOptionsMode.CustomImage -> IconReplacement.CustomImage(
                imageBytes = selectedImage ?: return null
            )
        }
    }
}
