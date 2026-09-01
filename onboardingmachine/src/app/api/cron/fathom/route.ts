/**
 * FATHOM POLLER — the "rename it anytime" trigger.
 * Fathom's webhook fires once, with the title as it was then. This checks
 * Fathom's API every few minutes for calls you've renamed to a paid keyword and
 * briefs any it hasn't already. Runs on the Supabase cron (see db/schema.sql).
 *
 *   GET /api/cron/fathom?k=YOUR-ACCESS-KEY           → one poll
 *   GET /api/cron/fathom?k=YOUR-ACCESS-KEY&probe=1   → inspect the API (no writes)
 *
 * Needs FATHOM_API_KEY (to read Fathom) and FATHOM_PAID_KEYWORDS (so it doesn't
 * brief your whole account) — without both, it idles.
 */
import { NextRequest, NextResponse } from "next/server";
import { keyOk } from "@/lib/access";
import { parseFathomPayload, paidGate, paidKeywords, type FathomMeeting } from "@/lib/fathom";
import { listRecentMeetings, fathomConfigured } from "@/lib/fathom-api";
import { briefExists } from "@/lib/supabase";
import { processCall, MIN_TRANSCRIPT_CHARS } from "@/lib/intake";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PER_TICK = 5; // new briefs per tick; the rest wait for the next tick
const LOOKBACK_DAYS = 14;

function previewMeeting(m: FathomMeeting) {
  return {
    title: m.title,
    tags: m.tags,
    attendees: m.attendees.length,
    transcript_chars: m.transcript.length,
    external_id: m.external_id,
    recorded_at: m.recorded_at,
    meeting_url: m.meeting_url,
  };
}

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (!fathomConfigured()) {
    return NextResponse.json({ ok: false, error: "no_fathom_api_key", detail: "Set FATHOM_API_KEY (see README)." });
  }

  // PROBE — verify the real API shape/auth without creating anything.
  if (req.nextUrl.searchParams.get("probe")) {
    const list = await listRecentMeetings({ sinceDays: 30 });
    const first = list.meetings[0];
    return NextResponse.json({
      ok: list.ok,
      status: list.status,
      error: list.error,
      keywords: paidKeywords(),
      meetings_returned: list.meetings.length,
      first_meeting_keys: first && typeof first === "object" ? Object.keys(first as object) : null,
      parsed_preview: first ? previewMeeting(parseFathomPayload(first)) : null,
    });
  }

  if (paidKeywords().length === 0) {
    return NextResponse.json({
      ok: true,
      idle: true,
      note: "FATHOM_PAID_KEYWORDS is not set, so the poller idles (it would otherwise brief every meeting). Set it to enable.",
    });
  }

  const list = await listRecentMeetings({ sinceDays: LOOKBACK_DAYS });
  if (!list.ok) {
    return NextResponse.json({ ok: false, stage: "list", status: list.status, error: list.error }, { status: 502 });
  }

  let scanned = 0,
    matched = 0,
    attempted = 0,
    created = 0,
    duplicates = 0,
    tooShort = 0,
    notPaid = 0,
    deferred = 0;

  for (const raw of list.meetings) {
    scanned++;
    const meeting = parseFathomPayload(raw);

    if (meeting.transcript.length < MIN_TRANSCRIPT_CHARS) {
      tooShort++;
      continue;
    }
    const gate = paidGate(meeting);
    if (!gate.enabled || !gate.allowed) {
      notPaid++;
      continue;
    }
    matched++;

    if (await briefExists(meeting.external_id)) {
      duplicates++;
      continue;
    }
    if (attempted >= PER_TICK) {
      deferred++;
      continue;
    }
    attempted++;
    const res = await processCall(meeting);
    if (res.created) created++;
    else if (res.reason === "duplicate") duplicates++;
  }

  return NextResponse.json({
    ok: true,
    scanned,
    matched,
    created,
    duplicates,
    deferred_to_next_tick: deferred,
    skipped_no_transcript: tooShort,
    skipped_not_paid: notPaid,
  });
}
