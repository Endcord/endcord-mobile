import { isWebLink } from "@lib/utils/externalLinks";

/**
 * Whether text is an http or https link. Without URL, which React Native only partly implements: reading its protocol
 * throws there, which drawing a dialog with this would have done.
 */
export default function isValidHttpUrl(input: string) {
    return isWebLink(input) && !/\s/.test(input.trim());
}
