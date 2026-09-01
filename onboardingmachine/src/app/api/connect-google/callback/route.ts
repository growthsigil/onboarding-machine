/**
 * CONNECT GOOGLE (callback) — Google redirects here after Allow. Verifies the
 * state carries our access key, exchanges the code, and stores the refresh token
 * in app_state (google_refresh_token). Register this exact URL as an authorized
 * redirect URI on your OAuth client:
 *   https://YOUR-APP-URL/api/connect-google/callback
 */
import { NextRequest, NextResponse } from "next/server";
import { accessKey } from "@/lib/access";
import { googleCreds } from "@/lib/google";
import { setState } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${esc(title)}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1.25rem;line-height:1.5;color:#111">` +
      `<h1 style="font-size:1.4rem">${esc(title)}</h1>${body}</body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const oauthError = sp.get("error");
  if (oauthError) {
    return page("Google connection cancelled", `<p>Google returned: <code>${esc(oauthError)}</code>. Close this tab and open the connect link again to retry.</p>`);
  }

  const code = sp.get("code");
  const state = sp.get("state");
  const key = accessKey();
  if (!key || state !== key) {
    return page("Couldn't verify this request", `<p>The security check didn't match. Open the connect link again with your access key and click Allow.</p>`);
  }
  if (!code) {
    return page("Missing code", `<p>Google didn't send an authorization code. Try the connect link again.</p>`);
  }

  const { cid, secret } = googleCreds();
  if (!cid || !secret) {
    return page("Google OAuth not configured", `<p>Set <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code>, then try again.</p>`);
  }

  const redirectUri = `${baseUrl(req)}/api/connect-google/callback`;
  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cid,
        client_secret: secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return page(
        "Google rejected the connection",
        `<p>Token exchange failed (${resp.status}). The usual cause: this exact redirect URL isn't on your OAuth client's Authorized redirect URIs. It must be:</p>` +
          `<p><code>${esc(redirectUri)}</code></p>` +
          `<pre style="white-space:pre-wrap;background:#f5f5f5;padding:.75rem;border-radius:.5rem">${esc(detail.slice(0, 500))}</pre>`
      );
    }
    const j = (await resp.json()) as { refresh_token?: string; access_token?: string };
    if (!j.refresh_token) {
      return page(
        "Almost there",
        `<p>Google connected but didn't hand back a long-lived token. Open your Google Account → Security → Third-party access, remove this app, then click the connect link once more.</p>`
      );
    }

    let email: string | null = null;
    try {
      if (j.access_token) {
        const u = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { authorization: `Bearer ${j.access_token}` },
        });
        if (u.ok) email = ((await u.json()) as { email?: string }).email ?? null;
      }
    } catch {
      /* email is cosmetic */
    }

    await setState("google_refresh_token", j.refresh_token);
    if (email) await setState("google_account_email", email);

    return page(
      "Google connected ✅",
      `<p>Briefs will now be filed as Google Docs${email ? ` in <strong>${esc(email)}</strong>'s Drive` : ""}, in a folder called <strong>Client Onboarding</strong>. You can close this tab.</p>`
    );
  } catch (e) {
    return page("Something went wrong", `<p><code>${esc((e as Error).message)}</code></p>`);
  }
}
