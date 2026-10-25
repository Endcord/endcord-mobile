/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.wellbeing;

import com.discord.api.presence.ClientStatus;
import com.discord.restapi.RestAPIParams;

/** RestAPIParams.UserSettings.Companion has no Kotlin metadata, so Kotlin can't call it. */
final class StatusParams {
    private StatusParams() {}

    static RestAPIParams.UserSettings withStatus(ClientStatus status) {
        return RestAPIParams.UserSettings.Companion.createWithStatus(status);
    }
}
