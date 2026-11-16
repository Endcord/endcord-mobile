// @ts-nocheck
import chalk from "chalk";
import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import http from "http";
import os from "os";
import path from "path";
import readline from "readline";
import yargs from "yargs-parser";

import { forceStopAppFromADB, getPackageName, isADBAvailableAndAppInstalled, restartAppFromADB } from "./adb.mjs";
import { buildBundle } from "./build.mjs";
import { printBuildSuccess } from "./util.mjs";

const args = yargs(process.argv.slice(2));

/** What the bundle is built from: a change to any of these makes the next request rebuild */
const SOURCES = ["src", "shims", "assets", "package.json"];

/** Every source file's path, size and modification time: changes when (and only when) a source does */
async function sourceStamp() {
    const parts = [];
    async function walk(entry) {
        const info = await stat(entry).catch(() => null);
        if (!info) return;
        if (info.isDirectory()) {
            for (const name of (await readdir(entry)).sort()) await walk(path.join(entry, name));
        } else {
            parts.push(`${entry}:${info.size}:${info.mtimeMs}`);
        }
    }
    for (const source of SOURCES) await walk(source);
    return createHash("sha256").update(parts.join("\n")).digest("hex");
}

/** The last build and what it was built from. A local build's version is random, so building on every request made
 *  each start of the app a "new" bundle and showed the update dialog every time */
let lastBuild = null;
let building = null;

async function currentBundle() {
    const stamp = await sourceStamp();
    if (lastBuild?.stamp === stamp) return lastBuild;
    building ??= (async () => {
        try {
            const { config, context, timeTook } = await buildBundle({}, true);
            printBuildSuccess(context.hash, args.production, timeTook);
            const body = await readFile(config.outfile);
            const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
            return (lastBuild = { stamp, body, etag });
        } finally {
            building = null;
        }
    })();
    return building;
}

export function serve(options) {
    // @ts-ignore
    const server = http.createServer(async (req, res) => {
        const { pathname } = new URL(req.url || "/", "http://localhost");
        if (pathname.endsWith(".js")) {
            try {
                const { body, etag } = await currentBundle();
                // The loaders send the ETag of the bundle they have: unchanged, they keep it without a download
                if (req.headers["if-none-match"] === etag) {
                    res.writeHead(304, { ETag: etag });
                    res.end();
                    return;
                }
                res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", ETag: etag });
                res.end(body);
            } catch (e) {
                console.error(e);
                res.writeHead(500);
                res.end();
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    }, options);

    server.listen(args.port ?? 4040);

    console.info(chalk.bold.yellowBright("Serving Revenge bundle, available on:"));

    const netInterfaces = os.networkInterfaces();
    for (const netinterfaces of Object.values(netInterfaces)) {
        for (const details of netinterfaces || []) {
            if (details.family !== "IPv4") continue;
            const port = chalk.green(server.address()?.port.toString());
            console.info(`  http://${details.address}:${port}/endcord.js`);
        }
    }

    return server;
}

const server = serve();

console.log("\nPress Q key or Ctrl+C to exit.");

if (args.adb && isADBAvailableAndAppInstalled()) {
    const packageName = getPackageName();

    console.log(`Press R key to reload Discord ${chalk.bold.blue(`(${packageName})`)}.`);
    console.log(`Press S key to force stop Discord ${chalk.bold.blue(`(${packageName})`)}.`);

    readline.emitKeypressEvents(process.stdin);

    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    process.stdin.on("keypress", (ch, key) => {
        if (!key) return;

        if (key.name === "q" || key.ctrl && key.name === "c") {
            process.exit(0);
        }

        if (key.name === "r") {
            console.info(chalk.yellow(`${chalk.bold("↻ Reloading")} ${packageName}`));
            restartAppFromADB(server.address().port)
                .then(() => console.info(chalk.greenBright(`${chalk.bold("✔ Executed")} reload command`)))
                .catch(e => console.error(e));
        }

        if (key.name === "s") {
            console.info(chalk.yellow(`${chalk.bold("⎊ Force stopping")} ${packageName}`));
            forceStopAppFromADB()
                .then(() => console.info(chalk.greenBright(`${chalk.bold("✔ Executed")} force stop command`)))
                .catch(e => console.error(e));
        }
    });
} else if (args.adb) {
    console.warn("ADB option enabled but failed to connect to device!");
}
