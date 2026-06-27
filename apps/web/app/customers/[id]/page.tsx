import { api } from "../../../lib/api";
import { formatMoney } from "@ofp/shared";

export default async function CustomerDetailPage({
  params,
}: {
  // Next 15+ passes params as a Promise. Await it for the future-proof shape;
  // Next 14 also tolerates the await.
  params: Promise<{ id: string }>;
}) {
  const { id: customerId } = await params;

  // Two independent fetches. The customer fetch is the source of truth for
  // "exists vs. failed to load": if it throws, render a degraded timeline +
  // jobs page so the user isn't told their own link is invalid. If it returns
  // undefined, the customer is genuinely missing.
  let customer: Awaited<ReturnType<typeof api.customer>> | null = null;
  let customerLoadFailed = false;
  try {
    customer = await api.customer(customerId);
  } catch {
    customerLoadFailed = true;
  }

  const [allJobs, timeline] = await Promise.all([
    api.jobs().catch(() => []),
    api.activities({ customerId }).catch(() => []),
  ]);
  const customerJobs = allJobs.filter((j) => j.customerId === customerId);

  return (
    <div>
      {customerLoadFailed ? (
        <>
          <h1>Customer (couldn’t load)</h1>
          <p style={{ color: "#8a97c2" }}>
            The customer service is unreachable, but here is what we know about{" "}
            <code>{customerId}</code>.
          </p>
        </>
      ) : customer ? (
        <>
          <h1>{customer.name}</h1>
          <p style={{ color: "#8a97c2", marginTop: 0 }}>
            {customer.email ?? "—"} · {customer.phone ?? "—"} ·{" "}
            added {new Date(customer.createdAt).toLocaleDateString()}
          </p>
        </>
      ) : (
        <>
          <h1>Customer not found</h1>
          <p style={{ color: "#8a97c2" }}>No customer with id {customerId} in this org.</p>
        </>
      )}

      <div style={{ display: "flex", gap: 32, marginTop: 24 }}>
        <section style={{ flex: 1 }}>
          <h2>Activity timeline</h2>
          {timeline.length === 0 ? (
            <p style={{ color: "#8a97c2" }}>No activity yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {timeline.map((a) => (
                <li
                  key={a.id}
                  style={{
                    borderLeft: "2px solid #1d2440",
                    paddingLeft: 12,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 12, color: "#8a97c2" }}>
                    {new Date(a.createdAt).toLocaleString()} ·{" "}
                    <span style={{ color: "#9fb0e0" }}>{a.kind}</span>
                  </div>
                  <div>{a.summary}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={{ flex: 1 }}>
          <h2>Jobs ({customerJobs.length})</h2>
          {customerJobs.length === 0 ? (
            <p style={{ color: "#8a97c2" }}>No jobs yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {customerJobs.map((j) => (
                <li
                  key={j.id}
                  style={{
                    background: "#141b33",
                    border: "1px solid #1d2440",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{j.title}</div>
                  <div style={{ fontSize: 12, color: "#8a97c2" }}>
                    {j.status} · {formatMoney(j.total)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
