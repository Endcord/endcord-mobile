// Endcord PC's plugins for writing and sending messages, attachments and files, on mobile: their pure logic
import { describe, expect, mock, test } from "bun:test";

import { SRC } from "./src";

const drafts = await import(SRC + "plugins/draftList/drafts.ts");

describe("DraftList", () => {
    test("lists drafts with text, in chats that exist, newest first", () => {
        const raw = [
            { channelId: "1", draft: "hello", timestamp: 10 },
            { channelId: "2", draft: "   \n ", timestamp: 30 },
            { channelId: "3", draft: "gone", timestamp: 40 },
            { channelId: "4", draft: "newer", timestamp: 20 },
            { channelId: 5, draft: "bad id", timestamp: 50 },
            null,
            "junk",
            { channelId: "6", draft: 7 },
            { channelId: "7", draft: "no time" },
        ];
        const listed = drafts.unsentDrafts(raw, (id: string) => id !== "3");
        expect(listed.map((d: any) => d.channelId)).toEqual(["4", "1", "7"]);
        expect(listed[2].timestamp).toBe(0);
        expect(drafts.unsentDrafts(undefined, () => true)).toEqual([]);
        expect(drafts.unsentDrafts({ length: 3 }, () => true)).toEqual([]);
    });

    test("keeps at most MAX_DRAFTS", () => {
        const raw = Array.from({ length: drafts.MAX_DRAFTS + 50 }, (_, i) => ({ channelId: String(i), draft: "x", timestamp: i }));
        expect(drafts.unsentDrafts(raw, () => true).length).toBe(drafts.MAX_DRAFTS);
    });

    test("previews on one line without cutting an emoji", () => {
        expect(drafts.draftPreview("a\n\n b\tc")).toBe("a b c");
        expect(drafts.draftPreview("😀".repeat(10), 5)).toBe("😀😀😀😀…");
        expect(drafts.draftPreview("x".repeat(100000), 10)).toBe(`${"x".repeat(9)}…`);
    });
});

const keep = await import(SRC + "plugins/noDraftLengthLimit/keep.ts");

describe("NoDraftLengthLimit", () => {
    const long = "a".repeat(5000) + "END";
    const cut = long.slice(0, 4500);

    test("keeps long drafts whole and forgets short or cleared ones", () => {
        let kept = keep.rememberDraft({}, "1:0", long);
        expect(kept["1:0"]).toBe(long);
        kept = keep.rememberDraft(kept, "1:0", "short");
        expect(kept["1:0"]).toBeUndefined();
        kept = keep.rememberDraft(kept, "2:0", long);
        kept = keep.rememberDraft(kept, "2:0", "");
        expect(Object.keys(kept)).toEqual([]);
        expect(keep.rememberDraft({}, "3:0", 12345)).toEqual({});
        expect(keep.rememberDraft({}, "4:0", "x".repeat(keep.MAX_KEPT_LENGTH + 10))["4:0"].length).toBe(keep.MAX_KEPT_LENGTH);
    });

    test("drops the oldest past MAX_KEPT, and a rewritten draft counts as new", () => {
        let kept: Record<string, string> = {};
        for (let i = 0; i < keep.MAX_KEPT; i++) kept = keep.rememberDraft(kept, `${i}:0`, long);
        kept = keep.rememberDraft(kept, "0:0", long + "!");
        kept = keep.rememberDraft(kept, "new:0", long);
        expect(Object.keys(kept).length).toBe(keep.MAX_KEPT);
        expect(kept["1:0"]).toBeUndefined();
        expect(kept["0:0"]).toBe(long + "!");
        expect(kept["new:0"]).toBe(long);
    });

    test("gives the whole text back only for what Discord cut", () => {
        expect(keep.fullDraft(cut, long)).toBe(long);
        // DraftStore's text is newer when it isn't the start of what was kept
        expect(keep.fullDraft("b" + cut.slice(1), long)).toBe("b" + cut.slice(1));
        expect(keep.fullDraft("", long)).toBe("");
        expect(keep.fullDraft("short", "short and more")).toBe("short");
        expect(keep.fullDraft(long, long)).toBe(long);
        expect(keep.fullDraft(cut, undefined)).toBe(cut);
        expect(keep.fullDraft(undefined, long)).toBeUndefined();
    });

    test("keys drafts by chat and kind", () => {
        expect(keep.draftKey("1", 2)).toBe("1:2");
        expect(keep.draftKey("1", undefined)).toBe("1:0");
        expect(keep.draftKey("1", "3")).toBe("1:0");
    });
});

const counter = await import(SRC + "plugins/characterCounter/count.ts");

describe("CharacterCounter", () => {
    test("knows the limit with and without Nitro", () => {
        expect(counter.messageLimit(2)).toBe(4000);
        for (const type of [0, 1, 3, undefined, null]) expect(counter.messageLimit(type)).toBe(2000);
    });

    test("colours the counter like Endcord PC", () => {
        expect(counter.counterLevel(999, 2000)).toBe("normal");
        expect(counter.counterLevel(1000, 2000)).toBe("yellow");
        expect(counter.counterLevel(1500, 2000)).toBe("orange");
        expect(counter.counterLevel(1799, 2000)).toBe("orange");
        expect(counter.counterLevel(1800, 2000)).toBe("red");
        expect(counter.counterLevel(5000, 2000)).toBe("red");
    });
});

// ChatGPTWriting leaves code alone with hooks' outsideCode; hooks itself needs Discord, so its outsideCode is given
// here, the same as in hooks.tsx
mock.module(SRC + "plugins/hooks.tsx", () => ({
    outsideCode: (content: string, fn: (text: string) => string) =>
        content.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, i) => i % 2 ? part : fn(part)).join(""),
}));
const writing = await import(SRC + "plugins/chatgptWriting/writing.ts");

