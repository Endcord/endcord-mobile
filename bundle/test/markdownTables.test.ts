// MarkdownTables reads other people's messages as they arrive and whenever a channel loads: tables still look as they
// did, and nothing anyone sends can hold the app up or blow a message up to megabytes
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

mock.module(SRC + "plugins/hooks.tsx", () => ({ displayName: () => "", getChannel: () => null, getUser: () => null }));
const { renderTables } = await import(SRC + "plugins/shared/channels.ts");

describe("tables", () => {
    test("a table becomes aligned monospace text, each column as its alignment says", () => {
        const input = ["Results:", "| Name | Score | Rank |", "|:-----|------:|:----:|", "| ann | 7 | 1 |", "| bo | 12 | 2 |", "done"].join("\n");
        expect(renderTables(input)).toBe([
            "Results:",
            "```",
            "Name │ Score │ Rank",
            "─────┼───────┼─────",
            "ann  │     7 │  1  ",
            "bo   │    12 │  2  ",
            "```",
            "done",
        ].join("\n"));
    });

    test("without pipes at the ends of the separator, and with spaces around it", () => {
        expect(renderTables("| a | b |\n  --- | ---  \n| 1 | 2 |")).toBe("```\na │ b\n──┼──\n1 │ 2\n```");
    });

    test("what isn't a table, or is in a code block, stays", () => {
        for (const text of ["no table here", "| a |\n| b |", "| a |\n|-|", "```\n| a |\n|---|\n```", "| a |\n| --x |"]) {
            expect(renderTables(text)).toBe(text);
        }
    });
});

describe("what someone could send", () => {
    test("separators full of spaces don't take long, at any length a message can have", () => {
        for (const [a, b] of [[600, 1390], [1300, 2690]]) {
            const message = `|a|\n${" ".repeat(a)}--${" ".repeat(b)}x`;
            const started = performance.now();
            expect(renderTables(message)).toBe(message);
            expect(performance.now() - started).toBeLessThan(50);
        }
    });

    test("rows full of pipes and spaces don't either", () => {
        const message = `|a|\n|--|\n${"| ".repeat(1990)}x`;
        const started = performance.now();
        renderTables(message);
        expect(performance.now() - started).toBeLessThan(50);
    });

    test("a table that would grow to megabytes once padded stays as it was sent", () => {
        const message = `|${"h".repeat(1500)}|\n|--|\n${"||\n".repeat(800)}`;
        expect(renderTables(message)).toBe(message);
        const wide = `| ${"a".repeat(400)} | b |\n|--|--|\n${"| x | y |\n".repeat(30)}`;
        expect(renderTables(wide)).toBe(wide);
    });
});
