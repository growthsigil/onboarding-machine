import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

export default function Home() {
  const box: CSSProperties = {
    maxWidth: 640,
    margin: "0 auto",
    padding: "48px 20px 72px",
  };
  const card: CSSProperties = {
    background: "#fff",
    border: "1px solid #dbe1d8",
    borderRadius: 14,
    padding: "20px 22px",
    marginTop: 18,
    boxShadow: "0 1px 2px rgba(20,30,25,.05)",
  };
  const code: CSSProperties = {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 13,
    background: "#eef1ec",
    padding: "2px 6px",
    borderRadius: 5,
    wordBreak: "break-all",
  };

  return (
    <main style={box}>
      <p style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".14em", textTransform: "uppercase", fontSize: 12, color: "#0d8f86", margin: 0 }}>
        Onboarding Machine
      </p>
      <h1 style={{ fontSize: 30, lineHeight: 1.1, margin: "10px 0 12px", letterSpacing: "-.02em" }}>
        Sales calls in. Onboarding briefs out.
      </h1>
      <p style={{ color: "#5f695c", margin: 0, fontSize: 17 }}>
        This app is running. It turns a recorded sales call into a clean client brief and (optionally) files it
        as a Google Doc and pings it to Telegram. Setup lives in the README.
      </p>

      <div style={card}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Check your setup</h2>
        <p style={{ margin: "0 0 6px", color: "#5f695c", fontSize: 14 }}>
          See what&apos;s wired up and what&apos;s missing:
        </p>
        <p style={code}>/api/setup-check?k=YOUR-ACCESS-KEY</p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Read your briefs</h2>
        <p style={{ margin: "0 0 6px", color: "#5f695c", fontSize: 14 }}>
          Every brief is stored here — no Google or Telegram required:
        </p>
        <p style={code}>/briefs?k=YOUR-ACCESS-KEY</p>
      </div>

      <p style={{ marginTop: 26, color: "#8a9386", fontSize: 13 }}>
        Replace <span style={code}>YOUR-ACCESS-KEY</span> with the value you set in the{" "}
        <span style={code}>ACCESS_KEY</span> environment variable.
      </p>
    </main>
  );
}
