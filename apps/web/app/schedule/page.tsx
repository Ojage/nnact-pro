import { api } from "../../lib/api";

// Simple day-grouped schedule view. The drag-to-reschedule UI sits on top of
// the appointments PATCH endpoint in a later pass; this proves the read path.
export default async function SchedulePage() {
  let appts: Awaited<ReturnType<typeof api.appointments>> = [];
  let jobs: Awaited<ReturnType<typeof api.jobs>> = [];
  let error: string | null = null;
  try {
    [appts, jobs] = await Promise.all([api.appointments(), api.jobs()]);
  } catch (e) {
    error = (e as Error).message;
  }

  const jobTitle = (id: string) => jobs.find((j) => j.id === id)?.title ?? id.slice(0, 8);

  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const day = new Date(a.startsAt).toLocaleDateString();
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(a);
  }

  return (
    <div>
      <h1>Schedule</h1>
      {error ? (
        <p style={{ color: "#ff8080" }}>API unreachable ({error}).</p>
      ) : appts.length === 0 ? (
        <p style={{ color: "#8a97c2" }}>
          No appointments yet. Create one with{" "}
          <code>POST /api/appointments</code> (jobId + startsAt + endsAt).
        </p>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day} style={{ marginBottom: 20 }}>
            <h3 style={{ color: "#9fb0e0" }}>{day}</h3>
            {list.map((a) => (
              <div
                key={a.id}
                style={{
                  background: "#141b33",
                  border: "1px solid #1d2440",
                  borderRadius: 8,
                  padding: "10px 14px",
                  marginBottom: 8,
                }}
              >
                <strong>{jobTitle(a.jobId)}</strong>{" "}
                <span style={{ color: "#8a97c2" }}>
                  {new Date(a.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                  {new Date(a.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {a.technicianId ? "" : " · unassigned"}
                </span>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
