import type { ReactNode } from "react";

export const metadata = {
  title: "OpenFieldPro",
  description: "Open-source field service management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#0b1020",
          color: "#e6e9f0",
        }}
      >
        <header
          style={{
            padding: "14px 24px",
            borderBottom: "1px solid #1d2440",
            display: "flex",
            gap: 20,
            alignItems: "center",
          }}
        >
          <strong style={{ fontSize: 18 }}>⊹ OpenFieldPro</strong>
          <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
            <a href="/" style={{ color: "#9fb0e0", textDecoration: "none" }}>
              Dashboard
            </a>
            <a href="/customers" style={{ color: "#9fb0e0", textDecoration: "none" }}>
              Customers
            </a>
            <a href="/schedule" style={{ color: "#9fb0e0", textDecoration: "none" }}>
              Schedule
            </a>
            <a href="/login" style={{ color: "#9fb0e0", textDecoration: "none", marginLeft: "auto" }}>
              Sign in
            </a>
          </nav>
        </header>
        <main style={{ padding: 24, maxWidth: 1000, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
