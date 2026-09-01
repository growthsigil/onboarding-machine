/**
 * CONNECT GOOGLE (start) — OPTIONAL one-time "click Allow" so briefs get filed
 * as Google Docs. Open in a browser:
 *   https://YOUR-APP-URL/api/connect-google?k=YOUR-ACCESS-KEY
 * Skip this entirely and briefs still land at /briefs (and on Telegram if set).
 */
import { NextRequest, NextResponse } from "next/server";
import { keyOk, accessKey } from "@/lib/access";
import { googleCreds } from "@/lib/google";

export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { cid } = googleCreds();
  if (!cid) {
    return NextResponse.json(
      { ok: false, error: "google_oauth_not_configured", detail: "Set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET (see README)." },
      { status: 400 }
    );
  }

  const redirectUri = `${baseUrl(req)}/api/connect-google/callback`;
  const scope = ["https://www.googleapis.com/auth/drive.file", "openid", "email"].join(" ");
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: cid,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope,
      state: accessKey(),
    }).toString();

  return NextResponse.redirect(url);
}
