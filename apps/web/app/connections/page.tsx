"use client";

import { usePublishingConnectionsQuery, useOauthConnectionStartMutation, useDisconnectConnectionMutation, useValidateConnectionMutation } from "@/lib/redux/api";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

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

export default function ConnectionsPage() {
  const { data, isLoading, isError, refetch } = usePublishingConnectionsQuery();
  const [startOauth] = useOauthConnectionStartMutation();
  const [disconnect] = useDisconnectConnectionMutation();
  const [validate, { isLoading: validating }] = useValidateConnectionMutation();
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Connect the platforms NNACT publishes content to"
        actions={<Button variant="secondary" onClick={refetch}>Refresh</Button>}
      />

      {message && <Card className="border-border bg-surface-300/50"><CardContent className="p-3"><p className="text-sm text-fg">{message}</p></CardContent></Card>}

      <div className="grid gap-4 md:grid-cols-2">
        {data.channels.map((channel) => {
          const info = CHANNEL_INFO[channel] ?? { label: channel, blurb: "" };
          const conn = data.connections.find((c) => c.channel === channel);
          const isSocial = channel !== "WEBSITE";
          return (
            <Card key={channel}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-fg">{info.label}</h3>
                    <p className="mt-1 text-xs text-fg-muted">{info.blurb}</p>
                  </div>
                  <Badge className={`${STATUS_COLOR[conn?.status ?? "DISCONNECTED"] ?? ""} border-transparent`}>
                    {conn?.status ?? "DISCONNECTED"}
                  </Badge>
                </div>

                {conn && conn.accountName && (
                  <p className="mt-3 text-xs text-fg-muted">Connected as: <span className="text-fg">{conn.accountName}</span></p>
                )}
                {conn?.lastError && <p className="mt-1 text-xs text-red">{conn.lastError}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {isSocial ? (
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
