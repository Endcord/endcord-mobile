// Endcord PC's GIF, image, emoji, sticker and reaction plugins on mobile: their pure parts, most of
// which read what other services or other people send, so they are checked against hostile and oversized input too
import { describe, expect, test } from "bun:test";

import { SRC } from "./src";

const gif = await import(SRC + "plugins/gifProviderSwitcher/providers.ts");

const tenorItem = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: "",
    h1_title: `Cat ${id}`,
    itemurl: `https://tenor.com/view/cat-${id}`,
    media: [{
        gif: { url: `https://media.tenor.com/${id}AC/cat.gif`, preview: `https://media.tenor.com/${id}AC/cat.png`, dims: [498, 280] },
        tinygif: { url: `https://media.tenor.com/${id}AM/cat.gif`, preview: `https://media.tenor.com/${id}AM/cat.png`, dims: [220, 124] },
        tinymp4: { url: `https://media.tenor.com/${id}P3/cat.mp4`, preview: `https://media.tenor.com/${id}P3/cat.png`, dims: [320, 180] },
        tinywebm: { url: `https://media.tenor.com/${id}P5/cat.webm`, preview: `https://media.tenor.com/${id}P5/cat.png`, dims: [320, 180] },
        webp: { url: `https://media.tenor.com/${id}Ax/cat.webp`, preview: `https://media.tenor.com/${id}Ax/cat.png`, dims: [498, 280] },
        ...extra,
    }],
});

const giphyItem = (id: string) => ({
    id,
    title: `Dog ${id}`,
    url: `https://giphy.com/gifs/dog-${id}`,
    images: {
        original: { url: `https://media.giphy.com/media/${id}/giphy.gif`, width: "480", height: "270" },
        fixed_height: { url: `https://media.giphy.com/media/${id}/200.gif`, mp4: `https://media.giphy.com/media/${id}/200.mp4`, webp: `https://media.giphy.com/media/${id}/200.webp`, width: "356", height: "200" },
        fixed_height_still: { url: `https://media.giphy.com/media/${id}/200_s.gif` },
    },
});

