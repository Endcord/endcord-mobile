package io.github.revenge.xposed.tweaks.legacy.appearance

import io.github.revenge.xposed.RevengeJson
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class ThemeDataTest {
    private val json = """
        {"id":"endcord:theme/endcord","selected":true,"data":{"spec":2,"name":"Endcord",
         "rawColors":{"NEUTRAL_86":"#10182a"},"semanticColors":{"TEXT_LINK":["#9ccbff","#2d5fc4"]},
         "background":{"url":"data:image/png;base64,AAAA","blur":0,"alpha":1},"fonts":{"x":"y"}}}
    """.trimIndent()

    @Test
    fun `the theme is handed on to the bundle as it was saved, background and all`() {
        val theme = readStoredTheme(json)!!
        assertEquals(RevengeJson.parseToJsonElement(json), theme.json)
        val background = theme.json["data"]!!.jsonObject["background"]!!.jsonObject
        assertEquals("data:image/png;base64,AAAA", background["url"]!!.jsonPrimitive.content)
        assertEquals("#10182a", theme.rawColors["NEUTRAL_86"])
        assertEquals(listOf("#9ccbff", "#2d5fc4"), theme.semanticColors["TEXT_LINK"])
    }

    @Test
    fun `a theme without a background still reads`() {
        val theme = readStoredTheme("""{"id":"https://x/t.json","selected":true,"data":{"spec":2,"name":"T"}}""")!!
        assertNull(theme.json["data"]!!.jsonObject["background"])
        assertEquals(emptyMap(), theme.semanticColors)
    }

    @Test
    fun `a color the loader can't use is skipped, never the whole theme`() {
        // false is "none" in a theme, and what the bundle saves for a color it couldn't read; the rest is any theme's
        val theme = readStoredTheme(
            """{"id":"https://x/t.json","selected":true,"data":{"spec":2,"name":"T",
               "semanticColors":{"A":["#111111",false],"B":"#222222","C":[null,"#333333"],"D":[1,{}]},
               "rawColors":{"R":"#444444","S":false,"T":[1]},"background":"url"}}"""
        )
        assertNotNull(theme)
        assertEquals(listOf("#111111", null), theme.semanticColors["A"])
        assertNull(theme.semanticColors["B"])
        assertEquals(listOf(null, "#333333"), theme.semanticColors["C"])
        assertEquals(listOf(null, null), theme.semanticColors["D"])
        assertEquals(mapOf("R" to "#444444"), theme.rawColors)
    }

    @Test
    fun `a theme without a name or with spec 3 still reads`() {
        assertNotNull(readStoredTheme("""{"id":"https://x/t.json","selected":true,"data":{"spec":3,"main":{"x":1}}}"""))
        assertNotNull(readStoredTheme("""{"id":"https://x/t.json","data":{}}"""))
    }

    @Test
    fun `what isn't a theme is no theme`() {
        for (text in listOf("{}", "null", "[]", "", "{", "\"x\"", """{"id":"","data":{}}""", """{"id":5,"data":{}}""",
            """{"id":"x","data":[]}""", """{"id":"x"}""")) {
            assertNull(readStoredTheme(text), text)
        }
    }
}
