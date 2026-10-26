import { defineCorePlugin } from "..";
import patchForumPost from "./forumPost";
import patchUrl from "./url";

let patches = [] as (() => unknown)[];

export default defineCorePlugin({
    manifest: {
        id: "bunny.quickinstall",
        spec: 3,
        type: "plugin",
        main: "",
        version: "1.0.0",
        display: {
            name: "QuickInstall",
            description: "Quickly install Vendetta plugins and themes",
            authors: [{ name: "Vendetta Team" }]
        }
    },
    start() {
        patches = [patchForumPost(), patchUrl()];
    },
    stop() {
        patches.forEach(p => p());
    }
});
