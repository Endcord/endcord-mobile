package app.revenge.manager.utils

import app.revenge.manager.BuildConfig

object Constants {
    val TEAM_MEMBERS = listOf(
        TeamMember("rootpoii", "Endcord", "rootpoii"),
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