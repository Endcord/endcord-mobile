// Copyright (c) 2026 rootpoi and contributors
package app.revenge.manager.installer.session

import kotlinx.coroutines.CompletableDeferred
import java.util.concurrent.ConcurrentHashMap

/**
 * What Android answered for the install sessions this process committed, handed from [InstallService] to the
 * [SessionInstaller] waiting on it. A commit only starts an install: the user may still cancel it, or Android refuse it,
 * and the installer shows it done only once Android says so.
 */
internal object InstallResults {
    data class Result(val status: Int, val message: String?)

    private val pending = ConcurrentHashMap<Int, CompletableDeferred<Result>>()

    /** Waits for [sessionId]'s answer; called before the session is committed, so an early answer isn't missed */
    fun expect(sessionId: Int): CompletableDeferred<Result> =
        CompletableDeferred<Result>().also { pending[sessionId] = it }

    /** Hands [sessionId]'s final answer to whoever waits for it; an answer nobody waits for is dropped */
    fun complete(sessionId: Int, status: Int, message: String?) {
        pending.remove(sessionId)?.complete(Result(status, message))
    }

    fun forget(sessionId: Int) {
        pending.remove(sessionId)
    }
}
