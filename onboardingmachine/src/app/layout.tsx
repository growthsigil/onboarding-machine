import type { ReactNode } from "react";

export const metadata = {
  title: "Onboarding Machine",
  description: "Turn sales calls into onboarding briefs — automatically.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f5f7f4",
          color: "#181c18",
          lineHeight: 1.55,
        }}
      >
        {children}
      </body>
    </html>
  );
}
