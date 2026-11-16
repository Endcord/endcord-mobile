package io.github.revenge.xposed.tweaks

import kotlin.test.Test
import kotlin.test.assertEquals

class ScreenPrivacyTest {
    @Test
    fun `only the three modes are read, anything else is off`() {
        assertEquals(ScreenPrivacy.OFF, ScreenPrivacy.of(null))
        assertEquals(ScreenPrivacy.OFF, ScreenPrivacy.of(""))
        assertEquals(ScreenPrivacy.OFF, ScreenPrivacy.of("ALL"))
        assertEquals(ScreenPrivacy.OFF, ScreenPrivacy.of("secure"))
        assertEquals(ScreenPrivacy.RECENTS, ScreenPrivacy.of("recents"))
        assertEquals(ScreenPrivacy.RECENTS, ScreenPrivacy.of(" recents\n"))
        assertEquals(ScreenPrivacy.ALL, ScreenPrivacy.of("all"))
    }

    @Test
    fun `Android 13 hides the preview alone, older versions need the secure flag`() {
        // (secure flag, previews in the app switcher)
        assertEquals(false to true, screenPrivacyEffect(ScreenPrivacy.OFF, 36))
        assertEquals(false to false, screenPrivacyEffect(ScreenPrivacy.RECENTS, 33))
        assertEquals(true to false, screenPrivacyEffect(ScreenPrivacy.RECENTS, 32))
        assertEquals(true to false, screenPrivacyEffect(ScreenPrivacy.ALL, 36))
        assertEquals(true to false, screenPrivacyEffect(ScreenPrivacy.ALL, 26))
    }
}
