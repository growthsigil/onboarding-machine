/**
 * INTAKE — the shared "one call → one brief" pipeline, used by both the webhook
 * (instant) and the poller (rename-anytime). Exactly one definition of the work,
 * so the two entry points can't drift.
 *
 * Every output is optional and degrades gracefully:
 *   • the brief is ALWAYS stored (and viewable at /briefs) — the baseline,
 *   • a Google Doc is filed when Google is connected,
 *   • a Telegram ping is sent when Telegram is configured.
 * With neither Google nor Telegram, the app still works — you read briefs at
 * /briefs?k=YOUR-ACCESS-KEY.
 */
import { supabase } from "@/lib/supabase";
import { accessKey } from "@/lib/access";
import {
  extractBrief,
  fallbackBrief,
  briefToHtml,
  briefToTelegram,
  type FathomMeeting,
  type OnboardingBrief,
} from "@/lib/fathom";
import { createBriefDoc } from "@/lib/googleDrive";
import { sendTelegram } from "@/lib/telegram";

// Below this the "transcript" is almost certainly a ping/short clip, not a real
// call — not worth a model call.
export const MIN_TRANSCRIPT_CHARS = 200;

export function toIso(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function docName(brief: OnboardingBrief, meeting: FathomMeeting): string {
  const who = brief.client_name || meeting.attendees[0]?.name || "New client";
  const co = brief.company ? ` (${brief.company})` : "";
  const when = new Date(meeting.recorded_at ? new Date(meeting.recorded_at) : Date.now()).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" }
  );
  return `Onboarding — ${who}${co} — ${when}`;
}

/** Where "Full brief" should point in the Telegram message. */
function briefLink(docUrl: string | null): string | null {
  if (docUrl) return docUrl;
  const appUrl = (process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const key = accessKey();
  return appUrl && key ? `${appUrl}/briefs?k=${encodeURIComponent(key)}` : null;
}

/**
 * Run one meeting through the whole pipeline. Never throws (failures are logged),
 * so a webhook's waitUntil or a cron loop can call it without a guard. Returns
 * whether a new brief row was created.
 */
export async function processCall(meeting: FathomMeeting): Promise<{ created: boolean; reason?: string }> {
  try {
    const brief = (await extractBrief(meeting).catch((e) => {
      console.error("[intake] extractBrief failed:", e);
      return null;
    })) ?? fallbackBrief(meeting);

    const html = briefToHtml(brief, meeting);
    const doc = await createBriefDoc({ name: docName(brief, meeting), html });
    const docUrl = doc.ok ? doc.url : null;
    if (!doc.ok && doc.reason !== "google_not_connected") {
      console.error("[intake] doc not created:", doc.reason);
    }

    const { error } = await supabase.from("briefs").insert({
      source: "fathom",
      external_id: meeting.external_id,
      title: meeting.title,
      client_name: brief.client_name || meeting.attendees[0]?.name || null,
      attendees: meeting.attendees,
      meeting_url: meeting.meeting_url,
      recorded_at: toIso(meeting.recorded_at),
      transcript: meeting.transcript.slice(0, 500_000),
      brief,
      doc_id: doc.ok ? doc.id : null,
      doc_url: docUrl,
    });
    // 23505 = the unique index caught a duplicate we raced past (webhook + poller
    // seeing the same call). The first one already handled everything.
    if (error) {
      if (String((error as { code?: string }).code) === "23505") return { created: false, reason: "duplicate" };
      console.error("[intake] insert brief failed:", error);
      return { created: false, reason: "insert_failed" };
    }

    // Telegram is optional — sendTelegram no-ops when it isn't configured.
    await sendTelegram(briefToTelegram(brief, meeting, briefLink(docUrl)));

    return { created: true };
  } catch (e) {
    console.error("[intake] processCall failed:", e);
    return { created: false, reason: "error" };
  }
}
