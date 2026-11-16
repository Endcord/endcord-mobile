/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * AWS Signature Version 4 for FileUpload's S3-compatible uploads, in plain JavaScript (Hermes has no WebCrypto), as
 * AWS describes it: https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html. Endcord PC hashes the
 * whole file into the signature; a phone streams the file instead, so the body is sent as UNSIGNED-PAYLOAD, which S3,
 * Cloudflare R2, MinIO, Backblaze B2 and Wasabi take over https. Checked against AWS's published examples in the tests.
 */

import { hex, hmac, sha256, utf8 } from "../crypto";

/** The body isn't part of the signature: the file is streamed, not read to be hashed */
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

export interface SigningRequest {
    method: string;
    /** The path, each segment already encoded (see encodePath) */
    path: string;
    /** The query, already in canonical form (sorted, encoded); empty for none */
    query?: string;
    /** Every header that's signed, host and x-amz-date among them */
    headers: Record<string, string>;
    /** The body's lowercase hex SHA-256, or UNSIGNED_PAYLOAD */
    payloadHash: string;
}

export interface Credentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    service: string;
}

/** Encodes a string the way AWS wants in a path or query: everything but A-Z a-z 0-9 - . _ ~ */
export const encodeRfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** A path from its parts, each segment encoded once (S3 doesn't encode twice), like "/bucket/key%20name.png" */
export function encodePath(...parts: string[]): string {
    const segments = parts.flatMap(part => part.split("/")).filter(Boolean).map(encodeRfc3986);
    return segments.length ? `/${segments.join("/")}` : "/";
}

/** 2013-05-24T00:00:00.000Z as 20130524T000000Z */
export const amzDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function canonicalHeaders(headers: Record<string, string>) {
    const entries = Object.entries(headers)
        .map(([name, value]) => [name.toLowerCase().trim(), String(value).trim().replace(/\s+/g, " ")] as const)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return {
        canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(""),
        signed: entries.map(([name]) => name).join(";"),
    };
}

export function canonicalRequest(request: SigningRequest): string {
    const { canonical, signed } = canonicalHeaders(request.headers);
    return [request.method.toUpperCase(), request.path, request.query ?? "", canonical, signed, request.payloadHash].join("\n");
}

/** The key that signs a day's requests for one region and service */
export function signingKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Uint8Array {
    const date = hmac(utf8(`AWS4${secretAccessKey}`), utf8(dateStamp));
    const inRegion = hmac(date, utf8(region));
    const inService = hmac(inRegion, utf8(service));
    return hmac(inService, utf8("aws4_request"));
}

/** The Authorization header for a request; its headers must already hold x-amz-date */
export function sign(request: SigningRequest, credentials: Credentials) {
    const date = Object.entries(request.headers).find(([name]) => name.toLowerCase() === "x-amz-date")?.[1];
    if (!date || !/^\d{8}T\d{6}Z$/.test(date)) throw new Error("x-amz-date is missing");
    const dateStamp = date.slice(0, 8);
    const scope = `${dateStamp}/${credentials.region}/${credentials.service}/aws4_request`;
    const canonical = canonicalRequest(request);
    const stringToSign = ["AWS4-HMAC-SHA256", date, scope, hex(sha256(utf8(canonical)))].join("\n");
    const signature = hex(hmac(signingKey(credentials.secretAccessKey, dateStamp, credentials.region, credentials.service), utf8(stringToSign)));
    const { signed } = canonicalHeaders(request.headers);
    return {
        canonicalRequest: canonical,
        stringToSign,
        signature,
        authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    };
}
