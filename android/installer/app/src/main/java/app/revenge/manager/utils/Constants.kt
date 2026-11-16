package app.revenge.manager.utils

import app.revenge.manager.BuildConfig
import app.revenge.manager.domain.manager.PreferenceManager

object Constants {
    val TEAM_MEMBERS = listOf(
        TeamMember("rootpoi", "Endcord", "rootpoii"),
    )

    /** The Revenge team, whose bundle, loader and manager Endcord for Android is built on. */
    val REVENGE_TEAM = listOf(
        TeamMember("Palm", "Lead developer of Revenge", "palmdevs"),
        TeamMember("oSumAtrIX", "Developer of Revenge", "osumatrix"),
        TeamMember("Nexpid", "Developer of Revenge", "nexpid"),
    )


    val DUMMY_VERSION = DiscordVersion(1, 0, DiscordVersion.Type.STABLE)
}

object Intents {

    object Actions {
        const val INSTALL = "${BuildConfig.APPLICATION_ID}.intents.actions.INSTALL"
    }

    object Extras {
        const val VERSION = "${BuildConfig.APPLICATION_ID}.intents.extras.VERSION"
        /** What the app's own update notification carries ([PreferenceManager.pendingInstallToken]) */
        const val TOKEN = "${BuildConfig.APPLICATION_ID}.intents.extras.TOKEN"
        /** For the update checker's notification: a newer Endcord on the same Discord, not a newer Discord */
        const val ENDCORD_UPDATE = "${BuildConfig.APPLICATION_ID}.intents.extras.ENDCORD_UPDATE"
    }

}

object Channels {
    const val UPDATE = "${BuildConfig.APPLICATION_ID}.notifications.UPDATE"
}

data class TeamMember(
    val name: String,
    val role: String,
    val username: String = name
)