import { Author } from "@lib/addons/types";
import { ImageSourcePropType } from "react-native";

interface Badge {
    source: ImageSourcePropType;
    color?: string;
    onPress?: () => void;
}

export interface UnifiedPluginModel {
    id: string;
    name: string;
    description?: string;
    authors?: Author[];
    icon?: string;
    /** Endcord's own plugins, built into the app */
    endcord?: boolean;
    /** Position in Endcord PC's list of popular plugins */
    popular?: number;
    getBadges(): Badge[];
    isEnabled(): boolean;
    usePluginState(): void;
    isInstalled(): boolean;
    toggle(start: boolean): void;
    resolveSheetComponent(): Promise<{ default: React.ComponentType<any>; }>;
    getPluginSettingsComponent(): React.ComponentType<any> | null | undefined;
}
