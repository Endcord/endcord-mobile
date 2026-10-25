/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon

import com.aliucord.entities.PluginSetting

/** The languages Google Translate supports, by the codes its API uses (the same list as Endcord PC). */
internal object Languages {
    private const val LIST = "af=Afrikaans|sq=Albanian|am=Amharic|ar=Arabic|hy=Armenian|as=Assamese|ay=Aymara|" +
        "az=Azerbaijani|bm=Bambara|eu=Basque|be=Belarusian|bn=Bengali|bho=Bhojpuri|bs=Bosnian|bg=Bulgarian|" +
        "ca=Catalan|ceb=Cebuano|ny=Chichewa|zh-CN=Chinese (Simplified)|zh-TW=Chinese (Traditional)|co=Corsican|" +
        "hr=Croatian|cs=Czech|da=Danish|dv=Dhivehi|doi=Dogri|nl=Dutch|en=English|eo=Esperanto|et=Estonian|ee=Ewe|" +
        "tl=Filipino|fi=Finnish|fr=French|fy=Frisian|gl=Galician|ka=Georgian|de=German|el=Greek|gn=Guarani|" +
        "gu=Gujarati|ht=Haitian Creole|ha=Hausa|haw=Hawaiian|iw=Hebrew|hi=Hindi|hmn=Hmong|hu=Hungarian|" +
        "is=Icelandic|ig=Igbo|ilo=Ilocano|id=Indonesian|ga=Irish|it=Italian|ja=Japanese|jw=Javanese|kn=Kannada|" +
        "kk=Kazakh|km=Khmer|rw=Kinyarwanda|gom=Konkani|ko=Korean|kri=Krio|ku=Kurdish (Kurmanji)|" +
        "ckb=Kurdish (Sorani)|ky=Kyrgyz|lo=Lao|la=Latin|lv=Latvian|ln=Lingala|lt=Lithuanian|lg=Luganda|" +
        "lb=Luxembourgish|mk=Macedonian|mai=Maithili|mg=Malagasy|ms=Malay|ml=Malayalam|mt=Maltese|mi=Maori|" +
        "mr=Marathi|mni-Mtei=Meiteilon (Manipuri)|lus=Mizo|mn=Mongolian|my=Myanmar (Burmese)|ne=Nepali|" +
        "no=Norwegian|or=Odia (Oriya)|om=Oromo|ps=Pashto|fa=Persian|pl=Polish|pt=Portuguese|pa=Punjabi|" +
        "qu=Quechua|ro=Romanian|ru=Russian|sm=Samoan|sa=Sanskrit|gd=Scots Gaelic|nso=Sepedi|sr=Serbian|" +
        "st=Sesotho|sn=Shona|sd=Sindhi|si=Sinhala|sk=Slovak|sl=Slovenian|so=Somali|es=Spanish|su=Sundanese|" +
        "sw=Swahili|sv=Swedish|tg=Tajik|ta=Tamil|tt=Tatar|te=Telugu|th=Thai|ti=Tigrinya|ts=Tsonga|tr=Turkish|" +
        "tk=Turkmen|ak=Twi|uk=Ukrainian|ur=Urdu|ug=Uyghur|uz=Uzbek|vi=Vietnamese|cy=Welsh|xh=Xhosa|yi=Yiddish|" +
        "yo=Yoruba|zu=Zulu"

    /** Language code to English name, sorted by name. */
    @JvmField
    val names: Map<String, String> = LinkedHashMap<String, String>().apply {
        for (entry in LIST.split('|')) {
            val i = entry.indexOf('=')
            put(entry.substring(0, i), entry.substring(i + 1))
        }
    }

    /** The English name of [code], or the code itself when Google returned one we don't know. */
    @JvmStatic
    fun name(code: String): String = names[code] ?: names[code.substringBefore('-')] ?: code

    /** Every language as options of a choice setting, after [first]. */
    @JvmStatic
    fun options(vararg first: PluginSetting.Choice.Option): List<PluginSetting.Choice.Option> {
        val list = ArrayList<PluginSetting.Choice.Option>(names.size + first.size)
        list.addAll(first)
        for ((code, name) in names) list.add(PluginSetting.Choice.Option(code, name))
        return list
    }
}
