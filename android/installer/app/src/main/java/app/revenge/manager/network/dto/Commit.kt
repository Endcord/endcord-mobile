package app.revenge.manager.network.dto

import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Commit(
    val sha: String,
    @SerialName("commit") val info: Info,
    @SerialName("html_url") val url: String,
    val author: User?
) {

    @Serializable
    data class Info(
        val message: String,
        val committer: Committer,
        /** The git author, for commits whose email isn't linked to a GitHub account */
        val author: GitAuthor? = null
    )

    @Serializable
    data class Committer(
        val date: Instant
    )

    @Serializable
    data class GitAuthor(
        val name: String? = null
    )

}