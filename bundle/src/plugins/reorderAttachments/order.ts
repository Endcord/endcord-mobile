/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * ReorderAttachments' moving, as Endcord PC does it: the files you see move, and Discord's entries that aren't shown
 * (a video's thumbnail) stay in their places.
 */

/** Whether an upload is one of the files shown above the message box */
export const isShown = (upload: any) => !!upload && !upload.isThumbnail;

/** The uploads with the `from`th shown one moved to be the `to`th, or the same list when that's no move */
export function moveUpload<T>(uploads: readonly T[], from: number, to: number, shown: (upload: T) => boolean = isShown): T[] {
    const items = uploads.filter(shown);
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...uploads];
    const moved = [...items];
    moved.splice(to, 0, ...moved.splice(from, 1));
    let next = 0;
    return uploads.map(upload => shown(upload) ? moved[next++] : upload);
}
