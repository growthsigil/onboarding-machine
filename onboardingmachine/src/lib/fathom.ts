/**
 * FATHOM SALES-CALL INTAKE — turn a recorded sales call into a structured
 * onboarding brief.
 *
 * The pieces here are deliberately dumb and dependency-light so the webhook
 * route (/api/webhook/fathom) stays a thin orchestrator:
 *   parseFathomPayload  — pull transcript + meeting facts out of whatever shape
 *                         Fathom (or a manual curl) sends, defensively.
 *   extractBrief        — one Claude call that sorts the transcript into the
 *                         fixed OnboardingBrief shape (strict JSON out).
 *   briefToHtml         — render the brief as a clean Google-Doc-ready HTML doc.
 *   briefToTelegram     — render the brief as a phone-sized Telegram message.
 *
 * Nothing here throws into the request path on bad input — a missing field
 * becomes an empty string / empty list, never a crash.
 */
import { claude } from "./anthropic";

// Sonnet 5 is the production brain everywhere else in the kit (lib/brain.ts).
// This runs once per sales call (very low volume), so quality matters more than
// cost — but keeping it on the same model as the setter keeps the bill legible.
const MODEL = process.env.EXTRACT_MODEL || "claude-sonnet-5";

// ── Types ────────────────────────────────────────────────────────────────────

export type Attendee = { name: string; email: string };

export type FathomMeeting = {
  external_id: string | null;
  title: string;
  tags: string[]; // any labels/tags/categories Fathom sent — used by the paid gate
  attendees: Attendee[];
  meeting_url: string | null;
  recording_url: string | null;
  recorded_at: string | null; // ISO
  transcript: string;
  summary: string; // Fathom's own AI summary, if it sent one (extra context)
};

export type OnboardingBrief = {
  client_name: string;
  company: string;
  role: string;
  one_liner: string; // who they are, in a sentence
  what_they_want: string; // the outcome they're actually buying
  current_situation: string;
  goals: string[];
  pain_points: string[];
  needs_from_us: string[]; // concrete deliverables / where to focus
  objections_risks: string[];
  commitments: string[]; // what WE promised: price, timeline, scope
  kickoff_actions: string[]; // the first things to do for them
  red_flags: string[];
  their_words: string[]; // direct quotes, for writing in their voice later
  summary: string; // 3-5 sentence plain-English headline
};

const EMPTY_BRIEF: OnboardingBrief = {
  client_name: "",
  company: "",
  role: "",
  one_liner: "",
  what_they_want: "",
  current_situation: "",
  goals: [],
  pain_points: [],
  needs_from_us: [],
  objections_risks: [],
  commitments: [],
  kickoff_actions: [],
  red_flags: [],
  their_words: [],
  summary: "",
};

// ── Defensive payload parsing ────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** First non-empty string found at any of the given dotted paths. */
function pickString(body: Record<string, unknown>, paths: string[]): string {
  for (const path of paths) {
    let cur: unknown = body;
    for (const key of path.split(".")) cur = asRecord(cur)[key];
    if (typeof cur === "string" && cur.trim()) return cur.trim();
  }
  return "";
}

