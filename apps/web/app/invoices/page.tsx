import { api } from "../../lib/api";
import { formatMoney } from "@ofp/shared";

const STATUS_COLOR: Record<string, string> = {
  draft: "#8a97c2",
  sent: "#e0b34f",
  paid: "#86e29a",
  void: "#ff8080",
};

export default async function InvoicesPage() {
  let invoices: Awaited<ReturnType<typeof api.invoices>> = [];
  let error: string | null = null;
  try {
    invoices = await api.invoices();
  } catch (e) {
    error = (e as Error).message;
  }

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "draft")
    .reduce((a, i) => a + i.total, 0);

  return (
    <div>
      <h1>Invoices</h1>
      {error ? (
        <p style={{ color: "#ff8080" }}>API unreachable ({error}).</p>
      ) : (
        <>
          <p style={{ color: "#8a97c2" }}>Outstanding: {formatMoney(outstanding)}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#8a97c2", fontSize: 13 }}>
                <th style={{ padding: 8 }}>Number</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ borderTop: "1px solid #1d2440" }}>
                  <td style={{ padding: 8 }}>{inv.number}</td>
                  <td style={{ padding: 8, color: STATUS_COLOR[inv.status] ?? "#e6e9f0" }}>{inv.status}</td>
                  <td style={{ padding: 8 }}>{formatMoney(inv.total)}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 8 }}>
                    No invoices yet. Create one with <code>POST /api/invoices</code> {"{ jobId }"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
