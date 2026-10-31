/**
 * Why do we need this exactly? It's simple, to fight the side effects caused by when you
 * initialize modules not in the right time or when you're not supposed to.
 * Back then, we had major bugs like the mixing of light and dark themes and AMOLED option getting ignored.
 * Nowadays, there are only three which I can spot: Hindi timestamps, crashing on some native components and slower startup time.
 * - @pylixonly
 */

import { after } from "@lib/api/patcher";
import { logger } from "@lib/utils/logger";
import { FluxDispatcher } from "@metro/common";
import { ButtonModule } from "@metro/common/components";
import { patchWhenLoaded } from "@metro/lazy";
import moment from "moment";
import { cloneElement, isValidElement, ReactNode } from "react";
import { Platform, StyleSheet, Text } from "react-native";

function onDispatch({ locale }: { locale: string; }) {
    // Timestamps
    try {
        moment.locale(locale.toLowerCase());
    } catch (e) {
        logger.error("Failed to fix timestamps...", e);
    }

    // We're done here!
    FluxDispatcher.unsubscribe("I18N_LOAD_SUCCESS", onDispatch);
}

/**
 * The label in a button's element tree, given room above it when its line is as tall as its letters: Android then cuts
 * off what reaches above the capitals, so Turkish "İptal" read "Iptal" and "Özel" read "Ozel". The room is taken back
 * with a negative margin, so the button's layout doesn't change.
 */
function withRoomAboveLabel(node: ReactNode, depth = 0): ReactNode {
    if (depth > 6 || !isValidElement<any>(node)) return node;
    const { style, children } = node.props;

    if (node.type === Text) {
        const flat = StyleSheet.flatten(style);
        if (flat?.includeFontPadding !== false || typeof flat.fontSize !== "number" || typeof flat.lineHeight !== "number") return node;
        if (flat.lineHeight > flat.fontSize * 1.1) return node;
        const room = Math.ceil(flat.fontSize * 0.3);
        return cloneElement(node, { style: [style, { paddingTop: room, marginTop: -room }] });
    }

    if (children == null) return node;
    const fixed = Array.isArray(children) ? children.map(child => withRoomAboveLabel(child, depth + 1)) : withRoomAboveLabel(children, depth + 1);
    const changed = Array.isArray(children) ? (fixed as ReactNode[]).some((child, i) => child !== children[i]) : fixed !== children;
    return changed ? cloneElement(node, { children: fixed }) : node;
}

export default () => {
    FluxDispatcher.subscribe("I18N_LOAD_SUCCESS", onDispatch);

    // includeFontPadding is Android's; iOS has nothing to fix, and its Button isn't a plain function
    if (Platform.OS !== "android") return;

    // Patched as Discord's button module loads, so the modules that hand its button on take the fixed one
    return patchWhenLoaded(ButtonModule, module => after("Button", module, (_, ret) => withRoomAboveLabel(ret)));
};
