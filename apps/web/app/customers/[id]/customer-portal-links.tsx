"use client";

import { useState } from "react";
import type { PortalLinkDTO, PortalLinkScope } from "@/lib/api";
import {
  useCreatePortalLinkMutation,
  usePortalLinksQuery,
  useRevokePortalLinkMutation,
  useSendPortalLinkMutation,
} from "@/lib/redux/api";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { InfoTip } from "@/components/ui/info-tip";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SCOPE_HELP: Record<PortalLinkScope, string> = {
  balance: "Lets the customer see what they owe for each invoice.",
  checkout: "Opens the payment flow so the customer can settle their balance.",
  receipts: "Lists paid invoices and lets the customer download or view receipts.",
  service_plans: "Shows subscribed service plans and upcoming visits.",
  estimates: "Opens the estimate for review and approval from the link.",
  service_history: "Shows past jobs and equipment on file for this customer.",
};

const SCOPE_LABELS: Record<PortalLinkScope, string> = {
  balance: "Invoice balance",
  checkout: "Checkout / pay",
  receipts: "Receipts",
  service_plans: "Service plans",
  estimates: "Estimate approval",
  service_history: "Service history",
};

const TTL_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "null", label: "No expiration" },
];

function linkState(link: PortalLinkDTO): { label: string; className: string } {
  if (link.revokedAt) return { label: "Revoked", className: "bg-red/10 text-red" };
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) return { label: "Expired", className: "bg-red/10 text-red" };
  return { label: "Active", className: "bg-green/10 text-green" };
}

