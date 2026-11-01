import { showToast } from "@lib/ui/toasts";
import { logger } from "@lib/utils/logger";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { Platform } from "react-native";

/**
 * Shows how far a screen share on iOS got: the extension runs apart from the app, and while it's on its own the phone
 * says it's sharing with nothing to tell why Discord isn't. No toast at all means the extension never reached the app.
 */
function report(step: string) {
    logger.log(`Screen share: ${step}`);
    showToast(`Screen share: ${step}`);
}

const STREAM_STEPS: Record<string, string> = {
    STREAM_START: "starting the stream",
    STREAM_CREATE: "Discord created the stream",
    STREAM_CLOSE: "stream closed",
    STREAM_DELETE: "stream ended",
};

function watchStreams() {
    for (const [type, step] of Object.entries(STREAM_STEPS)) {
        FluxDispatcher.subscribe(type, (action: any) => {
            report(action.reason ? `${step} (${action.reason})` : step);
        });
    }
}

function watchExtension() {
    FluxDispatcher.unsubscribe("VOICE_CHANNEL_SELECT", watchExtension);

    const emitter = findByProps("VoiceEngineEmitter")?.VoiceEngineEmitter;
    if (!emitter) return logger.error("Screen share check: no VoiceEngineEmitter");

    emitter.addListener("on-broadcast-requested", () => report("the extension reached the app"));
    emitter.addListener("on-broadcast-blocked", () => report("the extension was blocked"));
    emitter.addListener("on-broadcast-finished", () => report("the extension stopped"));
}

export default function initScreenShareCheck() {
    if (Platform.OS !== "ios") return;
    FluxDispatcher.subscribe("VOICE_CHANNEL_SELECT", watchExtension);
    watchStreams();
}