describe("ChatGPTWriting", () => {
    test("finds the tone the way Endcord PC does, first match wins", () => {
        expect(writing.detectTone("I am so happy today")).toBe("happy");
        expect(writing.detectTone("I love you")).toBe("happy");
        expect(writing.detectTone("why is this broken")).toBe("confused");
        expect(writing.detectTone("going to bed")).toBe("sleepy");
        expect(writing.detectTone("hello there")).toBe("default");
    });

    test("autocorrects without breaking right words or lines", () => {
        expect(writing.autocorrect("teh cat dont care")).toBe("The cat don't care.");
        expect(writing.autocorrect("Dont go")).toBe("Don't go.");
        expect(writing.autocorrect("we were there")).toBe("We were there.");
        expect(writing.autocorrect("im gonna go")).toBe("I'm going to go.");
        expect(writing.autocorrect("done. next one!")).toBe("Done. Next one!");
        expect(writing.autocorrect("first line.\nsecond line")).toBe("First line.\nSecond line.");
        expect(writing.autocorrect("ok?")).toBe("Ok?");
    });

    test("adds a kaomoji or emoji of the message's tone, and leaves code alone", () => {
        const options = { kaomoji: false, emoji: true, autocorrect: false };
        expect(writing.rewrite("so happy", options, () => 0)).toBe("so happy 😊");
        expect(writing.rewrite("  hi  ", { kaomoji: true, emoji: false, autocorrect: false }, () => 0.99)).toBe("hi ( ˘◡˘ )");
        expect(writing.rewrite("```js\nx\n```", options)).toBeUndefined();
        expect(writing.rewrite("   ", options)).toBeUndefined();
        expect(writing.rewrite("teh end", { kaomoji: false, emoji: false, autocorrect: true })).toBe("The end.");
    });

    test("never corrects code, links or Discord's <...> tokens", () => {
        expect(writing.autocorrect("<:im:123456789012345678> hi")).toBe("<:im:123456789012345678> hi.");
        expect(writing.autocorrect("<a:dont:1> im <@123> <@!4> <@&5> <#6> <t:1700000000:R> </ban user:789>")).toBe("<a:dont:1> I'm <@123> <@!4> <@&5> <#6> <t:1700000000:R> </ban user:789>");
        expect(writing.autocorrect("look https://example.com/dont/thats thats cool")).toBe("Look https://example.com/dont/thats that's cool.");
        expect(writing.autocorrect("see `dont` here, dont")).toBe("See `dont` here, don't.");
        expect(writing.autocorrect("dont `im`")).toBe("Don't `im`");
        expect(writing.autocorrect("https://x.example/im im here")).toBe("https://x.example/im I'm here.");
        expect(writing.autocorrect("im at <https://x.example/dont>")).toBe("I'm at <https://x.example/dont>");
        expect(writing.autocorrect("go to steam://run/dont")).toBe("Go to steam://run/dont");
        // A sentence after code still starts with a capital
        expect(writing.autocorrect("`a`. next")).toBe("`a`. Next.");
    });

    test("a message that's only a link (a sticker, a GIF) is sent as it is", () => {
        const all = { kaomoji: true, emoji: true, autocorrect: true };
        expect(writing.rewrite("https://stickershop.line-scdn.net/stickershop/v1/sticker/1/android/sticker.png", all)).toBeUndefined();
        expect(writing.rewrite("  <https://example.com/dont>  ", all)).toBeUndefined();
        expect(writing.rewrite("https://example.com/a b", { ...all, kaomoji: false, emoji: false })).toBe("https://example.com/a b.");
    });

    test("a long message takes no time", () => {
        const text = `${"a. ".repeat(3000)}${" ".repeat(3000)}1 why`;
        const started = performance.now();
        writing.rewrite(text, { kaomoji: true, emoji: true, autocorrect: true });
        expect(performance.now() - started).toBeLessThan(100);
    });
});

const stickers = await import(SRC + "plugins/stickerPaste/pending.ts");

describe("StickerPaste", () => {
    test("holds up to 3 different stickers per message", () => {
        expect(stickers.addStickers([], ["1", "2"])).toEqual({ stickers: ["1", "2"], full: false });
        expect(stickers.addStickers(["1", "2"], ["2", "3"])).toEqual({ stickers: ["1", "2", "3"], full: false });
        expect(stickers.addStickers(["1", "2", "3"], ["4"])).toEqual({ stickers: ["1", "2", "3"], full: true });
        expect(stickers.addStickers([], ["x", 5, "", "12345678901234567890123", "__proto__"])).toEqual({ stickers: [], full: false });
        expect(stickers.addStickers(["1"], undefined)).toEqual({ stickers: ["1"], full: false });
    });

    test("tells a sticker sent with text from one picked on its own", () => {
        expect(stickers.hasText("hi")).toBe(true);
        expect(stickers.hasText("  ")).toBe(false);
        expect(stickers.hasText(undefined)).toBe(false);
    });
});

const files = await import(SRC + "plugins/fileUpload/files.ts");

describe("file names and sizes", () => {
    test("file names are safe in headers, links and paths", () => {
        expect(files.safeFileName("photo.png")).toBe("photo.png");
        expect(files.safeFileName("../../etc/passwd")).toBe("passwd");
        expect(files.safeFileName("C:\\Users\\me\\a.txt")).toBe("a.txt");
        expect(files.safeFileName("a\"b\r\nc.mp4")).toBe("abc.mp4");
        expect(files.safeFileName("evil\u202Egnp.exe")).toBe("evilgnp.exe");
        expect(files.safeFileName("...hidden")).toBe("hidden");
        expect(files.safeFileName("", "x")).toBe("x");
        expect(files.safeFileName(undefined)).toBe("file");
        const long = files.safeFileName(`${"n".repeat(500)}.webm`);
        expect(long.length).toBe(files.MAX_NAME_LENGTH);
        expect(long.endsWith(".webm")).toBe(true);
    });

    test("types and extensions", () => {
        expect(files.extensionOf("a.tar.GZ")).toBe("gz");
        expect(files.extensionOf("noext")).toBe("");
        expect(files.extensionOf(".bashrc")).toBe("");
        expect(files.mimeFromName("x.MP4")).toBe("video/mp4");
        expect(files.mimeFromName("x.unknown")).toBe("application/octet-stream");
        expect(files.mimeFromName("x.png", "image/webp")).toBe("image/webp");
        expect(files.mimeFromName("x.png", "bad type\r\n")).toBe("image/png");
    });

    test("sizes and hosts read well", () => {
        expect(files.formatBytes(0)).toBe("0 B");
        expect(files.formatBytes(512)).toBe("512 B");
        expect(files.formatBytes(1536)).toBe("1.5 KB");
        expect(files.formatBytes(25 * 1048576)).toBe("25 MB");
        expect(files.hostOf("https://user:key@files.example.com:8443/a?token=x")).toBe("files.example.com");
        expect(files.hostOf("not a url")).toBe("?");
    });
});

