import { scrub } from "@lib/utils/redact";
import { findByNameLazy } from "@metro/wrappers";

type LoggerFunction = (...messages: any[]) => void;
export interface Logger {
    log: LoggerFunction;
    info: LoggerFunction;
    warn: LoggerFunction;
    error: LoggerFunction;
    time: LoggerFunction;
    trace: LoggerFunction;
    verbose: LoggerFunction;
}

export const LoggerClass = findByNameLazy("Logger");

const LEVELS = ["log", "info", "warn", "error", "time", "trace", "verbose"] as const;

/**
 * Discord's logger, with tokens, API keys and passwords taken out of what's logged, as Endcord PC's logger does: these
 * logs end up in Discord's log files and in what people paste into support channels
 */
export function createLogger(name: string): Logger {
    const base = new LoggerClass(name);
    // Anything else Discord's logger has still works, from the logger itself
    const logger = Object.create(base);
    for (const level of LEVELS) {
        if (typeof base[level] === "function") logger[level] = (...args: unknown[]) => base[level](...args.map(scrub));
    }
    return logger;
}

export const logger: Logger = createLogger("Endcord");
