/**
 * Google auth (OPTIONAL feature) — mints a short-lived access token from the
 * refresh token that /api/connect-google stored in app_state. If Google was
 * never connected, everything here returns null and the app just skips the Doc.
 */
import { getState } from "@/lib/supabase";

const REFRESH_KEY = "google_refresh_token";

export function googleCreds(): { cid: string; secret: string } {
  return {
    cid: (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim(),
    secret: (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim(),
  };
}

/** True when both the OAuth app creds are set — i.e. Google *can* be connected. */
export function googleConfigured(): boolean {
  const { cid, secret } = googleCreds();
  return !!cid && !!secret;
}

/** True when an account has actually been connected (a refresh token exists). */
export async function googleConnected(): Promise<boolean> {
  return !!(await getState(REFRESH_KEY));
}

export async function accessToken(): Promise<string | null> {
  const { cid, secret } = googleCreds();
  if (!cid || !secret) return null;
  const refresh = await getState(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cid,
        client_secret: secret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}
