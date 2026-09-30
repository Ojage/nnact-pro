"use client";

import { usePublishingConnectionsQuery, useOauthConnectionStartMutation, useDisconnectConnectionMutation, useValidateConnectionMutation, useSelectChannelPageMutation } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { ConnectionDTO } from "@/lib/redux/api";
import { ChannelLogo } from "@/components/channel-logo";
import { cn } from "@/lib/utils";

const CHANNEL_INFO: Record<string, { label: string; blurb: string }> = {
  WEBSITE: { label: "Website", blurb: "Your NNACT Webapp blog — always available, no auth required." },
  LINKEDIN: { label: "LinkedIn", blurb: "Post content and cross-publish to company pages." },
  FACEBOOK: { label: "Facebook", blurb: "Publish to your Facebook business page." },
  INSTAGRAM: { label: "Instagram", blurb: "Publish to Instagram via the Meta Graph API." },
};

/**
 * Status is a lifecycle state, not a queue name: the raw enum read "CONNECTED"
 * / "DISCONNECTED" in caps, which is both ugly and ambiguous next to a channel
 * that is authenticated but not yet pointed at a Page.
 */
type StatusView = { label: string; dot: string; text: string; chip: string };

const STATUS: Record<string, StatusView> = {
  CONNECTED: {
    label: "Connected",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    chip: "border-emerald-500/25 bg-emerald-500/10",
  },
  DISCONNECTED: {
    label: "Not connected",
    dot: "bg-slate-400 dark:bg-slate-500",
    text: "text-fg-muted",
    chip: "border-border bg-surface-300/50",
  },
  EXPIRED: {
    label: "Token expired",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    chip: "border-amber-500/25 bg-amber-500/10",
  },
  ERROR: {
    label: "Needs attention",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    chip: "border-red-500/25 bg-red-500/10",
  },
};

const SELECT_PAGE_STATUS: StatusView = {
  label: "Select a Page",
  dot: "bg-blue-500",
  text: "text-blue-700 dark:text-blue-400",
  chip: "border-blue-500/25 bg-blue-500/10",
};

/** What this channel can actually publish, derived from the registry. */
function capabilityLine(conn?: ConnectionDTO): string | null {
  const caps = conn?.capabilities;
  if (!caps) return null;
  const kinds = [
    caps.supportsText && "Text",
    caps.supportsImages && caps.supportsVideo ? "Media" : caps.supportsImages ? "Images" : caps.supportsVideo ? "Video" : null,
  ].filter(Boolean);
  if (kinds.length === 0) return null;
  return `${kinds.join(" · ")}${caps.supportsScheduling ? " · Scheduled" : ""}`;
}


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
          const status = awaitingPage ? SELECT_PAGE_STATUS : (STATUS[conn?.status ?? ""] ?? STATUS.DISCONNECTED!);
          const caps = capabilityLine(conn);
          const connected = status.label === "Connected";
          return (
            <Card
              key={channel}
              className={cn(
                "gap-0 overflow-hidden transition-shadow duration-200 hover:shadow-md",
                connected && "border-emerald-500/30",
                !connected && isSocial && "border-dashed",
              )}
            >
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3.5">
                  <ChannelLogo channel={channel} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold tracking-tight text-fg">{info.label}</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{info.blurb}</p>
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                      status.chip,
                      status.text,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                    {status.label}
                  </span>
                </div>

                {conn?.accountName && !awaitingPage && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-100/60 px-3 py-2">
                    <span className="text-xs text-fg-muted">Connected as</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{conn.accountName}</span>
                    {conn.tokenExpiresAt && <span className="shrink-0 text-[11px] text-fg-dim">via Page token</span>}
                  </div>
                )}

                {conn?.lastError && (
                  <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    {conn.lastError}
                  </p>
                )}
                {expiry && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {expiry}
                  </p>
                )}

                {awaitingPage && !noPages && (
                  <fieldset className="space-y-1.5">
                    <legend className="mb-1.5 text-xs font-medium text-fg">Which Page should NNACT publish to?</legend>
                    {options.map((p) => {
                      const disabled = !p.canPublish;
                      return (
                        <label
                          key={p.id}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors",
                            disabled
                              ? "border-border opacity-55"
                              : "cursor-pointer border-border hover:border-accent/40 hover:bg-surface-100",
                            selected === p.id && !disabled && "border-accent bg-accent-muted",
                          )}
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
                          <span className="min-w-0 flex-1 truncate text-fg">{p.name}</span>
                          {disabled && <span className="shrink-0 text-xs text-fg-muted">read-only</span>}
                        </label>
                      );
                    })}
                  </fieldset>
                )}

                {noPages && (
                  <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    No Pages were shared with this app. Reconnect and choose &ldquo;Pages&rdquo; when Facebook asks for
                    access, using an account that administers the Page.
                  </p>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
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
                  {caps && <span className="ml-auto text-[11px] text-fg-dim">{caps}</span>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
