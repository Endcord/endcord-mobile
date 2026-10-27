/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { currentUserId, getStore } from "../common";
import { botMessage, command } from "../hooks";

interface NowPlaying {
    trackId?: string | null;
    albumId?: string | null;
    artistId?: string | null;
}

/** What you're playing on Spotify, from Discord's Spotify store or your presence on another device */
function nowPlaying(): NowPlaying | undefined {
    const track = getStore("SpotifyStore")?.getTrack?.();
    if (track) return { trackId: track.id, albumId: track.album?.id, artistId: track.artists?.[0]?.id };
    const me = currentUserId();
    const activities: any[] = (me && getStore("PresenceStore")?.getActivities?.(me)) || [];
    const spotify = activities.find(a => a?.type === 2 && (a.party?.id?.startsWith("spotify:") || a.name === "Spotify"));
    if (!spotify) return;
    return { trackId: spotify.sync_id, albumId: spotify.metadata?.album_id, artistId: spotify.metadata?.artist_ids?.[0] };
}

export default definePlugin({
    id: "endcord.spotify-share-commands",
    name: "SpotifyShareCommands",
    description: tx("Share your current Spotify track, album or artist via slash command (/track, /album, /artist)"),
    authors: [ENDCORD_AUTHOR],
    icon: "SpotifyNeutralIcon",
    tags: ["Media"],
    start({ cleanup }) {
        const kinds = [
            ["track", tx("Share your current Spotify track in chat"), (n: NowPlaying) => n.trackId && `https://open.spotify.com/track/${n.trackId}`],
            ["album", tx("Share your current Spotify album in chat"), (n: NowPlaying) => n.albumId && `https://open.spotify.com/album/${n.albumId}`],
            ["artist", tx("Share your current Spotify artist in chat"), (n: NowPlaying) => n.artistId && `https://open.spotify.com/artist/${n.artistId}`],
        ] as const;
        for (const [name, description, url] of kinds) {
            cleanup(command({
                name,
                description,
                options: [{ name: "message", description: tx("Text to send with it") }],
                run: ({ message }, ctx) => {
                    const playing = nowPlaying();
                    if (!playing) {
                        botMessage(ctx.channel.id, t("You're not listening to any music."));
                        return;
                    }
                    const link = url(playing);
                    if (!link) {
                        botMessage(ctx.channel.id, t("Failed to find the track on spotify."));
                        return;
                    }
                    return message ? `${message} ${link}` : link;
                },
            }));
        }
    },
});
