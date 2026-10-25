/*
 * This file is part of Endcord, an Android Discord client mod based on Aliucord.
 * Copyright (c) 2023 Juby210 & Vendicated
 * Licensed under the Open Software License version 3.0
 */

package com.aliucord.api.rn.user

import com.discord.api.user.UserProfile

@Suppress("unused")
class RNUserProfile(
    val guildMemberProfile: UserProfileData?,
    val userProfile: UserProfileData?,
    val badges: List<ProfileBadge>?,
    val private: Boolean?,
) : UserProfile()
