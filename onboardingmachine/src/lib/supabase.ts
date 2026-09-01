/**
 * Supabase — the only storage this app needs. Two tables (see db/schema.sql):
 *   briefs     — one row per sales call turned into a brief (+ dedupe by call id)
 *   app_state  — tiny key/value store (the Google token + the Drive folder id)
 *
 * Uses the SERVICE ROLE key: this runs server-side only (API routes), never in
 * the browser. Lazy singleton so a missing key never throws at build time.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const client = getSupabase() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});

export type BriefRow = {
  id: string;
  source: string;
  external_id: string | null;
  title: string | null;
  client_name: string | null;
  attendees: unknown;
  meeting_url: string | null;
  recorded_at: string | null;
  transcript: string | null;
  brief: Record<string, unknown>;
  doc_url: string | null;
  doc_id: string | null;
  created_at: string;
};

// ── app_state key/value helpers ──────────────────────────────────────────────

export async function getState(key: string): Promise<string | null> {
  const { data } = await supabase.from("app_state").select("value").eq("key", key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await supabase
    .from("app_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .then(undefined, (e) => console.error("[supabase] setState failed:", e));
}

export async function deleteState(key: string): Promise<void> {
  await supabase.from("app_state").delete().eq("key", key).then(undefined, () => {});
}

// ── briefs helpers ───────────────────────────────────────────────────────────

/** Have we already made a brief for this exact recording? (dedupe) */
export async function briefExists(external_id: string | null): Promise<boolean> {
  if (!external_id) return false;
  const { data } = await supabase
    .from("briefs")
    .select("id")
    .eq("source", "fathom")
    .eq("external_id", external_id)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function listBriefs(limit = 50): Promise<BriefRow[]> {
  const { data } = await supabase
    .from("briefs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as BriefRow[];
}
