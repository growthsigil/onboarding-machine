/**
 * SETUP CHECK — open this to see exactly what's wired up and what's missing:
 *   https://YOUR-APP-URL/api/setup-check?k=YOUR-ACCESS-KEY
 * Core must be green; Google, Telegram and the poller are all optional.
 */
import { NextRequest, NextResponse } from "next/server";
import { keyOk } from "@/lib/access";
import { supabase } from "@/lib/supabase";
import { googleConfigured, googleConnected } from "@/lib/google";
import { telegramConfigured } from "@/lib/telegram";
import { fathomConfigured } from "@/lib/fathom-api";
import { paidKeywords } from "@/lib/fathom";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let databaseReachable = false;
  let briefsStored: number | null = null;
  try {
    const { count, error } = await supabase.from("briefs").select("id", { count: "exact", head: true });
    databaseReachable = !error;
    briefsStored = count ?? 0;
  } catch {
    databaseReachable = false;
  }

  const keywords = paidKeywords();
  const core = {
    anthropic_key: !!process.env.ANTHROPIC_API_KEY,
    supabase_env: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    database_reachable: databaseReachable,
    access_key_set: !!process.env.ACCESS_KEY,
    app_url_set: !!process.env.NEXT_PUBLIC_BASE_URL,
  };
  const ready = core.anthropic_key && core.supabase_env && core.database_reachable && core.access_key_set;

  return NextResponse.json({
    ok: true,
    ready,
    core,
    paid_gate: { keywords, active: keywords.length > 0 },
    google_docs_optional: {
      configured: googleConfigured(),
      connected: await googleConnected().catch(() => false),
    },
    telegram_optional: { configured: telegramConfigured() },
    poller_optional: {
      fathom_api_key: fathomConfigured(),
      keywords_set: keywords.length > 0,
      active: fathomConfigured() && keywords.length > 0,
    },
    briefs_stored: briefsStored,
    next: ready
      ? "You're live. Send a test call (see the README's Test step)."
      : "Fill the missing core items above (Anthropic, Supabase, ACCESS_KEY), then redeploy.",
  });
}
