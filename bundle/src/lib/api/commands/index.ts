import { ApplicationCommand, ApplicationCommandInputType, ApplicationCommandType, BunnyApplicationCommand } from "@lib/api/commands/types";
import { after, instead } from "@lib/api/patcher";
import { logger } from "@lib/utils/logger";
import { findByStoreName } from "@metro";
import { commands as commandsModule, messageUtil } from "@metro/common";

let commands: ApplicationCommand[] = [];

/**
 * @internal
 */
export function patchCommands() {
    const unpatch = after("getBuiltInCommands", commandsModule, ([type], res: ApplicationCommand[]) => {
        return [...res, ...commands.filter(c =>
            (type instanceof Array ? type.includes(c.type) : type === c.type)
            && c.__bunny?.shouldHide?.() !== false)
        ];
    });

    // Register core commands
    [
        require("@core/commands/eval"),
        require("@core/commands/debug"),
        require("@core/commands/plugins")
    ].forEach(r => registerCommand(r.default()));

    const unpatchTyped = patchTypedCommands();

    return () => {
        commands = [];
        unpatch();
        unpatchTyped();
    };
}

/** How many commands are registered, for leak checks */
export const registeredCommandCount = () => commands.length;

/** The registered commands themselves, for the self-test to run each one */
export const registeredCommands = (): readonly ApplicationCommand[] => commands;

/** The Endcord command a message is, when it's just "/name" and the command needs nothing more */
function typedCommand(content: unknown) {
    if (typeof content !== "string") return undefined;
    const name = /^\/([\w-]+)$/.exec(content.trim())?.[1]?.toLowerCase();
    return name ? commands.find(c => c.name === name && c.__bunny?.shouldHide?.() !== false && !c.options?.some(o => o.required)) : undefined;
}

/**
 * A command typed out in full and sent without picking it from the suggestions reaches Discord as a plain message,
 * which would post "/hideendcord" in the chat for everyone to see. Endcord's own commands run instead.
 */
function patchTypedCommands() {
    return instead("sendMessage", messageUtil, function (this: any, args, orig) {
        const command = typedCommand(args[1]?.content);
        if (!command) return orig.apply(this, args);
        const channel = findByStoreName("ChannelStore")?.getChannel?.(args[0]);
        const guild = channel?.guild_id ? findByStoreName("GuildStore")?.getGuild?.(channel.guild_id) : undefined;
        try {
            command.execute([], { channel: channel ?? { id: args[0] }, guild });
        } catch (e) {
            logger.error("Failed to execute command", e);
        }
        return Promise.resolve();
    });
}

export function registerCommand(command: BunnyApplicationCommand): () => void {
    // Get built in commands
    let builtInCommands: ApplicationCommand[];
    try {
        builtInCommands = commandsModule.getBuiltInCommands(ApplicationCommandType.CHAT, true, false);
    } catch {
        builtInCommands = commandsModule.getBuiltInCommands(Object.values(ApplicationCommandType), true, false);
    }

    builtInCommands.sort((a: ApplicationCommand, b: ApplicationCommand) => parseInt(b.id!) - parseInt(a.id!));

    const lastCommand = builtInCommands[builtInCommands.length - 1];

    // Override the new command's id to the last command id - 1
    command.id = (parseInt(lastCommand.id!, 10) - 1).toString();

    // Fill optional args
    command.__bunny = {
        shouldHide: command.shouldHide
    };

    command.applicationId ??= "-1";
    command.type ??= ApplicationCommandType.CHAT;
    command.inputType = ApplicationCommandInputType.BUILT_IN;
    command.displayName ??= command.name;
    command.untranslatedName ??= command.name;
    command.displayDescription ??= command.description;
    command.untranslatedDescription ??= command.description;

    if (command.options) for (const opt of command.options) {
        opt.displayName ??= opt.name;
        opt.displayDescription ??= opt.description;
    }

    instead("execute", command, (args, orig) => {
        Promise.resolve(
            orig.apply(command, args)
        ).then(ret => {
            if (ret && typeof ret === "object") {
                messageUtil.sendMessage(args[1].channel.id, ret);
            }
        }).catch(err => {
            logger.error("Failed to execute command", err);
        });
    });

    // Add it to the commands array
    commands.push(command);

    // Return command id so it can be unregistered
    return () => (commands = commands.filter(({ id }) => id !== command.id));
}
