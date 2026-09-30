"use client";

import { usePublishingConnectionsQuery, useOauthConnectionStartMutation, useDisconnectConnectionMutation, useValidateConnectionMutation, useSelectChannelPageMutation } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import type { ConnectionDTO } from "@/lib/redux/api";

const CHANNEL_INFO: Record<string, { label: string; blurb: string }> = {
  WEBSITE: { label: "Website", blurb: "Your NNACT Webapp blog — always available, no auth required." },
  LINKEDIN: { label: "LinkedIn", blurb: "Post content and cross-publish to company pages." },
  FACEBOOK: { label: "Facebook", blurb: "Publish to your Facebook business page." },
  INSTAGRAM: { label: "Instagram", blurb: "Publish to Instagram via the Meta Graph API." },
};

const STATUS_COLOR: Record<string, string> = {
  CONNECTED: "bg-green/10 text-green",
  DISCONNECTED: "bg-fg-dim/10 text-fg-dim",
  EXPIRED: "bg-red/10 text-red",
  ERROR: "bg-red/10 text-red",
};

interface PageOption {
  id: string;
  name: string;
  picture?: string | null;
  canPublish: boolean;
  tasks?: string[];
}

function pageOptions(conn?: ConnectionDTO): PageOption[] {
  const raw = conn?.metadata?.availablePages;
  return Array.isArray(raw) ? (raw as PageOption[]) : [];
}

/** A Meta connection is authorised but not yet pointed at a Page. */
function needsPageSelection(conn?: ConnectionDTO): boolean {
  return conn?.status === "DISCONNECTED" && conn?.metadata?.pageSelectionRequired === true;
}

/** Page tokens last ~60 days; warn before publishing starts failing at 463. */
function expiryWarning(conn?: ConnectionDTO): string | null {
  if (!conn?.tokenExpiresAt) return null;
  const ms = new Date(conn.tokenExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days < 0) return "Page access token has expired. Reconnect to resume publishing.";
  if (days <= 14) return `Page access token expires in ${days} day${days === 1 ? "" : "s"}. Reconnect to renew.`;
  return null;
}

