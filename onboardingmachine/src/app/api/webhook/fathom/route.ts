/**
 * FATHOM WEBHOOK — a sales call ends, this turns it into a brief (instant path).
 * Point Fathom (or Zapier/Make "new recording") at:
 *   https://YOUR-APP-URL/api/webhook/fathom?k=YOUR-ACCESS-KEY
 *
 * Fires the moment a recording is ready. Renamed a call to a paid keyword LATER?
 * The poller (/api/cron/fathom) catches that — see the README.
 */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { keyOk } from "@/lib/access";
import { briefExists } from "@/lib/supabase";
import { parseFathomPayload, paidGate, paidKeywords } from "@/lib/fathom";
import { processCall, MIN_TRANSCRIPT_CHARS } from "@/lib/intake";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const meeting = parseFathomPayload(body);
  if (meeting.transcript.length < MIN_TRANSCRIPT_CHARS) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no_transcript" });
  }

  // PAID GATE — only calls whose title/tag has one of FATHOM_PAID_KEYWORDS become
  // briefs. Unset that env and every call passes (gate off). See lib/fathom.ts.
  const gate = paidGate(meeting);
  if (gate.enabled && !gate.allowed) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "not_paid",
      detail: `title="${meeting.title}" tags=[${meeting.tags.join(", ")}] need one of: ${paidKeywords().join(", ")}`,
    });
  }

  // Dedupe a retried delivery before spending a model call.
  if (meeting.external_id && (await briefExists(meeting.external_id))) {
    return NextResponse.json({ ok: true, ignored: true, reason: "duplicate" });
  }

  waitUntil(processCall(meeting));
  return NextResponse.json({ ok: true, queued: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "onboarding-machine-webhook",
    usage: "POST a Fathom recording payload with ?k=<access-key>",
  });
}
