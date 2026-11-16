// The bundle never prints to a terminal. The DevTools client's serializer (@revenge-mod/devtools-shared) imports chalk
// only to color what Node's inspect prints on the DevTools server, which never happens on the phone: chalk, with its
// terminal and environment checks, stays out of the bundle, and anything asked of it gives the text back as it is.
const paint: any = new Proxy((...text: unknown[]) => text.join(" "), { get: (_, key) => key === "default" ? paint : paint });

export default paint;
