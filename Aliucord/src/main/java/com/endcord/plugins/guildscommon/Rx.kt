/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.guildscommon

import com.aliucord.utils.RxUtils.subscribe
import rx.Observable
import rx.Subscriber
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

internal object Rx {
    /**
     * Blocks until [observable] emits its first value (store observables never complete), at most [timeoutMs].
     * Never call this on the main thread.
     */
    @JvmStatic
    fun <T> first(observable: Observable<T>, timeoutMs: Long = 5000): T? {
        val latch = CountDownLatch(1)
        val result = AtomicReference<T?>()
        val subscriber = object : Subscriber<T>() {
            override fun onCompleted() = latch.countDown()
            override fun onError(e: Throwable) = latch.countDown()
            override fun onNext(value: T) {
                result.compareAndSet(null, value)
                latch.countDown()
            }
        }
        val subscription = observable.subscribe(subscriber)
        try {
            latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        } finally {
            subscription.unsubscribe()
        }
        return result.get()
    }
}