describe("GifProviderSwitcher", () => {
    test("only Discord's GIF endpoints are answered, with or without the API prefix", () => {
        expect(gif.gifEndpoint("/gifs/search")).toBe("search");
        expect(gif.gifEndpoint("/gifs/trending-gifs?limit=50")).toBe("trending-gifs");
        expect(gif.gifEndpoint("/gifs/trending")).toBe("trending");
        expect(gif.gifEndpoint("/gifs/suggest")).toBe("suggest");
        expect(gif.gifEndpoint("/gifs/select")).toBe("select");
        expect(gif.gifEndpoint("https://discord.com/api/v9/gifs/search?q=cat")).toBe("search");
        expect(gif.gifEndpoint("/gifs/trending-search")).toBeUndefined();
        expect(gif.gifEndpoint("/channels/1/messages")).toBeUndefined();
        expect(gif.gifEndpoint("https://evil.example/gifs/search")).toBeUndefined();
        expect(gif.gifEndpoint("/users/@me/gifs/search")).toBeUndefined();
        expect(gif.gifEndpoint(undefined)).toBeUndefined();
        expect(gif.gifEndpoint("/gifs/" + "a".repeat(5000))).toBeUndefined();
    });

    test("the query comes from the request's object and its address", () => {
        expect(gif.requestQuery({ url: "/gifs/search?q=a%20cat&limit=20", query: { media_format: "mp4", locale: "tr" } }))
            .toEqual({ q: "a cat", limit: "20", media_format: "mp4", locale: "tr" });
        expect(gif.requestQuery("/gifs/search?q=%E0%A4%A")).toEqual({});
        const query = gif.requestQuery({ url: "/gifs/search", query: { __proto__: "x", nested: { a: 1 } } });
        expect(Object.getPrototypeOf(query)).toBeNull();
        expect(query.nested).toBeUndefined();
    });

    test("the providers a setting names, Tenor when it names none", () => {
        expect(gif.parseProviders("tenor,giphy,klipy")).toEqual(["tenor", "giphy", "klipy"]);
        expect(gif.parseProviders("giphy,giphy")).toEqual(["giphy"]);
        expect(gif.parseProviders("nonsense")).toEqual(["tenor"]);
        expect(gif.primaryProvider(["klipy", "giphy"])).toBe("giphy");
        expect(gif.primaryProvider(["klipy"])).toBe("klipy");
    });

    test("no more results than Discord asked its own API for, shared between providers", () => {
        expect(gif.totalLimit("50")).toBe(50);
        expect(gif.totalLimit(undefined)).toBe(50);
        expect(gif.totalLimit("-3")).toBe(50);
        expect(gif.totalLimit("100000")).toBe(100);
        expect(gif.perProvider(50, 2)).toBe(25);
        expect(gif.perProvider(100, 1)).toBe(50);
        expect(gif.perProvider(1, 3)).toBe(1);
    });

    test("a Tenor result keeps the kind of media Discord asked for", () => {
        expect(gif.tenorToDiscord(tenorItem("1"), "mp4")).toEqual({
            id: "1", title: "Cat 1", url: "https://tenor.com/view/cat-1",
            src: "https://media.tenor.com/1P3/cat.mp4", gif_src: "https://media.tenor.com/1AC/cat.gif",
            width: 320, height: 180, preview: "https://media.tenor.com/1P3/cat.png",
        });
        expect(gif.tenorToDiscord(tenorItem("1"), "tinywebm")!.src).toBe("https://media.tenor.com/1P5/cat.webm");
        expect(gif.tenorToDiscord(tenorItem("1"), "tinywebp")!.src).toBe("https://media.tenor.com/1Ax/cat.webp");
        expect(gif.tenorToDiscord(tenorItem("1"), "tinygif")!.src).toBe("https://media.tenor.com/1AM/cat.gif");
        // A video stays a video when Tenor lacks the exact format
        expect(gif.tenorToDiscord(tenorItem("1", { tinywebm: undefined }), "webm")!.src).toBe("https://media.tenor.com/1P3/cat.mp4");
        expect(gif.tenorToDiscord(tenorItem("1"), undefined)!.src).toBe("https://media.tenor.com/1P5/cat.webm");
    });

    test("a Tenor result that isn't safe or complete is left out", () => {
        expect(gif.tenorToDiscord({ ...tenorItem("1"), itemurl: "javascript:alert(1)" }, "mp4")).toBeNull();
        expect(gif.tenorToDiscord(tenorItem("1", { tinymp4: { url: "http://media.tenor.com/x.mp4", dims: [1, 1] }, mp4: undefined }), "mp4")).toBeNull();
        expect(gif.tenorToDiscord(tenorItem("1", { tinymp4: { url: "https://media.tenor.com/x.mp4", dims: [0, 5] } }), "mp4")).toBeNull();
        expect(gif.tenorToDiscord({ id: {}, media: [] }, "mp4")).toBeNull();
        expect(gif.tenorToDiscord(null, "mp4")).toBeNull();
        // A format name that is an object's own key never reaches the prototype
        expect(gif.tenorToDiscord(tenorItem("1"), "__proto__")!.src).toBe("https://media.tenor.com/1P5/cat.webm");
        const long = gif.tenorToDiscord({ ...tenorItem("1"), title: "x".repeat(10000) }, "mp4")!;
        expect(long.title.length).toBe(200);
    });

    test("Giphy results: pictures as pictures, anything else as its MP4", () => {
        const item = giphyItem("abc");
        expect(gif.giphyToDiscord(item, "mp4")).toEqual({
            id: "abc", title: "Dog abc", url: "https://giphy.com/gifs/dog-abc",
            src: "https://media.giphy.com/media/abc/200.mp4", gif_src: "https://media.giphy.com/media/abc/giphy.gif",
            width: 356, height: 200, preview: "https://media.giphy.com/media/abc/200_s.gif",
        });
        expect(gif.giphyToDiscord(item, "tinywebp")!.src).toBe("https://media.giphy.com/media/abc/200.webp");
        expect(gif.giphyToDiscord(item, "gif")!.src).toBe("https://media.giphy.com/media/abc/200.gif");
        expect(gif.giphyToDiscord(item, "webm")!.src).toBe("https://media.giphy.com/media/abc/200.mp4");
        expect(gif.giphyToDiscord({ ...item, images: { ...item.images, fixed_height: undefined } }, "mp4")).toBeNull();
        expect(gif.giphyToDiscord({ ...item, url: "file:///etc" }, "mp4")).toBeNull();
    });

    test("lists, suggestions and categories are capped", () => {
        const many = { results: Array.from({ length: 500 }, (_, i) => tenorItem(String(i))) };
        expect(gif.tenorResults(many, "mp4").length).toBe(50);
        expect(gif.giphyResults({ data: [giphyItem("a"), { bogus: true }, giphyItem("b")] }, "mp4").map((g: any) => g.id)).toEqual(["a", "b"]);
        expect(gif.tenorResults({ results: "nope" }, "mp4")).toEqual([]);
        expect(gif.tenorSuggestions({ results: ["cat", "cat", 5, "x".repeat(500), ...Array(30).fill("dog")] })).toEqual(["cat", "x".repeat(100), "dog"]);
        expect(gif.giphySuggestions({ data: [{ name: "wave" }, { name: null }] })).toEqual(["wave"]);
        expect(gif.tenorCategories({ tags: [{ searchterm: "happy", image: "https://media.tenor.com/h.gif" }, { searchterm: "", image: "https://x.y/z.gif" }, { searchterm: "sad", image: "ftp://x" }] }))
            .toEqual({ categories: [{ name: "happy", src: "https://media.tenor.com/h.gif" }], gifs: [{ src: "https://media.tenor.com/h.gif" }] });
        expect(gif.tenorCategories({ tags: [] })).toBeNull();
        expect(gif.giphyCategories({ data: [{ name: "Animals", gif: { images: { fixed_height: { url: "https://media.giphy.com/a.gif" } } } }] })!.categories)
            .toEqual([{ name: "Animals", src: "https://media.giphy.com/a.gif" }]);
    });

    test("providers' results take turns, up to the limit", () => {
        const page = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }) as any);
        expect(gif.interleave([page("t", 3), page("g", 1)], 10).map((g: any) => g.id)).toEqual(["t0", "g0", "t1", "t2"]);
        expect(gif.interleave([page("t", 30), page("g", 30)], 5).map((g: any) => g.id)).toEqual(["t0", "g0", "t1", "g1", "t2"]);
        expect(gif.interleave([], 5)).toEqual([]);
    });

    test("Discord's own answer when Tenor and Giphy all failed", () => {
        const page = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}` }) as any);
        const ok = (value: any[]) => ({ ok: true, value });
        const failed = { ok: false, error: new Error("unreachable") };
        const ids = (shown: any) => shown.map((g: any) => g.id);
        expect(gif.combineResults(["tenor"], [failed], 10)).toBeNull();
        expect(gif.combineResults(["tenor", "giphy"], [failed, failed], 10)).toBeNull();
        // Klipy is Discord's own: when the others failed, Discord's answer is shown whole rather than Klipy's share of it
        expect(gif.combineResults(["tenor", "klipy"], [failed, ok(page("k", 3))], 10)).toBeNull();
        // One that answered is enough, even with nothing found
        expect(ids(gif.combineResults(["tenor", "giphy"], [failed, ok(page("g", 2))], 10))).toEqual(["g0", "g1"]);
        expect(gif.combineResults(["tenor"], [ok([])], 10)).toEqual([]);
        expect(ids(gif.combineResults(["tenor", "klipy"], [ok(page("t", 2)), ok(page("k", 2))], 10))).toEqual(["t0", "k0", "t1", "k1"]);
        expect(ids(gif.combineResults(["tenor", "klipy"], [ok(page("t", 2)), failed], 10))).toEqual(["t0", "t1"]);
    });

    test("an answer without its list is an error, not nothing found", () => {
        expect(gif.hasList("tenor", { results: [] })).toBe(true);
        expect(gif.hasList("giphy", { data: [] })).toBe(true);
        for (const json of [null, undefined, {}, { error: "rate limited" }, { results: "x" }, { data: {} }, []]) {
            expect(gif.hasList("tenor", json)).toBe(false);
            expect(gif.hasList("giphy", json)).toBe(false);
        }
        expect(gif.hasList("tenor", { data: [] })).toBe(false);
        expect(gif.hasList("giphy", { results: [] })).toBe(false);
    });

    test("picked results are told to the service they came from", () => {
        const [tagged] = gif.tagged("tenor", [gif.tenorToDiscord(tenorItem("9"), "mp4")!]);
        expect(tagged.id).toBe("tenor:9");
        expect(gif.splitId("tenor:9")).toEqual({ provider: "tenor", id: "9" });
        expect(gif.splitId("klipy:abc:def")).toEqual({ provider: "klipy", id: "abc:def" });
        expect(gif.splitId("12345")).toBeUndefined();
        expect(gif.splitId("evil:1")).toBeUndefined();
        expect(gif.splitId(7)).toBeUndefined();
    });

    test("locales and the search box's hint", () => {
        expect(gif.tenorLocale("en-US")).toBe("en_us");
        expect(gif.giphyLang("zh-TW")).toBe("zh-TW");
        expect(gif.giphyLang("zh-CN")).toBe("zh-CN");
        expect(gif.giphyLang("pt-BR")).toBe("pt");
        expect(gif.giphyLang("")).toBe("en");
        expect(gif.replaceProviderName("Search Klipy", ["tenor", "giphy"])).toBe("Search Tenor, Giphy");
        expect(gif.replaceProviderName("Klipy'de ara", ["tenor"])).toBe("Tenor'de ara");
        expect(gif.buildUrl("https://api.tenor.com/v1/search", { q: "a&b=c", limit: "5" })).toBe("https://api.tenor.com/v1/search?q=a%26b%3Dc&limit=5");
    });
});

const gifLoad = await import(SRC + "plugins/betterGifLoad/quality.ts");

describe("BetterGifLoad", () => {
    const [high, reasonable, low, horrible] = gifLoad.QUALITIES;

    test("the setting picks PC's qualities, High when it's unknown", () => {
        expect(gifLoad.qualityOf("1")).toBe(high);
        expect(gifLoad.qualityOf("4")).toBe(horrible);
        expect(gifLoad.qualityOf("9")).toBe(high);
        expect(gifLoad.qualityOf("")).toBe(high);
    });

    test("Tenor links at the picked size, videos as videos unless a picture is asked for", () => {
        expect(gifLoad.atQuality("https://media.tenor.com/abcdefAAAAC/cat-meme.gif", low)).toBe("https://media.tenor.com/abcdefAAAA1/cat-meme.webp");
        expect(gifLoad.atQuality("https://media1.tenor.com/m/abcdefAAAAC/cat.gif", reasonable)).toBe("https://media.tenor.com/abcdefAAAA5/cat.webp");
        expect(gifLoad.atQuality("https://media.tenor.com/abcdefAAAPo/cat.mp4", horrible)).toBe("https://media.tenor.com/abcdefAAAP4/cat.mp4");
        expect(gifLoad.atQuality("https://media.tenor.com/abcdefAAAPo/cat.mp4", horrible, undefined, true)).toBe("https://media.tenor.com/abcdefAAAA2/cat.webp");
        // Applying it again changes nothing
        const once = gifLoad.atQuality("https://c.tenor.com/abcdefAAAAC/x.gif", low);
        expect(gifLoad.atQuality(once, low)).toBe(once);
    });

    test("Giphy links, but not its stills", () => {
        expect(gifLoad.atQuality("https://media2.giphy.com/media/v1.Y2lk/XYZ123/giphy.gif", low)).toBe("https://i.giphy.com/media/XYZ123/200.webp");
        expect(gifLoad.atQuality("https://media.giphy.com/media/XYZ123/200.webp", high)).toBe("https://i.giphy.com/media/XYZ123/giphy.webp");
        expect(gifLoad.atQuality("https://media.giphy.com/media/XYZ123/200_s.gif", low)).toBe("https://media.giphy.com/media/XYZ123/200_s.gif");
        expect(gifLoad.atQuality("https://media.giphy.com/media/XYZ123/200.mp4", low)).toBe("https://media.giphy.com/media/XYZ123/200.mp4");
    });

    test("Discord's proxy resizes pictures, keeps the link's signature, and leaves videos alone", () => {
        expect(gifLoad.atQuality("https://media.discordapp.net/attachments/1/2/a.gif?ex=1&is=2&hm=3&width=50", low, [400, 200]))
            .toBe("https://media.discordapp.net/attachments/1/2/a.gif?ex=1&is=2&hm=3&format=webp&animated=true&width=400&height=200");
        expect(gifLoad.atQuality("https://cdn.discordapp.com/attachments/1/2/a.webp", horrible))
            .toBe("https://cdn.discordapp.com/attachments/1/2/a.webp?format=webp&animated=true");
        expect(gifLoad.atQuality("https://media.discordapp.net/attachments/1/2/a.mp4?ex=1", low, [10, 10])).toBe("https://media.discordapp.net/attachments/1/2/a.mp4?ex=1");
        expect(gifLoad.atQuality("https://evil.discordapp.net.example.com/a.gif", low)).toBe("https://evil.discordapp.net.example.com/a.gif");
    });

    test("a Tenor GIF behind Discord's proxy is loaded from Tenor at the picked size, as on PC", () => {
        expect(gifLoad.unproxied("https://images-ext-1.discordapp.net/external/SIG/https/media.tenor.com/abcAAAAC/cat.gif")).toBe("https://media.tenor.com/abcAAAAC/cat.gif");
        expect(gifLoad.unproxied("https://media.discordapp.net/external/SIG/%3Fwidth%3D1/https/media.tenor.com/abcAAAAC/cat.gif")).toBe("https://media.tenor.com/abcAAAAC/cat.gif");
        expect(gifLoad.atQuality("https://images-ext-2.discordapp.net/external/SIG/https/media.tenor.com/abcAAAAC/cat.gif", low)).toBe("https://media.tenor.com/abcAAAA1/cat.webp");
        expect(gifLoad.unproxied("https://images-ext-1.discordapp.net/external/SIG/https/%E0%A4%A")).toBe("https://images-ext-1.discordapp.net/external/SIG/https/%E0%A4%A");
    });

    test("anything else, and anything odd, is left as it is", () => {
        expect(gifLoad.atQuality("https://static.klipy.com/a.gif", low)).toBe("https://static.klipy.com/a.gif");
        expect(gifLoad.atQuality(undefined, low)).toBeUndefined();
        expect(gifLoad.atQuality("data:image/gif;base64,AAA", low)).toBe("data:image/gif;base64,AAA");
        expect(gifLoad.atQuality("//media.tenor.com/abcAAAAC/cat.gif", low)).toBe("https://media.tenor.com/abcAAAA1/cat.webp");
        const huge = "https://media.tenor.com/" + "a".repeat(5000) + "AC/x.gif";
        expect(gifLoad.atQuality(huge, low)).toBe(huge);
        const started = Date.now();
        gifLoad.atQuality("https://media.giphy.com/media/" + "a/".repeat(1000) + "x", low);
        gifLoad.atQuality("https://media.tenor.com/" + "a".repeat(2000), low);
        expect(Date.now() - started).toBeLessThan(200);
    });

    test("what a changed link was is remembered, a few hundred at most", () => {
        const memory = new gifLoad.ChangedLinks(3);
        for (let i = 0; i < 5; i++) memory.remember(`new${i}`, { src: `old${i}` });
        expect(memory.original("new0")).toBeUndefined();
        expect(memory.original("new4")).toEqual({ src: "old4" });
        expect(memory.original(5)).toBeUndefined();
        memory.clear();
        expect(memory.original("new4")).toBeUndefined();
    });
});

const { jumboContent } = await import(SRC + "plugins/moreJumboEmoji/jumbo.ts");

describe("MoreJumboEmoji: rows marked jumbo the way Discord marks them", () => {
    const emoji = { type: "emoji", content: ":grinning:", surrogate: "\u{1F600}" };
    const custom = { type: "customEmoji", id: "1", alt: "pepe", src: "https://cdn.discordapp.com/emojis/1.webp?size=64" };
    const space = { type: "text", content: " " };

    test("an emoji-only message up to the limit: every part, spaces too, as Discord 353 does", () => {
        const row = [emoji, space, custom, space, emoji];
        const out = jumboContent(row, 50)!;
        expect(out).toHaveLength(5);
        expect(out.every(node => node.jumboable === true)).toBe(true);
        // Discord's own parts aren't changed in place
        expect((row[0] as any).jumboable).toBeUndefined();
        expect(jumboContent(Array.from({ length: 35 }, () => emoji), 50)!.every(node => node.jumboable)).toBe(true);
    });

    test("over the limit, with any other text, or already jumbo: left as it is", () => {
        expect(jumboContent(Array.from({ length: 51 }, () => emoji), 50)).toBeUndefined();
        expect(jumboContent([emoji, { type: "text", content: "hi" }], 50)).toBeUndefined();
        expect(jumboContent([emoji, { type: "mention", userId: "1" }], 50)).toBeUndefined();
        expect(jumboContent([space, space], 50)).toBeUndefined();
        expect(jumboContent([{ ...emoji, jumboable: true }], 50)).toBeUndefined();
        expect(jumboContent([emoji], 0)).toBeUndefined();
    });

    test("anything that isn't a row's content is left alone", () => {
        for (const value of [undefined, null, "x", 5, {}, [], [null], [5]]) expect(jumboContent(value, 50)).toBeUndefined();
        expect(jumboContent(Array.from({ length: 4001 }, () => emoji), Number.MAX_SAFE_INTEGER)).toBeUndefined();
    });
});

const images = await import(SRC + "plugins/fixImagesQuality/links.ts");

describe("FixImagesQuality", () => {
    const proxied = "https://media.discordapp.net/attachments/111/222/photo.png?ex=aa&is=bb&hm=cc&format=webp&quality=lossless&width=400&height=300";

    test("a message's attached pictures, and its embeds' Discord-hosted pictures, by attachment", () => {
        const found = images.imagesOf({
            attachments: [
                { id: "222", content_type: "image/png", width: 4000, height: 3000 },
                { id: "333", content_type: "video/mp4", width: 1920, height: 1080 },
                { id: "444", filename: "cat.JPG", width: 10, height: 10 },
                { id: 555, content_type: "image/png" },
            ],
            embeds: [{ image: { proxy_url: "https://media.discordapp.net/attachments/1/666/a.png", width: 50, height: 60 } }, { thumbnail: { url: "https://evil.example/attachments/1/777/a.png" } }],
        });
        expect([...found.keys()]).toEqual(["222", "444", "666"]);
        expect(found.get("222")).toEqual({ width: 4000, height: 3000 });
        expect(images.imagesOf(null).size).toBe(0);
        expect(images.imagesOf({ attachments: "x", embeds: {} }).size).toBe(0);
    });

    test("Discord's optimized copy at full size; huge pictures kept to PC's limit", () => {
        expect(images.fullResolution(proxied, { width: 1600, height: 1200 }, false))
            .toBe("https://media.discordapp.net/attachments/111/222/photo.png?ex=aa&is=bb&hm=cc&format=webp&quality=lossless");
        expect(images.fullResolution(proxied, { width: 4000, height: 3000 }, false))
            .toBe("https://media.discordapp.net/attachments/111/222/photo.png?ex=aa&is=bb&hm=cc&format=webp&quality=lossless&width=1789&height=1342");
        expect(images.fullResolution(proxied, { width: 0, height: 0 }, false))
            .toBe("https://media.discordapp.net/attachments/111/222/photo.png?ex=aa&is=bb&hm=cc&format=webp&quality=lossless");
    });

    test("the original file from Discord's CDN, keeping only what makes the link valid", () => {
        expect(images.fullResolution(proxied, { width: 4000, height: 3000 }, true)).toBe("https://cdn.discordapp.com/attachments/111/222/photo.png?ex=aa&is=bb&hm=cc");
        expect(images.fullResolution("https://media.discordapp.net/attachments/111/222/photo.png", undefined, true)).toBe("https://cdn.discordapp.com/attachments/111/222/photo.png");
    });

    test("only Discord's proxied attachment links are changed", () => {
        expect(images.proxiedAttachmentId(proxied)).toBe("222");
        expect(images.proxiedAttachmentId("https://cdn.discordapp.com/attachments/111/222/photo.png")).toBeUndefined();
        expect(images.proxiedAttachmentId("https://media.discordapp.net/external/abc/https/x.png")).toBeUndefined();
        expect(images.proxiedAttachmentId("https://media.discordapp.net.evil.com/attachments/1/2/a.png")).toBeUndefined();
        expect(images.fullResolution("https://example.com/a.png?width=5", undefined, true)).toBe("https://example.com/a.png?width=5");
    });

    test("row data is copied only where it changed, within limits", () => {
        const shared = { kept: { url: "https://example.com/a.png" } };
        const row = { attachments: [{ url: proxied, other: shared }], avatar: "https://cdn.discordapp.com/avatars/1/a.png" };
        const mapped = images.mapStrings(row, (s: string) => s === proxied ? "changed" : s);
        expect(mapped).not.toBe(row);
        expect(mapped.attachments[0].url).toBe("changed");
        expect(mapped.attachments[0].other).toBe(shared);
        expect(row.attachments[0].url).toBe(proxied);
        expect(images.mapStrings(row, (s: string) => s)).toBe(row);
        // Deep or huge data stops being looked at, rather than taking long
        let deep: any = { url: proxied };
        for (let i = 0; i < 50; i++) deep = { next: deep };
        expect(images.mapStrings(deep, () => "changed")).toBe(deep);
        const wide = Array.from({ length: 10000 }, () => proxied);
        const result = images.mapStrings(wide, () => "changed", { left: 400 });
        expect(result.filter((s: string) => s === "changed").length).toBe(400);
        // Class instances (Discord's records) are never copied or changed
        class Rec { url = proxied; }
        const rec = new Rec();
        expect(images.mapStrings({ rec }, () => "changed").rec).toBe(rec);
        const hostile = JSON.parse(`{"__proto__": {"url": "${proxied}"}, "a": "${proxied}"}`);
        const safe = images.mapStrings(hostile, () => "changed");
        expect(safe.a).toBe("changed");
        expect(Object.getPrototypeOf(safe)).toBe(Object.prototype);
    });
});

const emojiOrder = await import(SRC + "plugins/favEmojiFirst/order.ts");

describe("FavoriteEmojiFirst", () => {
    const list = ["a", "b", "fav1", "c", "fav2", "d"];
    const isFavorite = (e: string) => e.startsWith("fav");

    test("favorites first, each group in Discord's order", () => {
        expect(emojiOrder.favoritesFirst(list, isFavorite)).toEqual(["fav1", "fav2", "a", "b", "c", "d"]);
        expect(emojiOrder.favoritesFirst(["x"], () => { throw new Error("broken"); })).toEqual(["x"]);
    });

    test("every shape Discord uses, cut back to as many as it asked for", () => {
        expect(emojiOrder.reorderResult(list, 3, isFavorite)).toEqual(["fav1", "fav2", "a"]);
        expect(emojiOrder.reorderResult({ emojis: list, other: 1 }, 2, isFavorite)).toEqual({ emojis: ["fav1", "fav2"], other: 1 });
        expect(emojiOrder.reorderResult({ emojis: { unlocked: list, locked: ["l1", "l2", "l3"] } }, 8, isFavorite))
            .toEqual({ emojis: { unlocked: ["fav1", "fav2", "a", "b", "c", "d"], locked: ["l1", "l2"] } });
        expect(emojiOrder.reorderResult({ emojis: { unlocked: list } }, Infinity, isFavorite)).toEqual({ emojis: { unlocked: ["fav1", "fav2", "a", "b", "c", "d"] } });
    });

    test("an unknown shape is reported, not guessed at", () => {
        expect(emojiOrder.reorderResult(undefined, 5, isFavorite)).toBeUndefined();
        expect(emojiOrder.reorderResult({ results: [] }, 5, isFavorite)).toBeUndefined();
        expect(emojiOrder.reorderResult({ emojis: { locked: [] } }, 5, isFavorite)).toBeUndefined();
    });
});

const line = await import(SRC + "plugins/moreStickers/line.ts");

const previewAttr = (data: Record<string, unknown>) => JSON.stringify(data).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const cdn = (id: string, file = "sticker.png") => `https://stickershop.line-scdn.net/stickershop/v1/sticker/${id}/android/${file};compress=true`;

const stickerPage = `<!DOCTYPE html><html><body>
<div class="mdCMN38Img" ref="mainImage" data-preview="${previewAttr({ type: "static", id: "777", staticUrl: cdn("777", "main.png") })}"></div>
<p class="mdCMN38Item01Ttl" data-test="sticker-name-title">Brown &amp; Cony</p>
<a data-test="sticker-author" href="/stickershop/author/1">LINE</a>
<ul>
<li class="mdCMN09Li FnStickerPreviewItem" data-test="sticker-item" data-preview="${previewAttr({ type: "animation", id: "1", staticUrl: cdn("1"), animationUrl: cdn("1", "sticker_animation@2x.png") })}"></li>
<li class="mdCMN09Li FnStickerPreviewItem" data-test="sticker-item" data-preview="${previewAttr({ type: "static", id: "2", staticUrl: cdn("2") })}"></li>
<li class="mdCMN09Li FnStickerPreviewItem" data-test="sticker-item" data-preview="${previewAttr({ type: "static", id: "2", staticUrl: cdn("2") })}"></li>
<li data-test="sticker-item" data-preview="${previewAttr({ type: "static", id: "3", staticUrl: "https://evil.example/x.png" })}"></li>
<li data-test="sticker-item" data-preview="${previewAttr({ type: "static", id: "../4", staticUrl: cdn("4") })}"></li>
<li data-test="sticker-item" data-preview="not json"></li>
</ul></body></html>`;

describe("MoreStickers", () => {
    test("LINE store links, and only those", () => {
        expect(line.parsePackUrl("https://store.line.me/stickershop/product/1234/en")).toEqual({ kind: "sticker", id: "1234" });
        expect(line.parsePackUrl(" https://store.line.me/emojishop/product/5a7b/ja?x=1 ")).toEqual({ kind: "emoji", id: "5a7b" });
        expect(line.parsePackUrl("https://store.line.me/stickershop/product/1234")).toEqual({ kind: "sticker", id: "1234" });
        expect(line.parsePackUrl("https://store.line.me.evil.com/stickershop/product/1/en")).toBeUndefined();
        expect(line.parsePackUrl("http://store.line.me/stickershop/product/1/en")).toBeUndefined();
        expect(line.parsePackUrl("https://store.line.me/stickershop/product/../../x")).toBeUndefined();
        expect(line.storeUrl("emoji", "5a7b")).toBe("https://store.line.me/emojishop/product/5a7b/en");
    });

    test("a sticker pack page: its title, its picture and its stickers, once each", () => {
        const pack = line.parsePackPage(stickerPage, "sticker", "777");
        expect(pack.id).toBe("line:sticker:777");
        expect(pack.title).toBe("Brown & Cony");
        expect(pack.logo).toBe(cdn("777", "main.png"));
        expect(pack.stickers).toEqual([{ id: "1", image: cdn("1", "sticker_animation@2x.png") }, { id: "2", image: cdn("2") }]);
        expect(line.isPack(pack)).toBe(true);
    });

    test("an emoji pack page", () => {
        const page = `<p data-test="emoji-name-title">Cats</p>
<li class="mdCMN09Li FnStickerPreviewItem" data-preview="${previewAttr({ type: "static", id: "001", staticUrl: "https://stickershop.line-scdn.net/sticonshop/v1/sticon/abc/android/001.png" })}"></li>`;
        const pack = line.parsePackPage(page, "emoji", "abc");
        expect(pack.title).toBe("Cats");
        expect(pack.stickers.map((s: any) => s.id)).toEqual(["001"]);
        expect(pack.logo).toBe(pack.stickers[0].image);
    });

    test("a page that isn't a pack, or is too big, is refused", () => {
        expect(() => line.parsePackPage("<html><body>Not found</body></html>", "sticker", "1")).toThrow();
        expect(() => line.parsePackPage("x".repeat(line.MAX_PAGE + 1), "sticker", "1")).toThrow();
        expect(() => line.parsePackPage(stickerPage, "emoji", "777")).not.toThrow();
    });

    test("hostile pages take no time and can't add other pictures", () => {
        const started = Date.now();
        expect(() => line.parsePackPage("<a" + " data-preview=".repeat(200000), "sticker", "1")).toThrow();
        expect(() => line.parsePackPage("<".repeat(1_000_000), "sticker", "1")).toThrow();
        expect(() => line.parsePackPage(`<li data-test="sticker-item" data-preview="${"&quot;".repeat(400000)}">`, "sticker", "1")).toThrow();
        expect(Date.now() - started).toBeLessThan(1500);
        const many = Array.from({ length: 600 }, (_, i) => `<li data-test="sticker-item" data-preview="${previewAttr({ id: String(i), staticUrl: cdn(String(i)) })}"></li>`).join("");
        expect(line.parsePackPage(many, "sticker", "1").stickers.length).toBe(line.MAX_STICKERS);
    });

    test("only pictures on LINE's sticker servers", () => {
        expect(line.isLineImage(cdn("1"))).toBe(true);
        expect(line.isLineImage("https://line-scdn.net/a.png")).toBe(true);
        expect(line.isLineImage("https://evil-line-scdn.net/a.png")).toBe(false);
        expect(line.isLineImage("https://line-scdn.net.evil.com/a.png")).toBe(false);
        expect(line.isLineImage("http://stickershop.line-scdn.net/a.png")).toBe(false);
        expect(line.isLineImage("https://stickershop.line-scdn.net/a\".png")).toBe(false);
        expect(line.isLineImage("https://stickershop.line-scdn.net/a b.png")).toBe(false);
        expect(line.isPack({ id: "x", title: "y", logo: "https://evil.example/a.png", stickers: [] })).toBe(false);
        expect(line.isPack({ id: "x", title: "y", logo: cdn("1"), stickers: [{ id: "1", image: "javascript:1" }] })).toBe(false);
    });

    test("HTML's character references", () => {
        expect(line.decodeEntities("&quot;a&quot; &amp; &#39;b&#x27; &lt;&gt; &bogus; &#0; &#xD800;")).toBe("\"a\" & 'b' <> &bogus; &#0; &#xD800;");
        expect(line.decodeEntities("&#128512;")).toBe("😀");
    });
});

const reactions = await import(SRC + "plugins/reactionTimestamps/times.ts");

describe("ReactionTimestamps", () => {
    const heart = { id: null, name: "❤️" };
    const custom = { id: "555", name: "pog", animated: true };

    test("reactions are noted and listed oldest first", () => {
        const times = new reactions.ReactionTimes();
        times.remember("1", "10", "100", heart, 2000);
        times.remember("1", "10", "200", custom, 1000);
        times.remember("1", "11", "100", heart, 3000);
        expect(times.has("1", "10")).toBe(true);
        expect(times.has("1", "12")).toBe(false);
        expect(times.of("1", "10").map((r: any) => r.userId)).toEqual(["200", "100"]);
        const text = reactions.describeTimes(times.of("1", "10"), (id: string) => `user${id}`, (at: number) => `t${at}`);
        expect(text).toBe(":pog:  user200 · t1000\n❤️  user100 · t2000");
    });

    test("removed reactions are forgotten: one, an emoji's, or all", () => {
        const times = new reactions.ReactionTimes();
        times.remember("1", "10", "100", heart);
        times.remember("1", "10", "200", heart);
        times.remember("1", "10", "300", custom);
        times.forget("1", "10", "100", { name: "❤️" });
        expect(times.of("1", "10").length).toBe(2);
        times.forgetAll("1", "10", { id: "555", name: "pog" });
        expect(times.of("1", "10").map((r: any) => r.userId)).toEqual(["200"]);
        times.forgetAll("1", "10");
        expect(times.has("1", "10")).toBe(false);
    });

    test("only the newest are kept, and anything odd is ignored", () => {
        const times = new reactions.ReactionTimes(3);
        for (let i = 0; i < 5; i++) times.remember("1", String(i), "100", heart, i);
        expect(times.size).toBe(3);
        expect(times.has("1", "0")).toBe(false);
        expect(times.has("1", "4")).toBe(true);
        times.remember("1:2", "3", "100", heart);
        times.remember("1", "3", "100", "not an emoji");
        times.remember(undefined, "3", "100", heart);
        expect(times.size).toBe(3);
        const long = new reactions.ReactionTimes();
        long.remember("1", "2", "3", { name: "x".repeat(10000), id: "not-an-id" });
        expect(reactions.emojiLabel(long.of("1", "2")[0].emoji).length).toBe(64);
    });
});

describe("BetterGifLoad: what's a video", () => {
    test("by the link's name, also behind Discord's proxy", () => {
        expect(gifLoad.isVideoLink("https://media.tenor.com/aP3/x.mp4")).toBe(true);
        expect(gifLoad.isVideoLink("https://images-ext-1.discordapp.net/external/S/https/media.tenor.com/aP3/x.webm")).toBe(true);
        expect(gifLoad.isVideoLink("https://media.discordapp.net/attachments/1/2/a.mov?ex=1")).toBe(true);
        expect(gifLoad.isVideoLink("https://media.tenor.com/aAx/x.webp")).toBe(false);
        expect(gifLoad.isVideoLink(undefined)).toBe(false);
    });
});
