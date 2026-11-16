package io.github.revenge.xposed.tweaks.plugins

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Plugins installed into the app run native code at every start: only a developer's own build of the app takes them */
class InstalledPluginPolicyTest {
    private val before = InstalledPluginPolicy.allowed

    @AfterTest
    fun restore() {
        InstalledPluginPolicy.allowed = before
    }

    @Test
    fun `an ordinary build refuses, saying why`() {
        InstalledPluginPolicy.allowed = false
        val error = assertFailsWith<PluginSystemError> { InstalledPluginPolicy.require("Installing a plugin") }
        assertEquals(PluginErrorCodes.NOT_ALLOWED, error.code)
    }

    @Test
    fun `a developer's own build allows it`() {
        InstalledPluginPolicy.allowed = true
        InstalledPluginPolicy.require("Installing a plugin")
    }
}
