/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.injector

import java.util.Locale

/**
 * The few messages the injector shows itself. It runs before the core (and its translations) is loaded,
 * so it carries its own copies in Endcord's five languages, picked from the system language.
 */
internal object Strings {
    enum class Key {
        STARTUP_FAILED,
        CORE_START_FAILED,
        CUSTOM_CORE_DISABLED,
        NEEDS_ALL_FILES_ACCESS,
        NEEDS_STORAGE,
        BASE_OUTDATED,
        DOWNLOAD_FAILED,
    }

    private val tables: Map<String, Map<Key, String>> = mapOf(
        "en" to mapOf(
            Key.STARTUP_FAILED to "Failed to run the Endcord injector",
            Key.CORE_START_FAILED to "Failed to start Endcord!",
            Key.CUSTOM_CORE_DISABLED to "Disabled loading the custom core!",
            Key.NEEDS_ALL_FILES_ACCESS to "Endcord needs the 'All files access' permission to use its folder in Internal Storage!",
            Key.NEEDS_STORAGE to "Endcord needs storage permission to use its folder in Internal Storage!",
            Key.BASE_OUTDATED to "Your base Discord is outdated. Please reinstall using Endcord Installer.",
            Key.DOWNLOAD_FAILED to "Failed to download the latest Endcord core! Check your connection and restart the app.",
        ),
        "tr" to mapOf(
            Key.STARTUP_FAILED to "Endcord enjektörü çalıştırılamadı",
            Key.CORE_START_FAILED to "Endcord başlatılamadı!",
            Key.CUSTOM_CORE_DISABLED to "Özel çekirdek yükleme devre dışı bırakıldı!",
            Key.NEEDS_ALL_FILES_ACCESS to "Endcord, Dahili Depolamadaki klasörünü kullanabilmek için 'Tüm dosyalara erişim' iznine ihtiyaç duyuyor!",
            Key.NEEDS_STORAGE to "Endcord, Dahili Depolamadaki klasörünü kullanabilmek için depolama iznine ihtiyaç duyuyor!",
            Key.BASE_OUTDATED to "Temel Discord sürümünüz eski. Lütfen Endcord Installer ile yeniden yükleyin.",
            Key.DOWNLOAD_FAILED to "En son Endcord çekirdeği indirilemedi! Bağlantınızı kontrol edip uygulamayı yeniden başlatın.",
        ),
        "ru" to mapOf(
            Key.STARTUP_FAILED to "Не удалось запустить инжектор Endcord",
            Key.CORE_START_FAILED to "Не удалось запустить Endcord!",
            Key.CUSTOM_CORE_DISABLED to "Загрузка пользовательского ядра отключена!",
            Key.NEEDS_ALL_FILES_ACCESS to "Endcord требуется разрешение «Доступ ко всем файлам», чтобы использовать свою папку во внутренней памяти!",
            Key.NEEDS_STORAGE to "Endcord требуется доступ к хранилищу, чтобы использовать свою папку во внутренней памяти!",
            Key.BASE_OUTDATED to "Базовая версия Discord устарела. Переустановите приложение с помощью Endcord Installer.",
            Key.DOWNLOAD_FAILED to "Не удалось загрузить последнее ядро Endcord! Проверьте подключение и перезапустите приложение.",
        ),
        "es" to mapOf(
            Key.STARTUP_FAILED to "No se pudo ejecutar el inyector de Endcord",
            Key.CORE_START_FAILED to "¡No se pudo iniciar Endcord!",
            Key.CUSTOM_CORE_DISABLED to "¡Se desactivó la carga del núcleo personalizado!",
            Key.NEEDS_ALL_FILES_ACCESS to "¡Endcord necesita el permiso de 'Acceso a todos los archivos' para usar su carpeta en el almacenamiento interno!",
            Key.NEEDS_STORAGE to "¡Endcord necesita permiso de almacenamiento para usar su carpeta en el almacenamiento interno!",
            Key.BASE_OUTDATED to "Tu versión base de Discord está desactualizada. Vuelve a instalar con Endcord Installer.",
            Key.DOWNLOAD_FAILED to "¡No se pudo descargar el núcleo más reciente de Endcord! Revisa tu conexión y reinicia la aplicación.",
        ),
        "fr" to mapOf(
            Key.STARTUP_FAILED to "Impossible d'exécuter l'injecteur d'Endcord",
            Key.CORE_START_FAILED to "Impossible de démarrer Endcord !",
            Key.CUSTOM_CORE_DISABLED to "Le chargement du noyau personnalisé a été désactivé !",
            Key.NEEDS_ALL_FILES_ACCESS to "Endcord a besoin de l'autorisation « Accès à tous les fichiers » pour utiliser son dossier dans le stockage interne !",
            Key.NEEDS_STORAGE to "Endcord a besoin de l'autorisation de stockage pour utiliser son dossier dans le stockage interne !",
            Key.BASE_OUTDATED to "Votre version de base de Discord est obsolète. Veuillez réinstaller avec Endcord Installer.",
            Key.DOWNLOAD_FAILED to "Impossible de télécharger le dernier noyau d'Endcord ! Vérifiez votre connexion et redémarrez l'application.",
        ),
    )

    /** Language picked in Endcord's settings, read by the injector when it can access them. */
    @Volatile
    var preferredLanguage: String? = null

    operator fun get(key: Key): String {
        val lang = (preferredLanguage ?: Locale.getDefault().language).lowercase(Locale.ROOT)
        val table = tables.entries.firstOrNull { lang.startsWith(it.key) }?.value ?: tables.getValue("en")
        return table[key] ?: tables.getValue("en").getValue(key)
    }
}
