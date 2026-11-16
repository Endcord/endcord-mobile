/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Endcord PC keeps its downloads from becoming a way into the computer or its network (src/main/utils/http.ts there):
 * the same private address ranges, for the links Endcord downloads from here. React Native has no CORS, so without this
 * a link in a message or in someone else's backup could make the phone fetch from its router or from a service on the
 * phone itself.
 *
 * Only addresses written out in a link are recognised: a name that resolves to a private address can't be told apart
 * from JavaScript, which has no DNS lookup of its own.
 */

/** An IPv4 address the way the system resolver reads one, also in its short and hex forms (127.1, 0x7f.1, 2130706433) */
export function ipv4ToNumber(host: string): number | null {
    const parts = host.split(".");
    if (!parts.length || parts.length > 4 || !parts.every(p => /^(?:0x[0-9a-f]*|0[0-7]*|[1-9]\d*)$/i.test(p))) return null;
    const numbers = parts.map(p => /^0x/i.test(p) ? parseInt(p.slice(2) || "0", 16) : /^0\d/.test(p) ? parseInt(p, 8) : Number(p));
    const last = numbers.pop()!;
    if (numbers.some(n => n > 255) || last >= 2 ** (8 * (4 - numbers.length))) return null;
    return numbers.reduce((sum, n, i) => sum + n * 2 ** (24 - 8 * i), 0) + last;
}

/** An IPv6 address as its eight 16-bit groups, or null when it isn't one */
export function ipv6Groups(address: string): number[] | null {
    let host = address.toLowerCase().split("%")[0];
    // An IPv4 address at the end stands for the last two groups
    const embedded = /^(.*:)([^:]+\.[^:]+)$/.exec(host);
    if (embedded) {
        const v4 = ipv4ToNumber(embedded[2]);
        if (v4 == null || !/^\d+\.\d+\.\d+\.\d+$/.test(embedded[2])) return null;
        host = `${embedded[1]}${(Math.floor(v4 / 65536)).toString(16)}:${(v4 % 65536).toString(16)}`;
    }
    const halves = host.split("::");
    if (halves.length > 2) return null;
    const parse = (s: string) => s ? s.split(":").map(g => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN) : [];
    const head = parse(halves[0]), tail = halves.length === 2 ? parse(halves[1]) : [];
    const missing = 8 - head.length - tail.length;
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
    const groups = [...head, ...Array<number>(halves.length === 2 ? missing : 0).fill(0), ...tail];
    return groups.some(Number.isNaN) ? null : groups;
}

// Endcord PC's lists, unchanged
const V4: Array<readonly [number, number]> = ([
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const).map(([network, prefix]) => [ipv4ToNumber(network)!, prefix] as const);
// 64:ff9b:: (NAT64), 2002:: (6to4) and 2001:: (Teredo) carry an IPv4 address inside, which is how 127.0.0.1 gets past
// an IPv4 list
const V6: Array<readonly [number[], number]> = ([
    ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16],
    ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const).map(([network, prefix]) => [ipv6Groups(network)!, prefix] as const);

const inV4 = (ip: number) => V4.some(([network, prefix]) => Math.floor(ip / 2 ** (32 - prefix)) === Math.floor(network / 2 ** (32 - prefix)));
const inV6 = (groups: number[]) => V6.some(([network, prefix]) => network.every((n, i) => {
    const bits = Math.min(16, Math.max(0, prefix - 16 * i));
    return bits === 0 || groups[i] >> (16 - bits) === n >> (16 - bits);
}));

/** Full-width digits and dots, which the system turns into plain ones before connecting */
const asciiHost = (host: string) => host
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 48))
    .replace(/[。．｡]/g, ".");

/**
 * Whether a host is this phone or its network: localhost, or an address in one of the private, loopback, link-local,
 * shared or reserved ranges, however it's written. A host that looks like an IPv6 address but isn't one counts too.
 */
export function isPrivateHost(hostname: string): boolean {
    let host = hostname.trim().replace(/^\[|\]$/g, "");
    try {
        host = decodeURIComponent(host);
    } catch {
        return true;
    }
    host = asciiHost(host.toLowerCase()).replace(/\.$/, "");
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    const v4 = ipv4ToNumber(host);
    if (v4 != null) return inV4(v4);
    if (!host.includes(":")) return false;
    const groups = ipv6Groups(host);
    if (!groups) return true;
    // ::ffff:a.b.c.d is an IPv4 address
    if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) return inV4(groups[6] * 65536 + groups[7]);
    return inV6(groups);
}

/**
 * The host an http or https link connects to, or undefined when it can't be read. Like a browser: the last @ ends the
 * user name and password, and a backslash, a space or a control character in that part makes it no link at all here.
 */
export function hostOf(url: string): string | undefined {
    const match = /^https?:\/\/([^/?#]*)/i.exec(url);
    if (!match || /[\s\\\0-\x1f\x7f]/.test(match[1])) return undefined;
    let authority = match[1];
    const at = authority.lastIndexOf("@");
    if (at !== -1) authority = authority.slice(at + 1);
    if (authority.startsWith("[")) {
        const end = authority.indexOf("]");
        if (end === -1) return undefined;
        return authority.slice(0, end + 1);
    }
    return authority.split(":")[0] || undefined;
}

/** Whether a link points at this phone or its network, or can't be read well enough to tell */
export function isPrivateUrl(url: string): boolean {
    const host = hostOf(url);
    return host === undefined || isPrivateHost(host);
}