/** Turn a transcript that may be a string OR an array of segments into text. */
function coerceTranscript(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    return v
      .map((seg) => {
        if (typeof seg === "string") return seg;
        const r = asRecord(seg);
        const speaker =
          (typeof r.speaker === "string" ? (r.speaker as string) : "") ||
          (r.speaker_name as string) ||
          (asRecord(r.speaker).name as string) ||
          (asRecord(r.speaker).display_name as string) ||
          (r.display_name as string) ||
          "";
        const text =
          (r.text as string) ||
          (r.sentence as string) ||
          (r.content as string) ||
          (r.transcript as string) ||
          "";
        if (!text) return "";
        return speaker ? `${speaker}: ${text}` : text;
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function findTranscript(body: Record<string, unknown>): string {
  // Try the common flat/nested string spots first, then array-of-segments spots.
  const stringHit = pickString(body, [
    "transcript",
    "transcript_plaintext",
    "transcript.plaintext",
    "data.transcript",
    "recording.transcript",
    "meeting.transcript",
    "call.transcript",
  ]);
  if (stringHit) return stringHit;
  for (const v of [
    body.transcript,
    asRecord(body.data).transcript,
    asRecord(body.recording).transcript,
    asRecord(body.meeting).transcript,
    body.transcript_segments,
    body.segments,
  ]) {
    const t = coerceTranscript(v);
    if (t) return t;
  }
  return "";
}

function normalizeAttendees(v: unknown): Attendee[] {
  if (!Array.isArray(v)) return [];
  const out: Attendee[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      out.push({ name: item.trim(), email: "" });
      continue;
    }
    const r = asRecord(item);
    const name =
      (r.name as string) ||
      (r.full_name as string) ||
      (r.display_name as string) ||
      "";
    const email = (r.email as string) || (r.email_address as string) || "";
    if (name || email) out.push({ name: (name || "").trim(), email: (email || "").trim() });
  }
  return out;
}

function findAttendees(body: Record<string, unknown>): Attendee[] {
  for (const v of [
    body.attendees,
    body.invitees,
    body.participants,
    asRecord(body.meeting).attendees,
    asRecord(body.meeting).invitees,
    asRecord(body.data).attendees,
  ]) {
    const a = normalizeAttendees(v);
    if (a.length) return a;
  }
  return [];
}

/** Normalize a tags/labels field (array of strings OR of {name}/{label}/{title}). */
function normalizeTags(v: unknown): string[] {
  if (typeof v === "string") return v.trim() ? [v.trim()] : [];
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") {
      if (item.trim()) out.push(item.trim());
      continue;
    }
    const r = asRecord(item);
    const label = (r.name as string) || (r.label as string) || (r.title as string) || (r.tag as string) || "";
    if (label && label.trim()) out.push(label.trim());
  }
  return out;
}

function findTags(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of [
    body.tags,
    body.labels,
    body.categories,
    body.category,
    body.type,
    body.meeting_type,
    asRecord(body.meeting).tags,
    asRecord(body.meeting).labels,
    asRecord(body.data).tags,
  ]) {
    out.push(...normalizeTags(v));
  }
  // De-dupe (case-insensitively) while keeping first-seen casing.
  const seen = new Set<string>();
  return out.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Pull the meeting facts + transcript out of a Fathom webhook body (or a manual
 * test body: { transcript, title, attendees, meeting_url }). Everything is
 * best-effort — the only field the route truly needs is a non-empty transcript.
 */
export function parseFathomPayload(raw: unknown): FathomMeeting {
  const body = asRecord(raw);
  return {
    external_id:
      pickString(body, [
        "id",
        "recording_id",
        "meeting_id",
        "share_id",
        "call_id",
        "meeting.id",
        "recording.id",
        "data.id",
      ]) || null,
    title:
      pickString(body, [
        "title",
        "meeting_title",
        "topic",
        "name",
        "meeting.title",
        "recording.title",
        "data.title",
      ]) || "Sales call",
    tags: findTags(body),
    attendees: findAttendees(body),
    meeting_url:
      pickString(body, [
        "share_url",
        "url",
        "meeting_url",
        "fathom_url",
        "recording.share_url",
        "recording.url",
        "meeting.url",
      ]) || null,
    recording_url:
      pickString(body, ["recording_url", "video_url", "recording.url", "recording.video_url"]) ||
      null,
    recorded_at:
      pickString(body, [
        "recorded_at",
        "started_at",
        "start_time",
        "date",
        "created_at",
        "meeting.scheduled_start_time",
        "meeting.started_at",
        "recording.recorded_at",
      ]) || null,
    transcript: findTranscript(body),
    summary: pickString(body, [
      "summary",
      "ai_summary",
      "notes",
      "meeting_summary",
      "recording.summary",
      "data.summary",
    ]),
  };
}

// ── Paid gate ────────────────────────────────────────────────────────────────
// Only calls you've marked as a paying client should become briefs, so a Doc /
// row / model call is never spent on a prospect who hasn't paid. You control it
// with FATHOM_PAID_KEYWORDS: any call whose TITLE or a TAG contains one of these
// (comma-separated, case-insensitive) passes; everything else is skipped.
//
//   FATHOM_PAID_KEYWORDS=onboarding,won,paid
//
// Leave the env unset and the gate is OFF (every call with a transcript goes
// through) — so nothing changes until you opt in by setting it.