const attachRules = await import(SRC + "plugins/addAttachments/rules.ts");

describe("AddAttachments", () => {
    const mine = { id: "1234567890123456789", author: { id: "me" }, type: 0, flags: 0, attachments: [], state: "SENT" };

    test("only your own sent messages with room left", () => {
        expect(attachRules.canAddAttachments(mine, "me")).toBe(true);
        expect(attachRules.canAddAttachments({ ...mine, type: 19 }, "me")).toBe(true);
        expect(attachRules.canAddAttachments(mine, "someone")).toBe(false);
        expect(attachRules.canAddAttachments(mine, undefined)).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, type: 7 }, "me")).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, flags: 1 << 13 }, "me")).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, state: "SENDING" }, "me")).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, id: "local-1" }, "me")).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, messageReference: { type: 1 } }, "me")).toBe(false);
        expect(attachRules.canAddAttachments({ ...mine, attachments: Array(10).fill({}) }, "me")).toBe(false);
        expect(attachRules.room(7)).toBe(3);
        expect(attachRules.room(12)).toBe(0);
    });
});

const order = await import(SRC + "plugins/reorderAttachments/order.ts");

describe("ReorderAttachments", () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" }, thumb = { id: "t", isThumbnail: true };

    test("moves the shown files and keeps hidden entries in their places", () => {
        expect(order.moveUpload([a, b, c], 0, 2)).toEqual([b, c, a]);
        expect(order.moveUpload([a, b, c], 2, 0)).toEqual([c, a, b]);
        expect(order.moveUpload([a, thumb, b, c], 0, 1)).toEqual([b, thumb, a, c]);
        expect(order.moveUpload([a, thumb, b, c], 2, 0)).toEqual([c, thumb, a, b]);
    });

    test("a move out of range leaves the order as it was", () => {
        const list = [a, b];
        for (const [from, to] of [[0, 0], [-1, 1], [0, 5], [3, 0]]) {
            const moved = order.moveUpload(list, from, to);
            expect(moved).toEqual(list);
            expect(moved).not.toBe(list);
        }
    });
});

const sigv4 = await import(SRC + "plugins/fileUpload/sigv4.ts");
const { createHash, createHmac } = await import("node:crypto");