export default function ConnectionsPage() {
  const { data, isLoading, isError, refetch } = usePublishingConnectionsQuery();
  const [startOauth] = useOauthConnectionStartMutation();
  const [disconnect] = useDisconnectConnectionMutation();
  const [validate, { isLoading: validating }] = useValidateConnectionMutation();
  const [selectPage, { isLoading: selectingPage }] = useSelectChannelPageMutation();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState<{ channel: string; pageId: string } | null>(null);

  if (isLoading) {
    return <div className="space-y-4"><PageHeader title="Channels" description="Manage your publishing channel connections" /><Skeleton className="h-40" /></div>;
  }
  if (isError || !data) {
    return (
      <div>
        <PageHeader title="Channels" description="Manage your publishing channel connections" />
        <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load connections</p></CardContent></Card>
      </div>
    );
  }

  const handleConnect = async (channel: string) => {
    setMessage(null);
    try {
      const { url } = await startOauth(channel as "LINKEDIN" | "FACEBOOK" | "INSTAGRAM").unwrap();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setMessage("Failed to start OAuth. Ensure provider credentials are configured.");
    }
  };

  const handleValidate = async (channel: string) => {
    setMessage(null);
    try {
      const res = await validate(channel as "WEBSITE" | "LINKEDIN" | "FACEBOOK" | "INSTAGRAM").unwrap();
      setMessage(res.valid ? `${channel} is connected${res.accountName ? ` as ${res.accountName}` : ""}.` : `Validation failed${res.errorMessage ? `: ${res.errorMessage}` : ""}.`);
      refetch();
    } catch (err) {
      const detail = typeof err === "object" && err !== null && "data" in err
        ? ((err as { data?: { error?: string } }).data?.error ?? "")
        : "";
      setMessage(`Validation failed${detail ? `: ${detail}` : ""}.`);
    }
  };

  const handleDisconnect = async (channel: string) => {
    setMessage(null);
    try {
      await disconnect(channel as "LINKEDIN" | "FACEBOOK" | "INSTAGRAM").unwrap();
      refetch();
    } catch {
      setMessage("Failed to disconnect. Check permissions and try again.");
    }
  };

  const handleSelectPage = async (channel: string) => {
    if (!pendingPage || pendingPage.channel !== channel) return;
    setMessage(null);
    try {
      const res = await selectPage({ channel: channel as "FACEBOOK" | "INSTAGRAM", pageId: pendingPage.pageId }).unwrap();
      setMessage(`Now publishing to ${res.accountName ?? "the selected Page"}.`);
      setPendingPage(null);
      refetch();
    } catch (err) {
      const detail = typeof err === "object" && err !== null && "data" in err
        ? ((err as { data?: { error?: string } }).data?.error ?? "")
        : "";
      setMessage(`Could not select that Page${detail ? `: ${detail}` : ""}.`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Connect the platforms NNACT publishes content to"
        actions={<Button variant="secondary" onClick={refetch}>Refresh</Button>}
      />

      {message && <Card className="border-border bg-surface-300/50"><CardContent className="p-3"><p className="text-sm text-fg">{message}</p></CardContent></Card>}

      <div className="grid gap-4 md:grid-cols-2" data-tour="channels-grid">
        {data.channels.map((channel) => {
          const info = CHANNEL_INFO[channel] ?? { label: channel, blurb: "" };
          const conn = data.connections.find((c) => c.channel === channel);
          const isSocial = channel !== "WEBSITE";
          const options = pageOptions(conn);
          const awaitingPage = needsPageSelection(conn);
          const noPages = awaitingPage && options.length === 0;
          const expiry = expiryWarning(conn);
          const selected = pendingPage?.channel === channel ? pendingPage.pageId : null;
          return (
            <Card key={channel}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{info.label}</h3>
                    <p className="mt-1 text-xs text-fg-muted">{info.blurb}</p>
                  </div>
                  <Badge className={`${STATUS_COLOR[conn?.status ?? "DISCONNECTED"] ?? ""} border-transparent`}>
                    {awaitingPage ? "SELECT PAGE" : (conn?.status ?? "DISCONNECTED")}
                  </Badge>
                </div>

                {conn && conn.accountName && !awaitingPage && (
                  <p className="mt-3 text-xs text-fg-muted">Connected as: <span className="text-fg">{conn.accountName}</span></p>
                )}
                {conn?.lastError && <p className="mt-1 text-xs text-red">{conn.lastError}</p>}
                {expiry && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{expiry}</p>}

                {awaitingPage && !noPages && (
                  <fieldset className="mt-4 space-y-2">
                    <legend className="text-xs font-medium text-fg">Which Page should NNACT publish to?</legend>
                    {options.map((p) => {
                      const disabled = !p.canPublish;
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm ${
                            disabled ? "opacity-50" : "cursor-pointer hover:bg-surface-300/60"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`page-${channel}`}
                            value={p.id}
                            checked={selected === p.id}
                            disabled={disabled}
                            onChange={() => setPendingPage({ channel, pageId: p.id })}
                            className="accent-fg"
                          />
                          {p.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.picture} alt="" className="h-7 w-7 rounded-full" />
                          ) : null}
                          <span className="text-fg">{p.name}</span>
                          {disabled && <span className="ml-auto text-xs text-fg-muted">read-only</span>}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {noPages && (
                  <p className="mt-3 text-xs text-fg-muted">
                    No Pages were shared with this app. Reconnect and choose &ldquo;Pages&rdquo; when Facebook asks for
                    access, using an account that administers the Page.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {awaitingPage ? (
                    <>
                      {options.length > 0 && (
                        <Button loading={selectingPage} disabled={!selected} onClick={() => handleSelectPage(channel)}>
                          Use this Page
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => handleConnect(channel)}>Reconnect</Button>
                    </>
                  ) : isSocial ? (
                    !conn || conn.status === "DISCONNECTED" ? (
                      <Button onClick={() => handleConnect(channel)}>Connect</Button>
                    ) : (
                      <>
                        <Button variant="secondary" loading={validating} onClick={() => handleValidate(channel)}>Validate</Button>
                        <Button variant="danger" onClick={() => handleDisconnect(channel)}>Disconnect</Button>
                      </>
                    )
                  ) : (
                    <Button variant="secondary" loading={validating} onClick={() => handleValidate(channel)}>Validate</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