export function paidKeywords(): string[] {
  return (process.env.FATHOM_PAID_KEYWORDS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether this call is allowed through the paid gate.
 *   enabled — is a keyword list configured at all?
 *   allowed — should this call proceed? (always true when the gate is off)
 *   matched — which keyword let it through, if any.
 */
export function paidGate(meeting: FathomMeeting): {
  enabled: boolean;
  allowed: boolean;
  matched: string | null;
} {
  const keywords = paidKeywords();
  if (!keywords.length) return { enabled: false, allowed: true, matched: null };
  const haystack = [meeting.title, ...meeting.tags].join(" | ").toLowerCase();
  const matched = keywords.find((k) => haystack.includes(k)) ?? null;
  return { enabled: true, allowed: matched !== null, matched };
}

// ── Claude extraction ────────────────────────────────────────────────────────

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0)
    .slice(0, 20);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Parse the model's JSON (tolerating a stray code fence) into a full brief. */
function parseBrief(text: string): OnboardingBrief | null {
  let jsonText = text.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonText = fence[1].trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = asRecord(JSON.parse(jsonText.slice(start, end + 1)));
  } catch {
    return null;
  }
  return {
    client_name: asString(obj.client_name),
    company: asString(obj.company),
    role: asString(obj.role),
    one_liner: asString(obj.one_liner),
    what_they_want: asString(obj.what_they_want),
    current_situation: asString(obj.current_situation),
    goals: asStringArray(obj.goals),
    pain_points: asStringArray(obj.pain_points),
    needs_from_us: asStringArray(obj.needs_from_us),
    objections_risks: asStringArray(obj.objections_risks),
    commitments: asStringArray(obj.commitments),
    kickoff_actions: asStringArray(obj.kickoff_actions),
    red_flags: asStringArray(obj.red_flags),
    their_words: asStringArray(obj.their_words),
    summary: asString(obj.summary),
  };
}

const SYSTEM_PROMPT = `You are an expert client-onboarding analyst for a coaching / done-for-you service business. You read the transcript of a SALES CALL that just closed (or nearly closed) a new client, and you sort it into a crisp onboarding brief the team reads before they start coaching or delivering.

Your job: capture exactly WHO this client is and WHAT THEY NEED from us, grounded ONLY in what was actually said on the call. Never invent facts. If something wasn't covered, leave that field empty rather than guessing. Prefer the client's own words for pains and quotes.

Output STRICT JSON only — no prose, no markdown, no code fences — matching EXACTLY this shape:
{
  "client_name": "the client's name (the person we're onboarding), or empty",
  "company": "their business/brand name, or empty",
  "role": "their role / what they do, or empty",
  "one_liner": "one sentence: who they are and where they're starting from",
  "what_they_want": "the concrete outcome they are actually buying, in plain language",
  "current_situation": "where they are today: what they've tried, what's in place, their numbers if mentioned",
  "goals": ["specific goals/targets they stated"],
  "pain_points": ["their frustrations and pains, quoted or closely paraphrased"],
  "needs_from_us": ["concrete things we must deliver / where to focus the coaching or service"],
  "objections_risks": ["what nearly stopped them, doubts, or risks to watch"],
  "commitments": ["what WE promised on the call: price, timeline, scope, guarantees, next steps"],
  "kickoff_actions": ["the first 3-6 concrete actions to take for this client to start strong"],
  "red_flags": ["anything that could make this client hard to serve or likely to churn"],
  "their_words": ["3-6 short direct quotes that capture their voice, motivation, or urgency"],
  "summary": "3-5 sentences a busy owner can read in 15 seconds: who this is, what they need, and the single most important thing to get right"
}
Arrays may be empty. Keep each list item to one tight sentence. Do not include a trailing 'their_words' quote you cannot actually see in the transcript.`;

/**
 * Run the transcript through Claude and return the structured brief. Returns
 * null only when the model's output can't be parsed at all (the caller then
 * falls back to a minimal brief so the pipeline still delivers something).
 */
export async function extractBrief(meeting: FathomMeeting): Promise<OnboardingBrief | null> {
  const context: string[] = [];
  context.push(`CALL TITLE: ${meeting.title}`);
  if (meeting.attendees.length) {
    context.push(
      `ATTENDEES: ${meeting.attendees
        .map((a) => (a.email ? `${a.name} <${a.email}>` : a.name))
        .join(", ")}`
    );
  }
  if (meeting.recorded_at) context.push(`WHEN: ${meeting.recorded_at}`);
  if (meeting.summary) context.push(`\nFATHOM'S OWN SUMMARY (context only, verify against transcript):\n${meeting.summary}`);
  // Cap the transcript so a marathon call can't blow the context / the bill.
  const transcript = meeting.transcript.slice(0, 120_000);
  context.push(`\nFULL TRANSCRIPT:\n${transcript}`);

  const anthropic = claude("fathom_onboarding");
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "high" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: context.join("\n") }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  return parseBrief(text);
}

