// Formatters kept by their options: Date.prototype.toLocaleTimeString and the like build a new one on every call in
// Hermes, which on a slow phone costs about a millisecond, for each message row that shows a time
const formats = new Map<string, Intl.DateTimeFormat>();

/** A date or time in the device's language, as Date.prototype.toLocaleString would with these options */
export default function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions) {
    const key = JSON.stringify(options);
    let format = formats.get(key);
    if (!format) formats.set(key, format = new Intl.DateTimeFormat(undefined, options));
    return format.format(date);
}
