/**
 * Access key — the one shared secret that guards every endpoint.
 *
 * You invent it once (ACCESS_KEY env) and it goes on the end of your webhook /
 * poller / viewer URLs as ?k=... . Treat it like a password.
 */
import type { NextRequest } from "next/server";

export function accessKey(): string {
  return (process.env.ACCESS_KEY || "").trim();
}

/** True when the request carries the right ?k= (and a key is actually set). */
export function keyOk(req: NextRequest): boolean {
  const key = accessKey();
  if (!key) return false;
  return req.nextUrl.searchParams.get("k") === key;
}
