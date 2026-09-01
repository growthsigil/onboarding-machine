/**
 * BRIEFS VIEWER — the built-in place to read every brief, so the app is useful
 * even with no Google and no Telegram. Gated by the access key:
 *   https://YOUR-APP-URL/briefs?k=YOUR-ACCESS-KEY
 */
import type { CSSProperties } from "react";
import { accessKey } from "@/lib/access";
import { listBriefs, type BriefRow } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Brief = {
  client_name?: string;
  company?: string;
  role?: string;
  one_liner?: string;
  summary?: string;
  what_they_want?: string;
  current_situation?: string;
  goals?: string[];
  pain_points?: string[];
  needs_from_us?: string[];
  objections_risks?: string[];
  commitments?: string[];
  kickoff_actions?: string[];
  red_flags?: string[];
  their_words?: string[];
};

const wrap: CSSProperties = { maxWidth: 760, margin: "0 auto", padding: "44px 20px 80px" };
const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe1d8",
  borderRadius: 14,
  padding: "22px 24px",
  marginTop: 18,
  boxShadow: "0 1px 2px rgba(20,30,25,.05)",
};
const h2: CSSProperties = {
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: ".09em",
  color: "#9a6a10",
  margin: "18px 0 5px",
  fontWeight: 600,
};

function List({ items }: { items?: string[] }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((x, i) => (
        <li key={i} style={{ fontSize: 14.5, margin: "3px 0" }}>
          {x}
        </li>
      ))}
    </ul>
  );
}

function Para({ text }: { text?: string }) {
  if (!text) return null;
  return <p style={{ margin: "0 0 2px", fontSize: 14.5 }}>{text}</p>;
}

function BriefCard({ row }: { row: BriefRow }) {
  const b = (row.brief || {}) as Brief;
  const name = b.client_name || row.client_name || "New client";
  const when = row.recorded_at || row.created_at;
  const dateStr = when ? new Date(when).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
  return (
    <article style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>
          {name}
          {b.company ? ` — ${b.company}` : ""}
        </h1>
        <span style={{ fontSize: 12.5, color: "#8a9386", fontFamily: "ui-monospace, monospace" }}>{dateStr}</span>
      </div>
      {b.role ? <p style={{ margin: "3px 0 0", color: "#5f695c", fontSize: 13 }}>{b.role}</p> : null}
      {b.one_liner ? <p style={{ margin: "12px 0 0", fontWeight: 600, fontSize: 15 }}>{b.one_liner}</p> : null}

      {b.summary ? (<><h2 style={h2}>The 15-second version</h2><Para text={b.summary} /></>) : null}
      {b.what_they_want ? (<><h2 style={h2}>What they want</h2><Para text={b.what_they_want} /></>) : null}
      {b.current_situation ? (<><h2 style={h2}>Where they are now</h2><Para text={b.current_situation} /></>) : null}
      {b.goals?.length ? (<><h2 style={h2}>Goals</h2><List items={b.goals} /></>) : null}
      {b.pain_points?.length ? (<><h2 style={h2}>Pain points</h2><List items={b.pain_points} /></>) : null}
      {b.needs_from_us?.length ? (<><h2 style={h2}>What they need from us</h2><List items={b.needs_from_us} /></>) : null}
      {b.objections_risks?.length ? (<><h2 style={h2}>Objections &amp; risks</h2><List items={b.objections_risks} /></>) : null}
      {b.commitments?.length ? (<><h2 style={h2}>What we committed to</h2><List items={b.commitments} /></>) : null}
      {b.kickoff_actions?.length ? (<><h2 style={h2}>Kickoff — first actions</h2><List items={b.kickoff_actions} /></>) : null}
      {b.red_flags?.length ? (<><h2 style={h2}>Red flags / watch-outs</h2><List items={b.red_flags} /></>) : null}
      {b.their_words?.length ? (
        <>
          <h2 style={h2}>In their own words</h2>
          <List items={b.their_words.map((q) => `“${q}”`)} />
        </>
      ) : null}

      {row.doc_url ? (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <a href={row.doc_url} style={{ color: "#0a6b64" }}>Open the Google Doc →</a>
        </p>
      ) : null}
    </article>
  );
}

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const k = typeof sp.k === "string" ? sp.k : "";
  const key = accessKey();

  if (!key || k !== key) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22 }}>Your briefs</h1>
        <p style={{ color: "#5f695c" }}>
          Add your access key to the URL: <code style={{ fontFamily: "ui-monospace, monospace" }}>/briefs?k=YOUR-ACCESS-KEY</code>
        </p>
      </main>
    );
  }

  let rows: BriefRow[] = [];
  let error: string | null = null;
  try {
    rows = await listBriefs(100);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main style={wrap}>
      <p style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 12, color: "#0d8f86", margin: 0 }}>
        Onboarding Machine
      </p>
      <h1 style={{ fontSize: 26, margin: "8px 0 4px" }}>Your client briefs</h1>
      <p style={{ color: "#5f695c", margin: 0 }}>{rows.length} brief{rows.length === 1 ? "" : "s"} so far.</p>

      {error ? <p style={{ color: "#b8462f" }}>Couldn&apos;t load briefs: {error}</p> : null}
      {!error && rows.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: "#5f695c" }}>
            No briefs yet. Once a paid sales call comes through, it&apos;ll appear here.
          </p>
        </div>
      ) : null}

      {rows.map((row) => (
        <BriefCard key={row.id} row={row} />
      ))}
    </main>
  );
}
