// Notifications — operator alerts via NTFY_URL push (and a console fallback).
// Used for slot failures, provider failures, budget alarms, the weekly digest,
// and critical health. Never includes API keys or content bodies.
type NotifyKind = "slot_succeeded" | "slot_failed" | "provider_failed" | "budget_alarm" | "weekly_digest" | "health_critical";

export async function inform(kind: NotifyKind, payload: Record<string, unknown>): Promise<void> {
  const { title, message } = formatMessage(kind, payload);
  console[payload.level === "error" ? "error" : "log"](`[ai:${kind}] ${title} — ${message}`);
  const ntfyUrl = process.env.NTFY_URL?.trim();
  if (ntfyUrl) {
    try {
      await fetch(ntfyUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, message, priority: payload.level === "error" ? "high" : "default", tags: ["nnact-ai"] }),
      }).then((response) => {
        if (!response.ok) console.warn(`[ai] ntfy push failed: ${response.status}`);
      });
    } catch (error) {
      console.warn(`[ai] ntfy push error: ${(error as Error).message}`);
    }
  }
}

function formatMessage(kind: NotifyKind, payload: Record<string, unknown>): { title: string; message: string } {
  const company = String(payload.companyName ?? "");
  switch (kind) {
    case "slot_succeeded":
      return { title: `AI slot published${company ? ` · ${company}` : ""}`, message: `${payload.slot ?? ""} ${payload.isoDate ?? ""} → website:${payload.website ? "yes" : "no"} linkedin:${payload.linkedin ? "yes" : "no"} (${payload.provider ?? "?"})` };
    case "slot_failed":
      return { title: `AI slot FAILED${company ? ` · ${company}` : ""}`, message: `${payload.slot ?? ""} ${payload.isoDate ?? ""}: ${String(payload.error ?? "unknown error")}` };
    case "provider_failed":
      return { title: `AI provider degraded${company ? ` · ${company}` : ""}`, message: `${payload.provider ?? "?"} → ${String(payload.error ?? "unknown")}` };
    case "budget_alarm":
      return { title: `AI budget alert${company ? ` · ${company}` : ""}`, message: `Daily ${payload.dailySpentCents}c / ${payload.dailyLimitCents}c · monthly ${payload.monthlySpentCents}c / ${payload.monthlyLimitCents}c` };
    case "weekly_digest":
      return { title: `AI weekly digest · ${payload.weekLabel ?? ""}`, message: `website ${payload.websitePublished ?? 0}, linkedin ${payload.linkedinPublished ?? 0}, images ${payload.generatedImages ?? 0}, blocked ${payload.blockedPosts ?? 0}, cost ${payload.totalCostCents ?? 0}c` };
    case "health_critical":
      return { title: `AI health CRITICAL${company ? ` · ${company}` : ""}`, message: String(payload.reason ?? "") };
    default:
      return { title: `AI ${kind}`, message: JSON.stringify(payload) };
  }
}