export function CustomerPortalLinks({ customerId }: { customerId: string }) {
  const { data: links = [], isFetching: loading } = usePortalLinksQuery({ customerId }, { skip: !customerId });
  const [createPortalLink, { isLoading: creating }] = useCreatePortalLinkMutation();
  const [revokePortalLink, { isLoading: revoking }] = useRevokePortalLinkMutation();
  const [sendPortalLink, { isLoading: sending }] = useSendPortalLinkMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<PortalLinkScope[]>([
    "balance",
    "checkout",
    "receipts",
    "service_plans",
    "estimates",
    "service_history",
  ]);
  const [ttl, setTtl] = useState("30");

  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(scope: PortalLinkScope) {
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  }

  function openDialog() {
    setNewToken(null);
    setError(null);
    setDialogOpen(true);
  }

  async function createLink() {
    if (selectedScopes.length === 0) return;
    setError(null);
    try {
      const result = await createPortalLink({
        customerId,
        scopes: selectedScopes,
        expiresInDays: ttl === "null" ? null : Number(ttl),
      }).unwrap();
      setNewToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create portal link");
    }
  }

  async function copyToken() {
    if (!newToken) return;
    const customerOrigin = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "") ?? window.location.origin.replace(":3000", ":3002");
    const url = `${customerOrigin}/p/${newToken}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function revoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      await revokePortalLink(id).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke portal link");
    } finally {
      setRevokingId(null);
    }
  }

  async function send(id: string) {
    setSendingId(id);
    setSendNotice(null);
    setError(null);
    try {
      const result = await sendPortalLink(id).unwrap();
      setSendNotice(`Emailed the portal link to ${result.to}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to email the portal link";
      setError(message.replace(/^\d+:\s*/, ""));
    } finally {
      setSendingId(null);
    }
  }

  const activeLinks = links.filter((link) => linkState(link).label === "Active").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-1.5">
          Customer portal links
          <InfoTip label="About customer portal links" side="right">
            Signed links you share with this customer so they can view balances, pay invoices, see receipts, approve estimates, and review service history — without a full account.
          </InfoTip>
        </CardTitle>
        <CardDescription>
          {loading
            ? "Loading portal links…"
            : links.length === 0
              ? "Create a secure link to share billing and self-service views with this customer."
              : `${activeLinks} active · ${links.length} total link${links.length === 1 ? "" : "s"}`}
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={openDialog}>
            New link
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-fg-muted">Loading portal links…</p>
        ) : (
          <>
            {error ? (
              <div className="rounded-lg border border-red/30 bg-red/5 px-4 py-3">
                <p className="text-sm font-medium text-red">Something went wrong</p>
                <p className="mt-1 text-xs text-fg-muted">{error}</p>
              </div>
            ) : null}
            {sendNotice ? (
              <div role="status" className="rounded-lg border border-green/40 bg-green/10 px-4 py-3">
                <p className="text-sm text-green">{sendNotice}</p>
              </div>
            ) : null}
            {links.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface-200 px-5 py-5">
                <p className="text-sm font-medium text-fg">No portal link yet</p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">
                  Create a signed, expiring link to share invoice balance, checkout, receipts, service plans, and more.
                  Revoke access at any time if the link is lost or no longer needed.
                </p>
                <Button size="sm" className="mt-4" onClick={openDialog}>
                  Create first link
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {links.map((link) => {
                  const state = linkState(link);
                  const active = state.label === "Active";
                  return (
                    <div key={link.id} className="rounded-xl border border-border bg-surface-200 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <code className="rounded-md bg-surface-300 px-2.5 py-1 text-xs font-semibold text-fg">{link.tokenPrefix}…</code>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${state.className}`}>
                            {state.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {active ? (
                            <>
                              <Button size="sm" variant="secondary" loading={sendingId === link.id} onClick={() => void send(link.id)}>
                                Send email
                              </Button>
                              {revokingId === link.id ? (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => setRevokingId(null)}>Keep</Button>
                                  <Button size="sm" variant="danger" loading={revoking} onClick={() => void revoke(link.id)}>Confirm revoke</Button>
                                </>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => setRevokingId(link.id)}>Revoke</Button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {link.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded-full bg-surface-300 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted"
                          >
                            {SCOPE_LABELS[scope]}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-fg-dim">
                        {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleDateString()} · ` : "No expiration · "}
                        {link.lastUsedAt ? `Last used ${new Date(link.lastUsedAt).toLocaleDateString()} · ` : "Never used · "}
                        {link.sentCount > 0
                          ? `Emailed ${link.sentCount}×${link.lastSentAt ? ` (${new Date(link.lastSentAt).toLocaleDateString()})` : ""}`
                          : "Not yet emailed"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!creating) setDialogOpen(open); }}>
        <DialogContent className="max-w-lg gap-5">
          <DialogHeader className="text-left">
            <DialogTitle>New customer portal link</DialogTitle>
            <DialogDescription>
              Choose which views this link opens. The link expires automatically and can be revoked at any time.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2.5">
            <legend className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-dim">
              Views
              <InfoTip label="About portal views" side="right">
                Each view controls what the customer sees after opening the link. Select only what they need — fewer scopes keeps the portal focused.
              </InfoTip>
            </legend>
            {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
              <label key={scope} className="flex items-center gap-3 rounded-lg border border-border bg-surface-300 px-4 py-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={selectedScopes.includes(scope as PortalLinkScope)}
                  onChange={() => toggleScope(scope as PortalLinkScope)}
                  className="h-4 w-4 accent-accent"
                />
                <span className="min-w-0 flex-1">{label}</span>
                <InfoTip label={`About ${label}`} side="left">
                  {SCOPE_HELP[scope as PortalLinkScope]}
                </InfoTip>
              </label>
            ))}
            {selectedScopes.length === 0 ? (
              <p className="text-xs text-red">Select at least one view.</p>
            ) : null}
          </fieldset>

          <div>
            <Label className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-dim">
              Expiration
              <InfoTip label="About link expiration" side="right">
                How long the link stays valid. Shorter windows are safer; use no expiration only for long-term customer accounts you trust.
              </InfoTip>
            </Label>
            <FormSelect
              value={ttl}
              onChange={setTtl}
              options={TTL_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>

          {newToken ? (
            <div className="rounded-xl border border-green/40 bg-green/10 px-4 py-4">
              <p className="text-sm font-semibold text-green">Portal link created</p>
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                Share this link with the customer. It is shown only once — copy it now.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-300 px-3 py-2 text-xs text-fg" data-testid="new-portal-link">
                  {(process.env.NEXT_PUBLIC_CUSTOMER_APP_URL ?? "http://localhost:3002").replace(/\/$/, "")}/p/{newToken}
                </code>
                <Button size="sm" variant="secondary" onClick={() => void copyToken()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-1">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Close</Button>
            {newToken ? null : (
              <Button onClick={() => void createLink()} loading={creating} disabled={selectedScopes.length === 0}>
                Create link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
