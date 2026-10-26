/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { Button, Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";

export interface LogEntry {
    key: string;
    label: string;
    subLabel?: string;
    icon?: string;
    onPress?: () => void;
}

/** A list of things a plugin recorded, newest first, for its settings page */
export default function LogList({ title, entries, empty, onClear }: { title: string; entries: LogEntry[]; empty: string; onClear?: () => void; }) {
    return <Stack spacing={8}>
        <TableRowGroup title={title}>
            {entries.length
                ? entries.map(e => <TableRow
                    key={e.key}
                    label={e.label}
                    subLabel={e.subLabel}
                    arrow={!!e.onPress}
                    icon={e.icon ? <TableRow.Icon source={findAssetId(e.icon)!} /> : undefined}
                    onPress={e.onPress}
                />)
                : <TableRow label={<Text variant="text-md/medium" color="text-muted">{empty}</Text>} />}
        </TableRowGroup>
        {onClear && entries.length > 0 && <Button text={t("Clear")} variant="secondary" icon={findAssetId("TrashIcon")} onPress={onClear} />}
    </Stack>;
}
