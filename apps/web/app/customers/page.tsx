import { api } from "../../lib/api";

export default async function CustomersPage() {
  let customers: Awaited<ReturnType<typeof api.customers>> = [];
  let error: string | null = null;
  try {
    customers = await api.customers();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div>
      <h1>Customers</h1>
      {error ? (
        <p style={{ color: "#ff8080" }}>API unreachable ({error}).</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8a97c2", fontSize: 13 }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Phone</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #1d2440" }}>
                <td style={{ padding: 8 }}>{c.name}</td>
                <td style={{ padding: 8 }}>{c.email ?? "—"}</td>
                <td style={{ padding: 8 }}>{c.phone ?? "—"}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 8 }}>
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
