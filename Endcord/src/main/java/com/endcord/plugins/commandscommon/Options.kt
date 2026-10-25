/*
 * This file is part of Endcord, an Android Discord client mod.
 * Licensed under the Open Software License version 3.0
 */

package com.endcord.plugins.commandscommon

import com.aliucord.Utils
import com.discord.api.commands.ApplicationCommandType
import com.discord.api.commands.CommandChoice
import com.discord.models.commands.ApplicationCommandOption

/** Shorthands for building slash command options. */
internal object Options {
    @JvmStatic
    fun string(name: String, description: String, required: Boolean = false, choices: List<CommandChoice> = emptyList()) =
        option(ApplicationCommandType.STRING, name, description, required, choices)

    @JvmStatic
    fun integer(name: String, description: String, required: Boolean = false, choices: List<CommandChoice> = emptyList()) =
        option(ApplicationCommandType.INTEGER, name, description, required, choices)

    @JvmStatic
    fun bool(name: String, description: String, required: Boolean = false) =
        option(ApplicationCommandType.BOOLEAN, name, description, required)

    @JvmStatic
    fun user(name: String, description: String, required: Boolean = false) =
        option(ApplicationCommandType.USER, name, description, required)

    @JvmStatic
    fun role(name: String, description: String, required: Boolean = false) =
        option(ApplicationCommandType.ROLE, name, description, required)

    @JvmStatic
    fun subcommand(name: String, description: String, options: List<ApplicationCommandOption> = emptyList()) =
        Utils.createCommandOption(ApplicationCommandType.SUBCOMMAND, name, description, subCommandOptions = options)

    /** Choices whose shown name and value are the same. */
    @JvmStatic
    fun choices(vararg values: String): List<CommandChoice> = values.map { Utils.createCommandChoice(it, it) }

    private fun option(
        type: ApplicationCommandType,
        name: String,
        description: String,
        required: Boolean,
        choices: List<CommandChoice> = emptyList(),
    ) = Utils.createCommandOption(type, name, description, required = required, choices = choices)
}
