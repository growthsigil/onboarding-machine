/**
 * FATHOM API CLIENT — the "pull" side of the intake.
 *
 * Fathom's webhook fires ONCE, the instant a recording is ready, using the title
 * as it is at that moment — so a call you rename to a paid keyword afterwards is
 * never re-sent. This client lets the poller (/api/cron/fathom) ask Fathom's REST
 * API for recent meetings on a schedule, so a rename made any time later is still
 * picked up.
 *
 * Docs: https://developers.fathom.ai (base https://api.fathom.ai/external/v1).
 * The exact JSON shape can vary by account/version, so callers pass each meeting
 * object straight through lib/fathom.ts parseFathomPayload (which is defensive
 * about field names). Auth is a personal API key sent as X-Api-Key. Both the base
 * and the header name can be overridden by env if Fathom changes them, without a
 * code change.
 */

const DEFAULT_BASE = "https://api.fathom.ai/external/v1";

export function fathomApiKey(): string {
  return (process.env.FATHOM_API_KEY || "").trim();
}

export function fathomConfigured(): boolean {
  return fathomApiKey().length > 0;
}

function apiBase(): string {
  return (process.env.FATHOM_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
}

function keyHeader(): string {
  return (process.env.FATHOM_API_KEY_HEADER || "X-Api-Key").trim();
}

/** Pull the array of meetings out of whatever envelope the API returns. */
export function extractMeetings(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const k of ["items", "meetings", "recordings", "data", "results"]) {
    if (Array.isArray(r[k])) return r[k] as unknown[];
  }
  return [];
}

export type FathomListResult = {
  ok: boolean;
  status?: number;
  error?: string;
  meetings: unknown[];
  raw?: unknown;
};

/**
 * List meetings created in the last `sinceDays` days, transcripts included.
 * Reads the most recent page only — the poller runs often over a short window,
 * so one page is plenty and keeps the tick fast. Never throws.
 */
export async function listRecentMeetings(opts?: { sinceDays?: number }): Promise<FathomListResult> {
  const key = fathomApiKey();
  if (!key) return { ok: false, error: "no_api_key", meetings: [] };

  const since = new Date(Date.now() - (opts?.sinceDays ?? 14) * 86_400_000).toISOString();
  const url = new URL(`${apiBase()}/meetings`);
  url.searchParams.set("include_transcript", "true");
  url.searchParams.set("created_after", since);

  try {
    const resp = await fetch(url.toString(), {
      headers: { [keyHeader()]: key, accept: "application/json" },
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return { ok: false, status: resp.status, error: detail.slice(0, 300), meetings: [] };
    }
    const raw = await resp.json();
    return { ok: true, meetings: extractMeetings(raw), raw };
  } catch (e) {
    return { ok: false, error: (e as Error).message, meetings: [] };
  }
}
