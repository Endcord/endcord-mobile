/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.translatecommon;

import com.discord.stores.StorePendingReplies;
import com.discord.stores.StoreStream;

/** Stores that are only exposed on {@code StoreStream.Companion}, whose Kotlin metadata is stripped. */
final class StoreAccess {
    private StoreAccess() {}

    static StorePendingReplies pendingReplies() {
        return StoreStream.Companion.getPendingReplies();
    }
}
