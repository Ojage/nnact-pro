import { api } from "../lib/api";
import { formatMoney } from "@ofp/shared";
import type { ReportSummaryDTO } from "@ofp/shared";

export default async function Dashboard() {
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let summary: ReportSummaryDTO | null = null;
  let error: string | null = null;
  // Two independent fetches so a failing /reports endpoint degrades the page
  // to "no margin row" instead of blanking the whole dashboard. `jobs` is
  // the source of truth for the existing 3 cards; its failure still surfaces.
  try {
    jobs = await api.jobs();
  } catch (e) {
    error = (e as Error).message;
  }
  try {
    summary = await api.reports();
  } catch {
    // Non-fatal: existing cards still render.
  }

  const scheduled = jobs.filter((j) => j.status === "scheduled").length;
  const revenue = jobs
    .filter((j) => j.status === "completed")
    .reduce((a, j) => a + j.total, 0);

  return (
    <div>
      <h1>Dashboard</h1>
      {error ? (
        <p style={{ color: "#ff8080" }}>
          API unreachable ({error}). Start it with <code>pnpm dev:api</code> and seed with{" "}
          <code>pnpm db:seed</code>.
        </p>
      ) : (
        <>
          {summary && (
            <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <Stat
                label="Realized margin"
                value={formatMoney(summary.realizedMarginCents)}
                color={
                  summary.realizedMarginCents < 0
                    ? "#ff8080"
                    : summary.realizedMarginCents > 0
                      ? "#86e29a"
                      : "#e6e9f0"
                }
              />
              <Stat
                label="Pipeline margin"
                value={formatMoney(summary.pipelineMarginCents)}
                color={summary.pipelineMarginCents < 0 ? "#ff8080" : "#e6e9f0"}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <Stat label="Open jobs" value={String(jobs.length)} />
            <Stat label="Scheduled" value={String(scheduled)} />
            <Stat label="Completed revenue" value={formatMoney(revenue)} />
          </div>
          <h2>Recent jobs</h2>
          <ul>
            {jobs.map((j) => (
              <li key={j.id}>
                {j.title} — <em>{j.status}</em> — {formatMoney(j.total)}
              </li>
            ))}
            {jobs.length === 0 && <li>No jobs yet.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: "#141b33",
        border: "1px solid #1d2440",
        borderRadius: 10,
        padding: "16px 20px",
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, color: "#8a97c2" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? "#e6e9f0" }}>{value}</div>
    </div>
  );
}