describe("FileUpload: AWS Signature Version 4", () => {
    const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    test("derives the signing key of AWS's example", () => {
        // AWS General Reference, "Examples of how to derive a signing key for Signature Version 4"
        const key = sigv4.signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam");
        expect(Buffer.from(key).toString("hex")).toBe("f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
    });

    test("signs AWS's test suite request get-vanilla", () => {
        const signed = sigv4.sign({
            method: "GET",
            path: "/",
            headers: { Host: "example.amazonaws.com", "X-Amz-Date": "20150830T123600Z" },
            payloadHash: EMPTY_HASH,
        }, { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "service" });
        expect(signed.canonicalRequest).toBe(`GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\n${EMPTY_HASH}`);
        expect(signed.stringToSign).toBe("AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\nbb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63");
        expect(signed.signature).toBe("5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
        expect(signed.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31");
    });

    const s3 = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "s3" };

    test("signs the S3 documentation's GET Object example", () => {
        // Amazon S3 API Reference, "Signature Calculations for the Authorization Header", GET Object
        const signed = sigv4.sign({
            method: "GET",
            path: sigv4.encodePath("test.txt"),
            headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": EMPTY_HASH, "x-amz-date": "20130524T000000Z" },
            payloadHash: EMPTY_HASH,
        }, s3);
        expect(signed.stringToSign.split("\n")[3]).toBe("7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972");
        expect(signed.signature).toBe("f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    });

    test("signs the S3 documentation's PUT Object example", () => {
        const payload = createHash("sha256").update("Welcome to Amazon S3.").digest("hex");
        expect(payload).toBe("44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
        const signed = sigv4.sign({
            method: "PUT",
            path: sigv4.encodePath("test$file.text"),
            headers: {
                host: "examplebucket.s3.amazonaws.com",
                date: "Fri, 24 May 2013 00:00:00 GMT",
                "x-amz-date": "20130524T000000Z",
                "x-amz-storage-class": "REDUCED_REDUNDANCY",
                "x-amz-content-sha256": payload,
            },
            payloadHash: payload,
        }, s3);
        expect(signed.canonicalRequest.split("\n")[1]).toBe("/test%24file.text");
        expect(signed.stringToSign.split("\n")[3]).toBe("9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d");
        expect(signed.signature).toBe("98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
    });

    test("an UNSIGNED-PAYLOAD upload signs like a reference implementation", () => {
        // The same steps with Node's crypto, for requests like the ones FileUpload makes
        const reference = (secret: string, date: string, region: string, canonical: string) => {
            const h = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
            const key = h(h(h(h(`AWS4${secret}`, date.slice(0, 8)), region), "s3"), "aws4_request");
            const toSign = ["AWS4-HMAC-SHA256", date, `${date.slice(0, 8)}/${region}/s3/aws4_request`, createHash("sha256").update(canonical).digest("hex")].join("\n");
            return createHmac("sha256", key).update(toSign).digest("hex");
        };
        for (const [region, key, token] of [["auto", "uploads/1700000000000-ab12.png", ""], ["eu-central-1", "a b/ç ö ş.mp4", "FwoGZXIvYXdzEXAMPLE"]]) {
            const date = "20261114T101500Z";
            const headers: Record<string, string> = { "content-type": "image/png", host: "acc.r2.cloudflarestorage.com", "x-amz-content-sha256": sigv4.UNSIGNED_PAYLOAD, "x-amz-date": date };
            if (token) headers["x-amz-security-token"] = token;
            const request = { method: "PUT", path: sigv4.encodePath("bucket", key), headers, payloadHash: sigv4.UNSIGNED_PAYLOAD };
            const signed = sigv4.sign(request, { accessKeyId: "AKID", secretAccessKey: "s3cr3t/key+", region, service: "s3" });
            expect(signed.signature).toBe(reference("s3cr3t/key+", date, region, signed.canonicalRequest));
            expect(signed.canonicalRequest.endsWith("\nUNSIGNED-PAYLOAD")).toBe(true);
        }
    });

    test("encodes paths and dates the way AWS wants", () => {
        expect(sigv4.encodePath("/base/", "my bucket", "a/b(1)*.png")).toBe("/base/my%20bucket/a/b%281%29%2A.png");
        expect(sigv4.encodePath("", "")).toBe("/");
        expect(sigv4.amzDate(new Date(Date.UTC(2013, 4, 24, 0, 0, 0)))).toBe("20130524T000000Z");
        expect(() => sigv4.sign({ method: "GET", path: "/", headers: { host: "x" }, payloadHash: EMPTY_HASH }, s3)).toThrow();
    });
});

mock.module(SRC + "core/i18n/index.ts", () => ({
    t: (text: string, params?: Record<string, unknown>) => text.replace(/\{(\w+)\}/g, (all, key) => params && key in params ? String(params[key]) : all),
    tx: (text: string) => text,
}));
const services = await import(SRC + "plugins/fileUpload/services.ts");
const sharex = await import(SRC + "plugins/fileUpload/sharex.ts");

describe("FileUpload: hosts", () => {
    const base = {
        serviceType: "zipline", serviceUrl: "", ziplineToken: "", folderId: "", nestToken: "", ezHostKey: "", s3Endpoint: "", s3Bucket: "",
        s3Region: "auto", s3AccessKeyId: "", s3SecretAccessKey: "", s3SessionToken: "", s3PublicUrl: "", s3Prefix: "", s3ForcePathStyle: true,
        webdavUrl: "", webdavUsername: "", webdavPassword: "", webdavDirectory: "", sharexConfig: "",
    };
    const file = { name: "clip one.mp4", mime: "video/mp4" };
    const answer = (status: number, text: string, contentType = "application/json") => ({ status, text, contentType });

    test("knows when a host is set up", () => {
        expect(services.isConfigured(base)).toBe(false);
        expect(services.isConfigured({ ...base, serviceUrl: "https://z.example", ziplineToken: "tok" })).toBe(true);
        expect(services.isConfigured({ ...base, serviceType: "0x0" })).toBe(true);
        expect(services.isConfigured({ ...base, serviceType: "nest", nestToken: " " })).toBe(false);
        expect(services.isConfigured({ ...base, serviceType: "s3", s3Endpoint: "https://s3.example", s3Bucket: "b", s3AccessKeyId: "a", s3SecretAccessKey: "s" })).toBe(true);
        expect(services.isConfigured({ ...base, serviceType: "sharex", sharexConfig: "{ bad" })).toBe(false);
        expect(services.isConfigured({ ...base, serviceType: "catbox" })).toBe(false);
    });

    test("Zipline, as Endcord PC sends to it", () => {
        const plan = services.planUpload({ ...base, serviceUrl: "https://Zip.Example.com/", ziplineToken: "tok", folderId: "f1" }, file);
        expect(plan.method).toBe("POST");
        expect(plan.url).toBe("https://zip.example.com/api/upload");
        expect(plan.headers).toEqual({ Authorization: "tok", "x-zipline-folder": "f1" });
        expect(plan.body).toEqual({ kind: "form", field: "file", fields: [] });
        expect(plan.read(answer(200, JSON.stringify({ files: [{ url: "https://zip.example.com/u/a.mp4" }] })))).toBe("https://zip.example.com/u/a.mp4");
        expect(() => plan.read(answer(200, "<html>", "text/html"))).toThrow("not JSON");
        expect(() => plan.read(answer(401, "Unauthorized\nnope"))).toThrow("Upload failed: 401 Unauthorized nope");
        expect(() => plan.read(answer(200, JSON.stringify({ files: [{ url: "javascript:alert(1)" }] })))).toThrow("No URL");
    });

    test("only https addresses that aren't on the phone or its network", () => {
        const zipline = (serviceUrl: string) => () => services.planUpload({ ...base, serviceUrl, ziplineToken: "tok" }, file);
        expect(zipline("http://zip.example.com")).toThrow("https://");
        expect(zipline("https://192.168.1.10")).toThrow("network");
        expect(zipline("https://localhost:3000")).toThrow("network");
        expect(zipline("https://127.1")).toThrow("network");
        expect(zipline("https://user:pw@zip.example.com")).toThrow("user name");
        expect(zipline("https://zip.example.com:443/sub")().url).toBe("https://zip.example.com/sub/api/upload");
    });

    test("Nest, E-Z Host and 0x0.st", () => {
        const nest = services.planUpload({ ...base, serviceType: "nest", nestToken: "n" }, file);
        expect([nest.url, nest.headers.Authorization]).toEqual(["https://nest.rip/api/files/upload", "n"]);
        expect(nest.read(answer(200, JSON.stringify({ fileURL: "https://nest.rip/x" })))).toBe("https://nest.rip/x");
        const ez = services.planUpload({ ...base, serviceType: "ezhost", ezHostKey: "k" }, file);
        expect([ez.url, ez.headers.key]).toEqual(["https://api.e-z.host/files", "k"]);
        expect(ez.read(answer(200, JSON.stringify({ success: true, rawUrl: "https://r.e-z.host/x" })))).toBe("https://r.e-z.host/x");
        expect(() => ez.read(answer(200, JSON.stringify({ success: false, error: "quota" })))).toThrow("quota");
        const zero = services.planUpload({ ...base, serviceType: "0x0" }, file);
        expect([zero.url, zero.read(answer(200, "https://0x0.st/abc.mp4\n", "text/plain"))]).toEqual(["https://0x0.st", "https://0x0.st/abc.mp4"]);
    });

    test("WebDAV puts the file in the folder, with Basic auth", () => {
        const plan = services.planUpload({ ...base, serviceType: "webdav", webdavUrl: "https://cloud.example.com/remote.php/dav/files/me/", webdavUsername: "me", webdavPassword: "pw", webdavDirectory: "/Discord uploads/" }, file);
        expect(plan.method).toBe("PUT");
        expect(plan.url).toBe("https://cloud.example.com/remote.php/dav/files/me/Discord%20uploads/clip%20one.mp4");
        expect(plan.headers).toEqual({ "Content-Type": "video/mp4", Authorization: `Basic ${Buffer.from("me:pw").toString("base64")}` });
        expect(plan.body).toEqual({ kind: "file" });
        expect(plan.read(answer(201, ""))).toBe(plan.url);
    });

    test("S3 signs a streamed PUT and links to the object", () => {
        const now = new Date(Date.UTC(2026, 10, 14, 10, 15, 0));
        const s3 = { ...base, serviceType: "s3", s3Endpoint: "https://acc.r2.cloudflarestorage.com", s3Bucket: "media", s3AccessKeyId: "AKID", s3SecretAccessKey: "secret", s3Prefix: "/up/" };
        const plan = services.planUpload(s3, file, now, () => "0011223344556677");
        const key = `up/${now.getTime()}-0011223344556677.mp4`;
        expect(plan.url).toBe(`https://acc.r2.cloudflarestorage.com/media/${key}`);
        expect(plan.headers.host).toBeUndefined();
        expect(plan.headers["x-amz-content-sha256"]).toBe("UNSIGNED-PAYLOAD");
        expect(plan.headers["x-amz-date"]).toBe("20261114T101500Z");
        const expected = sigv4.sign({
            method: "PUT",
            path: `/media/${key}`,
            headers: { "content-type": "video/mp4", host: "acc.r2.cloudflarestorage.com", "x-amz-content-sha256": "UNSIGNED-PAYLOAD", "x-amz-date": "20261114T101500Z" },
            payloadHash: "UNSIGNED-PAYLOAD",
        }, { accessKeyId: "AKID", secretAccessKey: "secret", region: "auto", service: "s3" });
        expect(plan.headers.Authorization).toBe(expected.authorization);
        expect(plan.headers.Authorization).toContain("Credential=AKID/20261114/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, ");
        expect(plan.read(answer(200, ""))).toBe(`https://acc.r2.cloudflarestorage.com/media/${key}`);

        const hosted = services.planUpload({ ...s3, s3ForcePathStyle: false, s3SessionToken: "tok", s3PublicUrl: "https://cdn.example.com/" }, file, now, () => "aa");
        expect(hosted.url).toBe(`https://media.acc.r2.cloudflarestorage.com/up/${now.getTime()}-aa.mp4`);
        expect(hosted.headers["x-amz-security-token"]).toBe("tok");
        expect(hosted.headers.Authorization).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token,");
        expect(hosted.read(answer(200, ""))).toBe(`https://cdn.example.com/up/${now.getTime()}-aa.mp4`);
        expect(() => services.planUpload({ ...s3, s3Bucket: "bad/bucket" }, file)).toThrow("isn't valid");
        expect(() => hosted.read(answer(403, "<Error>SignatureDoesNotMatch</Error>", "application/xml"))).toThrow("403");
    });

    test("links are kept to one safe line, and their query can go", () => {
        expect(services.checkedLink(" https://a.example/x ")).toBe("https://a.example/x");
        for (const bad of ["ftp://a", "https://a b", "data:text/html,x", `https://a.example/${"x".repeat(3000)}`, 42, "https://a\".example"]) {
            expect(() => services.checkedLink(bad)).toThrow();
        }
        expect(services.stripQuery("https://a.example/f.png?sig=1&x=2#frag")).toBe("https://a.example/f.png#frag");
        expect(services.stripQuery("https://a.example/f.png")).toBe("https://a.example/f.png");
    });
});

describe("FileUpload: ShareX configs", () => {
    const base = { serviceType: "sharex", sharexConfig: "" } as any;
    const file = { name: "shot.png", mime: "image/png" };
    const plan = (config: unknown) => services.planUpload({ ...base, sharexConfig: typeof config === "string" ? config : JSON.stringify(config) }, file);

    test("a multipart uploader with arguments and the file name", () => {
        const upload = plan({
            Version: "16.0.1", DestinationType: "ImageUploader, FileUploader", RequestMethod: "POST",
            RequestURL: "https://i.example.com/upload?expires=24h", Headers: { "X-Key": "abc", "Content-Type": "multipart/form-data" },
            Body: "MultipartFormData", FileFormName: "image", Arguments: { name: "$filename$", tag: "{filename}-x", n: 5 },
            URL: "$json:data.links[0]$", ErrorMessage: "{json:error.message}",
        });
        expect(upload.url).toBe("https://i.example.com/upload?expires=24h");
        expect(upload.headers).toEqual({ "X-Key": "abc" });
        expect(upload.body).toEqual({ kind: "form", field: "image", fields: [["name", "shot.png"], ["tag", "shot.png-x"], ["n", "5"]] });
        expect(upload.read({ status: 200, text: JSON.stringify({ data: { links: ["https://i.example.com/a.png"] } }), contentType: "" })).toBe("https://i.example.com/a.png");
        expect(() => upload.read({ status: 400, text: JSON.stringify({ error: { message: "too big" } }), contentType: "" })).toThrow("too big");
    });

    test("binary and JSON bodies, and the answer itself as the link", () => {
        const binary = plan({ RequestURL: "https://up.example.com/put", RequestMethod: "PUT", Body: "Binary", URL: "{response}" });
        expect([binary.method, binary.body.kind, binary.headers["Content-Type"]]).toEqual(["PUT", "file", "image/png"]);
        expect(binary.read({ status: 200, text: " https://up.example.com/f ", contentType: "" })).toBe("https://up.example.com/f");
        const json = plan({ RequestURL: "https://up.example.com/j", Body: "JSON", Arguments: { a: "$filename$" } });
        expect(json.body).toEqual({ kind: "json", json: JSON.stringify({ a: "shot.png" }) });
        expect(json.read({ status: 200, text: JSON.stringify({ url: "https://up.example.com/u" }), contentType: "" })).toBe("https://up.example.com/u");
    });

    test("refuses configs that are broken or point somewhere they shouldn't", () => {
        expect(() => plan("{ not json")).toThrow("Invalid ShareX JSON");
        expect(() => plan([])).toThrow("JSON object");
        expect(() => plan({})).toThrow("RequestURL");
        expect(() => plan({ RequestURL: "https://a.example", DestinationType: "URLShortener" })).toThrow("DestinationType");
        expect(() => plan({ RequestURL: "http://a.example" })).toThrow("https://");
        expect(() => plan({ RequestURL: "https://10.0.0.5/upload" })).toThrow("network");
        expect(() => plan({ RequestURL: "https://a.example", Body: "FormURLEncoded" })).toThrow("Unsupported ShareX Body");
        expect(() => plan({ RequestURL: "https://a.example", RequestMethod: "DELETE" })).toThrow("request method");
        expect(() => plan({ RequestURL: "https://a.example", Headers: { "Bad Header": "x" } })).toThrow("valid header name");
        expect(() => plan({ RequestURL: "https://a.example", Headers: { "X-A": "x\r\nInjected: 1" } })).toThrow("line breaks");
        expect(() => plan("x".repeat(30_000))).toThrow("Invalid ShareX JSON");
    });

    test("templates only read the answer's own values", () => {
        expect(sharex.resolveShareXTemplate("$json:__proto__$|{json:constructor}|$json:a.b$", "", { a: { b: 7 } })).toBe("||7");
        expect(sharex.resolveShareXTemplate("$json:obj$", "", { obj: { x: 1 } })).toBe("");
        expect(sharex.resolveShareXTemplate("  ", "", null)).toBeUndefined();
        const config = sharex.parseShareXConfig(JSON.stringify({ RequestURL: "https://a.example", Arguments: JSON.parse("{\"__proto__\":\"x\",\"ok\":\"y\"}") }));
        expect(Object.keys(config.Arguments ?? {})).toEqual(["ok"]);
    });
});

const parts = await import(SRC + "plugins/fileSplitter/parts.ts");

describe("FileSplitter", () => {
    test("parts are as big as chosen, never past the upload limit, in whole base64 blocks", () => {
        expect(parts.uploadLimit(0)).toBe(10 * 1024 * 1024);
        expect(parts.uploadLimit(3)).toBe(50 * 1024 * 1024);
        expect(parts.uploadLimit(2)).toBe(500 * 1024 * 1024);
        const ten = parts.partBytes(10, parts.uploadLimit(0));
        expect(ten % 3).toBe(0);
        expect(ten).toBeLessThanOrEqual(10 * 1024 * 1024);
        expect(ten).toBeGreaterThan(10 * 1024 * 1024 - 3);
        expect(parts.partBytes(100, parts.uploadLimit(undefined))).toBe(ten);
        expect(parts.partBytes(0, parts.uploadLimit(2))).toBe(Math.floor(1024 * 1024 / 3) * 3);
    });

    test("names parts like Endcord PC and reads them back", () => {
        expect(parts.partName("clip.mp4", 2)).toBe("clip.mp4.part2");
        expect(parts.partOf("clip.mp4.part2")).toEqual({ base: "clip.mp4", index: 2 });
        expect(parts.partOf("a.PART10")).toEqual({ base: "a", index: 10 });
        for (const name of ["clip.mp4", "x.part0", "x.part101", ".part1", `${"a".repeat(400)}.part1`, 5, undefined]) expect(parts.partOf(name)).toBeUndefined();
        expect(parts.totalFromContent(parts.partLabel("clip.mp4", 2, 5))).toBe(5);
        expect(parts.totalFromContent("no total")).toBeUndefined();
        expect(parts.totalFromContent("[1/999]")).toBeUndefined();
    });

    test("finds the parts the same person sent, the copy nearest the one pressed, and what's missing", () => {
        const url = (n: number, v = "") => `https://cdn.discordapp.com/attachments/1/2/f.part${n}${v}`;
        let id = 0;
        const message = (n: number, total?: number, v = "", author = "alice") => ({
            id: String(++id), author: { id: author }, content: total ? parts.partLabel("f", n, total) : "",
            attachments: [{ filename: `f.part${n}`, url: url(n, v), size: 10 }],
        });
        const alice = (messages: any[], pressed = messages[messages.length - 1]) => parts.findParts(messages, "f", { messageId: pressed.id, authorId: "alice" });
        const urls = (found: any) => found.parts.map((p: any) => p.url);

        const list = [message(1, 3), message(2, 3), { id: "x", author: { id: "alice" }, attachments: [{ filename: "other.part1", url: url(9), size: 1 }] }, message(2, 3, "?new"), message(3, 3)];
        expect(alice(list)).toMatchObject({ total: 3, missing: [], totalKnown: true });
        // Pressing the newest part: the newest copies; pressing an older one: the copies nearest to it
        expect(urls(alice(list))).toEqual([url(1), url(2, "?new"), url(3)]);
        expect(urls(alice(list, list[1]))).toEqual([url(1), url(2), url(3)]);
        // Not among the loaded messages: the newest copies
        expect(urls(parts.findParts(list, "f", { messageId: "gone", authorId: "alice" }))).toEqual([url(1), url(2, "?new"), url(3)]);

        // Someone else's parts are never used, sent later or nearer, and their labels don't count either
        const mixed = [message(1, 2), message(2, 2), message(1, 2, "?mallory", "mallory"), message(3, 100, "", "mallory")];
        expect(alice(mixed, mixed[1])).toMatchObject({ total: 2, missing: [], totalKnown: true });
        expect(urls(alice(mixed, mixed[1]))).toEqual([url(1), url(2)]);
        expect(urls(alice(mixed, mixed[0]))).toEqual([url(1), url(2)]);
        // Pressing theirs only finds theirs, with the total of their label nearest to it
        expect(parts.findParts(mixed, "f", { messageId: mixed[2].id, authorId: "mallory" })).toMatchObject({ total: 2, missing: [2] });
        // Nobody to match: nothing
        expect(parts.findParts(mixed, "f", { messageId: mixed[0].id, authorId: "" })).toMatchObject({ parts: [], total: 0, missing: [] });

        expect(alice([message(1, 4), message(3)])).toMatchObject({ total: 4, missing: [2, 4], totalKnown: true });
        // Endcord PC's parts say nothing of how many there are, which the join warns about
        expect(alice([message(1), message(2)])).toMatchObject({ total: 2, missing: [], totalKnown: false });
        expect(parts.isDiscordFile(url(1))).toBe(true);
        expect(parts.isDiscordFile("https://evil.example/attachments/x")).toBe(false);
        expect(parts.isDiscordFile("http://cdn.discordapp.com/attachments/x")).toBe(false);
    });

    test("joins base64 parts back into the file, aligned or not", () => {
        const random = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7919 + n) % 256);
        const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
        for (const sizes of [[9, 9, 4], [10, 10, 10, 3], [1, 1, 1], [8, 7], [3], [5], [0, 4], [6, 6]]) {
            const chunks = sizes.map(random);
            const whole = Buffer.concat(chunks.map(c => Buffer.from(c)));
            expect(parts.joinBase64(chunks.map(b64))).toBe(whole.toString("base64"));
        }
        const bytes = random(1000);
        expect(Buffer.from(parts.base64ToBytes(b64(bytes))).equals(Buffer.from(bytes))).toBe(true);
        expect(parts.bytesToBase64(bytes)).toBe(b64(bytes));
        expect(() => parts.base64ToBytes("ab$d")).toThrow();
        expect(() => parts.base64ToBytes("abçd")).toThrow();
    });

    test("joining big parts takes little time", () => {
        const part = Buffer.alloc(3 * 1024 * 1024 + 1, 7).toString("base64");
        const started = performance.now();
        parts.joinBase64([part, part]);
        expect(performance.now() - started).toBeLessThan(5000);
    });
});

const hide = await import(SRC + "plugins/hideChatButtons/hide.ts");

describe("HideChatButtons", () => {
    const Apps = () => null, Gift = () => null, Attach = () => null, Transition = () => null;
    const memoGift = { $$typeof: Symbol.for("react.memo"), type: Gift };
    const element = (type: unknown, key: string | null, children?: unknown) => ({ type, key, props: { children } });

    test("leaves out other plugins' buttons and Discord's Apps and Gift buttons, wrapped or not", () => {
        const row = [
            element(Attach, "attach"),
            element(Transition, "apps", element(Apps, null)),
            element(memoGift, "gift"),
            element(Transition, "deep", [element(Transition, null, element(Gift, null))]),
            element(() => null, "endcord-silent-message"),
            element(() => null, "endcord-hide-chat-buttons"),
            null,
        ];
        const shown = hide.shownButtons(row, new Set<unknown>([Apps, Gift]), "endcord-hide-chat-buttons");
        expect(shown.map((c: any) => c?.key ?? null)).toEqual(["attach", "endcord-hide-chat-buttons", null]);
    });

    test("doesn't look further than a few levels down", () => {
        let deep: any = element(Gift, null);
        for (let i = 0; i < 10; i++) deep = element(Transition, null, deep);
        expect(hide.uses(deep, new Set<unknown>([Gift]))).toBe(false);
        expect(hide.uses(element(Transition, null, element(Gift, null)), new Set<unknown>([Gift]))).toBe(true);
    });
});

const shapes = await import(SRC + "plugins/remix/shapes.ts");

describe("RemixRevived", () => {
    test("fits the picture on screen and sends it at most MAX_OUTPUT_SIDE", () => {
        expect(shapes.fit(4000, 2000, 400, 800)).toEqual({ width: 400, height: 200 });
        expect(shapes.fit(1000, 3000, 400, 600)).toEqual({ width: 200, height: 600 });
        expect(shapes.fit(0, 10, 400, 400)).toEqual({ width: 0, height: 0 });
        expect(shapes.outputSize(4000, 2000)).toEqual({ width: shapes.MAX_OUTPUT_SIDE, height: shapes.MAX_OUTPUT_SIDE / 2 });
        expect(shapes.outputSize(800, 600)).toEqual({ width: 800, height: 600 });
    });

    test("draws strokes, arrows and boxes as SVG", () => {
        expect(shapes.strokePath([{ x: 1, y: 2 }])).toBe("M1 2l0.1 0");
        expect(shapes.strokePath([{ x: 1.04, y: 2 }, { x: 3, y: 4.56 }])).toBe("M1 2L3 4.6");
        expect(shapes.strokePath([])).toBe("");
        expect(shapes.arrowPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 10)).toMatch(/^M0 0L100 0M74 15L100 0L74 -15$/);
        expect(shapes.box({ x: 10, y: 50 }, { x: 0, y: 20 })).toEqual({ x: 0, y: 20, width: 10, height: 30 });
    });

    test("keeps strokes light", () => {
        let points = [{ x: 0, y: 0 }];
        points = shapes.addPoint(points, { x: 1, y: 1 }, 5);
        expect(points.length).toBe(1);
        points = shapes.addPoint(points, { x: 10, y: 0 }, 5);
        expect(points.length).toBe(2);
        let long = [{ x: 0, y: 0 }];
        for (let i = 1; i < shapes.MAX_POINTS + 50; i++) long = shapes.addPoint(long, { x: i * 10, y: 0 }, 1);
        expect(long.length).toBe(shapes.MAX_POINTS);
    });

    test("knows how big a PNG is from its base64", () => {
        for (const n of [0, 1, 2, 3, 100, 1001]) {
            const b64 = Buffer.alloc(n, 1).toString("base64");
            expect(shapes.base64Length(b64)).toBe(n);
            expect(shapes.base64Length(b64.replace(/(.{76})/g, "$1\n"))).toBe(n);
        }
    });
});

const zipTools = await import(SRC + "plugins/zipPreview/zip.ts");
const zlib = await import("node:zlib");

/** fflate's streaming Inflate, made of Node's zlib: hands over what's unpacked after each push */
class NodeInflate {
    private received: Buffer[] = [];
    private emitted = 0;
    constructor(private ondata: (chunk: Uint8Array, final: boolean) => void) { }
    push(data: Uint8Array, final = false) {
        this.received.push(Buffer.from(data));
        const out = zlib.inflateRawSync(Buffer.concat(this.received), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
        const chunk = out.subarray(this.emitted);
        this.emitted = out.length;
        if (chunk.length || final) this.ondata(new Uint8Array(chunk), final);
    }
}

describe("ZipPreview", () => {
    const text = new TextEncoder().encode("hello zip ".repeat(500));
    const raw = Uint8Array.from({ length: 3000 }, (_, i) => i * 31 % 256);
    const entry = (name: string, bytes: Uint8Array, deflated: boolean) => ({
        name, size: bytes.length, crc: zipTools.crc32(bytes),
        data: deflated ? new Uint8Array(zlib.deflateRawSync(bytes)) : bytes, method: deflated ? 8 : 0,
    } as const);

    test("CRC-32 is the standard one, also a piece at a time", () => {
        const check = new TextEncoder().encode("123456789");
        expect(zipTools.crc32(check)).toBe(0xCBF43926);
        expect(zipTools.crc32(check.subarray(4), zipTools.crc32(check.subarray(0, 4)))).toBe(0xCBF43926);
        expect(zipTools.crc32(new Uint8Array(0))).toBe(0);
    });

    test("writes archives it can read back, folders and all", () => {
        const archive = zipTools.writeZip([entry("docs/readme.txt", text, true), entry("data.bin", raw, false), entry("docs/ç ö ş.txt", text, false)], new Date(2026, 10, 14, 12, 30, 10));
        const entries = zipTools.readZip(archive);
        expect(entries.map((e: any) => [e.name, e.method, e.size])).toEqual([["docs/readme.txt", 8, text.length], ["data.bin", 0, raw.length], ["docs/ç ö ş.txt", 0, text.length]]);
        expect(Buffer.from(zipTools.readEntry(archive, entries[0], 1e6, NodeInflate)).equals(Buffer.from(text))).toBe(true);
        expect(Buffer.from(zipTools.readEntry(archive, entries[1], 1e6, NodeInflate)).equals(Buffer.from(raw))).toBe(true);
        const top = zipTools.listFolder(entries, "");
        expect(top.folders).toEqual(["docs/"]);
        expect(top.files.map((e: any) => e.name)).toEqual(["data.bin"]);
        expect(zipTools.listFolder(entries, "docs/").files.map((e: any) => zipTools.baseName(e.name))).toEqual(["ç ö ş.txt", "readme.txt"]);
    });

    test("stops an archive that unpacks to far more than allowed", () => {
        const zeros = new Uint8Array(20 * 1024 * 1024);
        const bomb = zipTools.writeZip([{ ...entry("bomb.txt", zeros, true), size: 10 }]);
        const [file] = zipTools.readZip(bomb);
        let error: any;
        try {
            zipTools.readEntry(bomb, file, 1024 * 1024, NodeInflate);
        } catch (e) {
            error = e;
        }
        expect(error?.reason).toBe("too-big");
        expect(() => zipTools.readEntry(bomb, { ...file, size: 5 * 1024 * 1024 }, 1024 * 1024, NodeInflate)).toThrow("too-big");
    });

    test("hands a file over only when it's the size and CRC-32 the archive gives for it", () => {
        // Stored, it says it weighs 10 bytes but takes a megabyte, past the limit it was checked against
        const big = new Uint8Array(1024 * 1024).fill(0x41);
        const lie = zipTools.writeZip([{ ...entry("a.txt", big, false), size: 10 }]);
        expect(() => zipTools.readEntry(lie, zipTools.readZip(lie)[0], 512 * 1024, NodeInflate)).toThrow("mismatch");

        // Changed after its CRC-32 was worked out, stored or deflated
        const wrong = (zipTools.crc32(text) ^ 1) >>> 0;
        for (const deflated of [false, true]) {
            const archive = zipTools.writeZip([{ ...entry("a.txt", text, deflated), crc: wrong }]);
            const [file] = zipTools.readZip(archive);
            expect(file.crc).toBe(wrong);
            let error: any;
            try {
                zipTools.readEntry(archive, file, 1e6, NodeInflate);
            } catch (e) {
                error = e;
            }
            expect(error?.reason).toBe("mismatch");
        }

        // Unpacks to fewer bytes than it says
        const short = zipTools.writeZip([{ ...entry("a.txt", text, true), size: text.length + 1 }]);
        expect(() => zipTools.readEntry(short, zipTools.readZip(short)[0], 1e6, NodeInflate)).toThrow("mismatch");
        // And the CRC-32 it gives is the one read back
        const good = zipTools.writeZip([entry("a.txt", text, true)]);
        expect(zipTools.readZip(good)[0].crc).toBe(zipTools.crc32(text));
    });

    test("refuses what it can't open, and damaged archives", () => {
        const archive = zipTools.writeZip([entry("a.txt", text, true)]);
        const [file] = zipTools.readZip(archive);
        expect(() => zipTools.readEntry(archive, { ...file, encrypted: true }, 1e6, NodeInflate)).toThrow("encrypted");
        expect(() => zipTools.readEntry(archive, { ...file, method: 14 }, 1e6, NodeInflate)).toThrow("method");
        expect(() => zipTools.readEntry(archive, { ...file, offset: 999999 }, 1e6, NodeInflate)).toThrow("damaged");
        const broken = archive.slice();
        broken.fill(0xFF, 30 + 5, 30 + 40);
        expect(() => zipTools.readEntry(broken, file, 1e6, NodeInflate)).toThrow();
        expect(() => zipTools.readZip(new Uint8Array(100))).toThrow("Not a ZIP");
    });

    test("names from someone else's archive are shown safely", () => {
        const name = "evil\u202e\u0007txt.exe";
        const archive = zipTools.writeZip([entry(name, raw, false), entry("win\\path\\x.txt", raw, false)]);
        expect(zipTools.readZip(archive).map((e: any) => e.name)).toEqual(["eviltxt.exe", "win/path/x.txt"]);
    });

    test("tells text files and gives zipped files different names", () => {
        expect(zipTools.isText("src/main.ts")).toBe(true);
        expect(zipTools.isText("README")).toBe(true);
        expect(zipTools.isText("photo.jpg")).toBe(false);
        expect(zipTools.uniqueNames(["a.txt", "A.txt", "a.txt", "b"])).toEqual(["a.txt", "A (2).txt", "a (3).txt", "b"]);
    });
});

describe("RemixRevived: the picture sent", () => {
    test("only a PNG is sent", () => {
        expect(shapes.isPng(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0]))).toBe(true);
        expect(shapes.isPng(new TextEncoder().encode("<html>not a png</html>"))).toBe(false);
        expect(shapes.isPng(new Uint8Array(0))).toBe(false);
    });
});
