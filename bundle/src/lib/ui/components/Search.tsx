import { Strings } from "@core/i18n";
import { findAssetId } from "@lib/api/assets";
import { findByFilePath } from "@metro";
import { TextInput } from "@metro/common/components";
import { resolveSemanticColor, semanticColorOf } from "@ui/color";
import ErrorBoundary from "@ui/components/ErrorBoundary";
import { Image, View, ViewStyle } from "react-native";

export interface SearchProps {
    onChangeText?: (v: string) => void;
    placeholder?: string;
    style?: ViewStyle;
    isRound?: boolean;
}

/** Discord's own magnifying glass, which takes the theme's icon color; the plain asset image is the fallback */
function SearchIcon(props: Record<string, unknown>) {
    const Icon = findByFilePath("design/components/Icon/native/redesign/generated/MagnifyingGlassIcon.tsx")?.MagnifyingGlassIcon;
    if (typeof Icon === "function" || typeof Icon?.type === "function" || typeof Icon?.render === "function") return <Icon size="sm" {...props} />;
    const color = semanticColorOf("ICON_DEFAULT", "INTERACTIVE_NORMAL", "TEXT_DEFAULT");
    return <Image style={{ width: 16, height: 16, tintColor: color ? resolveSemanticColor(color) : undefined }} source={findAssetId("MagnifyingGlassIcon")!} />;
}

export default ({ onChangeText, placeholder, style, isRound }: SearchProps) => {
    const [query, setQuery] = React.useState("");

    const onChange = (value: string) => {
        setQuery(value);
        onChangeText?.(value);
    };

    return <ErrorBoundary>
        <View style={style}>
            <TextInput
                grow={true}
                isClearable={true}
                leadingIcon={SearchIcon}
                placeholder={placeholder ?? Strings.SEARCH}
                onChange={onChange}
                returnKeyType="search"
                size="md"
                autoCapitalize="none"
                autoCorrect={false}
                isRound={isRound}
                value={query}
            />
        </View>
    </ErrorBoundary>;
};