/** A minimal brief from just the meeting facts, for when extraction fails. */
export function fallbackBrief(meeting: FathomMeeting): OnboardingBrief {
  const lead = meeting.attendees.find((a) => a.name) ?? { name: "", email: "" };
  return {
    ...EMPTY_BRIEF,
    client_name: lead.name,
    summary: meeting.summary || "Couldn't auto-sort this call — the raw transcript is stored on the brief.",
  };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlSection(title: string, body: string): string {
  if (!body) return "";
  return `<h2>${esc(title)}</h2>${body}`;
}

function htmlList(items: string[]): string {
  if (!items.length) return "";
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function htmlPara(text: string): string {
  return text ? `<p>${esc(text)}</p>` : "";
}

/** A clean HTML document Google Drive converts into a native Doc. */
export function briefToHtml(brief: OnboardingBrief, meeting: FathomMeeting): string {
  const headName = brief.client_name || meeting.attendees[0]?.name || "New client";
  const headCompany = brief.company ? ` — ${brief.company}` : "";
  const when = meeting.recorded_at
    ? new Date(meeting.recorded_at).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
  const meta: string[] = [];
  if (brief.role) meta.push(brief.role);
  if (when) meta.push(when);
  if (meeting.attendees.length)
    meta.push(
      `On the call: ${meeting.attendees
        .map((a) => (a.email ? `${a.name} (${a.email})` : a.name))
        .filter(Boolean)
        .join(", ")}`
    );

  return [
    `<h1>Onboarding brief — ${esc(headName)}${esc(headCompany)}</h1>`,
    meta.length ? `<p><em>${esc(meta.join(" · "))}</em></p>` : "",
    brief.one_liner ? `<p><strong>${esc(brief.one_liner)}</strong></p>` : "",
    htmlSection("The 15-second version", htmlPara(brief.summary)),
    htmlSection("What they want", htmlPara(brief.what_they_want)),
    htmlSection("Where they are now", htmlPara(brief.current_situation)),
    htmlSection("Goals", htmlList(brief.goals)),
    htmlSection("Pain points", htmlList(brief.pain_points)),
    htmlSection("What they need from us", htmlList(brief.needs_from_us)),
    htmlSection("Objections & risks", htmlList(brief.objections_risks)),
    htmlSection("What we committed to", htmlList(brief.commitments)),
    htmlSection("Kickoff — first actions", htmlList(brief.kickoff_actions)),
    htmlSection("Red flags / watch-outs", htmlList(brief.red_flags)),
    htmlSection("In their own words", htmlList(brief.their_words.map((q) => `“${q}”`))),
    meeting.meeting_url
      ? `<hr/><p><em>Source call: <a href="${esc(meeting.meeting_url)}">${esc(meeting.meeting_url)}</a></em></p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function tgList(label: string, items: string[], max = 4): string {
  if (!items.length) return "";
  const shown = items.slice(0, max).map((i) => `• ${i}`);
  return `\n${label}:\n${shown.join("\n")}`;
}

/**
 * A phone-sized Telegram message: the essence of the brief plus the doc link.
 * Trimmed to stay comfortably under Telegram's 4096-char limit.
 */
export function briefToTelegram(
  brief: OnboardingBrief,
  meeting: FathomMeeting,
  docUrl: string | null
): string {
  const name = brief.client_name || meeting.attendees[0]?.name || "New client";
  const company = brief.company ? ` (${brief.company})` : "";
  const parts: string[] = [`📋 New onboarding brief — ${name}${company}`];
  if (brief.summary) parts.push(`\n${brief.summary}`);
  if (brief.what_they_want) parts.push(`\n🎯 Wants: ${brief.what_they_want}`);
  parts.push(tgList("😖 Pains", brief.pain_points, 3));
  parts.push(tgList("🛠️ Needs from us", brief.needs_from_us, 4));
  parts.push(tgList("🤝 We promised", brief.commitments, 3));
  parts.push(tgList("🚩 Watch-outs", brief.red_flags, 3));
  if (docUrl) parts.push(`\n📄 Full brief: ${docUrl}`);
  const text = parts.filter(Boolean).join("\n");
  return text.length > 3800 ? text.slice(0, 3790) + "…" : text;
}
