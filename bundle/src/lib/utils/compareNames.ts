// One collator for every sort by name: Hermes builds a new one on each String.prototype.localeCompare call, which made
// sorting Endcord's 300 plugins take 50 ms, and the plugin list sorts again on every keystroke of a search
let collator: Intl.Collator | undefined;

/** Compares two names as people read them: in the device's language, ignoring case and accents, numbers by value */
export default function compareNames(a: string, b: string) {
    collator ??= new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    return collator.compare(a, b);
}
