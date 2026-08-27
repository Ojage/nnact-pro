import { api } from "@/lib/api";
import { formatMoney } from "@nnact/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerFooter } from "@/components/customer-chrome";
import { PayButton } from "./pay-button";
import { PortalEstimateSection } from "./portal-estimates";
import { PortalShell } from "./portal-shell";

const VIEW_LABELS: Record<string, string> = {
  balance: "Balance",
  checkout: "Pay online",
  receipts: "Receipts",
  service_plans: "Maintenance plans",
  estimates: "Estimates",
  service_history: "Service history",
};

function Unavailable({ title, message }: { title: string; message: string }) {
  return (
    <main className="min-h-screen bg-surface-100 px-4 py-16 text-fg">
      <Card className="mx-auto max-w-xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Customer portal</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 text-sm text-fg-muted">{message}</p>
      </Card>
    </main>
  );
}

export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid } = await searchParams;

  let session: Awaited<ReturnType<typeof api.portalSession>> | null = null;
  let failure: { title: string; message: string } | null = null;

  try {
    session = await api.portalSession(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const status = /^4\d\d:/.test(message) ? Number(message.slice(0, 3)) : 0;
    if (status === 410) {
      failure = {
        title: "This link is no longer active",
        message: message.includes("revoked")
          ? "This portal link was revoked. Contact NNACT for a new link."
          : "This portal link has expired or the portal is disabled.",
      };
    } else {
      failure = {
        title: "Portal unavailable",
        message: "Check that you copied the full link, or contact NNACT for a new secure portal link.",
      };
    }
  }

  if (failure) return <Unavailable title={failure.title} message={failure.message} />;
  if (!session) return <Unavailable title="Could not load portal" message="Please try again in a moment." />;

  const { org, customer, views, balance, checkout, receipts, servicePlans, estimates, serviceHistory } = session;

  return (
    <div className="min-h-screen bg-surface-100 text-fg">
      <PortalShell orgName={org.name} customerName={customer.name} />

      <div className="mx-auto w-[min(1080px,calc(100%-32px))] py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight">Welcome, {customer.name.split(" ")[0]}</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">
            Review estimates, pay invoices, track maintenance visits, and see your service history — all from one secure link.
          </p>
        </div>

        {paid === "1" ? (
          <div role="status" className="mb-6 rounded-xl border border-green/40 bg-green/10 p-4 text-sm text-green">
            Thank you — your payment was received. A receipt is available below.
          </div>
        ) : null}

        <nav aria-label="Portal sections" className="mb-6 flex flex-wrap gap-2">
          {views.map((view) => (
            <a key={view} href={`#${view}`} className="rounded-lg border border-border bg-surface-50 px-3 py-1.5 text-sm font-medium text-fg-link no-underline hover:bg-surface-200">
              {VIEW_LABELS[view] ?? view}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 gap-6">
          {views.includes("estimates") ? (
            <PortalEstimateSection token={token} estimates={estimates} customerName={customer.name} />
          ) : null}

          {views.includes("balance") ? (
            <Card id="balance">
              <CardHeader><CardTitle>Invoice balance</CardTitle></CardHeader>
              <CardContent>
                {balance.invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">No outstanding balance.</p>
                ) : (
                  <div className="grid gap-3">
                    {balance.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 p-4">
                        <div>
                          <p className="text-sm font-semibold">Invoice {invoice.number}</p>
                          <p className="text-xs text-fg-muted">
                            {formatMoney(invoice.total)} total · {formatMoney(invoice.remaining)} remaining
                          </p>
                        </div>
                        <p className="text-base font-black">{formatMoney(invoice.remaining)}</p>
                      </div>
                    ))}
                    <p className="text-right text-sm font-semibold">
                      Total remaining: <span className="text-base font-black">{formatMoney(balance.totalRemaining)}</span>
                    </p>
                  </div>
                )}
                <p className="mt-4 text-xs text-fg-dim">{balance.paymentInstructions}</p>
              </CardContent>
            </Card>
          ) : null}

          {views.includes("checkout") ? (
            <Card id="checkout">
              <CardHeader><CardTitle>Pay online</CardTitle></CardHeader>
              <CardContent>
                {balance.invoices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">Nothing to pay right now.</p>
                ) : checkout.available ? (
                  <div className="grid gap-3">
                    {balance.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-200 p-4">
                        <div>
                          <p className="text-sm font-semibold">Invoice {invoice.number}</p>
                          <p className="text-xs text-fg-muted">Pay {formatMoney(invoice.remaining)} securely online.</p>
                        </div>
                        <PayButton token={token} invoiceId={invoice.id} number={invoice.number} remaining={invoice.remaining} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-surface-200 p-4">
                    <p className="text-sm font-medium">Online payment is not enabled.</p>
                    <p className="mt-1 text-xs text-fg-muted">{balance.paymentInstructions}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {views.includes("receipts") ? (
            <Card id="receipts">
              <CardHeader><CardTitle>Receipts</CardTitle></CardHeader>
              <CardContent>
                {receipts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">No paid invoices yet.</p>
                ) : (
                  <div className="grid gap-3">
                    {receipts.map((receipt) => (
                      <div key={receipt.id} className="rounded-lg bg-surface-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Invoice {receipt.number}</p>
                          <p className="text-sm font-black text-green">{formatMoney(receipt.total)} paid</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {views.includes("service_plans") ? (
            <Card id="service_plans">
              <CardHeader><CardTitle>Maintenance plans</CardTitle></CardHeader>
              <CardContent>
                {servicePlans.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">No active maintenance plan.</p>
                ) : (
                  <div className="grid gap-3">
                    {servicePlans.map((plan) => (
                      <div key={plan.id} className="rounded-lg bg-surface-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{plan.planName}</p>
                          <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">{plan.status}</span>
                        </div>
                        <p className="mt-2 text-xs text-fg-muted">
                          {plan.visitsCompleted} of {plan.visitsIncluded} visits used
                          {plan.nextVisit ? ` · next: ${plan.nextVisit.title}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {views.includes("service_history") ? (
            <Card id="service_history">
              <CardHeader><CardTitle>Service history</CardTitle></CardHeader>
              <CardContent>
                {serviceHistory.length === 0 ? (
                  <p className="py-6 text-center text-sm text-fg-muted">No service visits recorded yet.</p>
                ) : (
                  <div className="grid gap-3">
                    {serviceHistory.map((job) => (
                      <div key={job.id} className="rounded-lg bg-surface-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{job.title}</p>
                          <span className="text-xs font-bold uppercase tracking-wide text-fg-dim">{job.status.replace("_", " ")}</span>
                        </div>
                        <p className="mt-1 text-xs text-fg-muted">
                          {job.scheduledAt ? `Scheduled ${new Date(job.scheduledAt).toLocaleDateString()}` : "Not scheduled"}
                          {job.completedAt ? ` · completed ${new Date(job.completedAt).toLocaleDateString()}` : ""}
                          {job.total ? ` · ${formatMoney(job.total)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-fg-dim">
          Questions? Contact {org.name}
          {org.publicPhone ? ` · ${org.publicPhone}` : ""}
          {org.publicEmail ? ` · ${org.publicEmail}` : ""}.
        </footer>
      </div>

      <CustomerFooter />
    </div>
  );
}
