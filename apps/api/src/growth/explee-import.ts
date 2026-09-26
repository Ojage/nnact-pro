// Read-only Explee import adapter — preview or import prospects without write-back.

export interface ExpleeProspectRow {
  companyName: string;
  email?: string;
  phone?: string;
  websiteDomain?: string;
  industry?: string;
  city?: string;
  notes?: string;
}

export interface ExpleeFetchResult {
  rows: ExpleeProspectRow[];
  source: "api" | "fixture" | "unconfigured";
  error?: string;
}

/** Fetches read-only prospect rows from Explee when configured. */
export async function fetchExpleeProspects(env: NodeJS.ProcessEnv = process.env): Promise<ExpleeFetchResult> {
  const base = env.EXPLEE_READ_API_URL?.trim();
  const token = env.EXPLEE_READ_API_TOKEN?.trim();
  if (!base || !token) {
    if (env.NODE_ENV === "test" || env.PUBLISHING_DEV_MODE === "true") {
      return {
        source: "fixture",
        rows: [
          {
            companyName: "Explee Fixture Hotel",
            email: "facilities@explee-fixture.example",
            websiteDomain: "explee-fixture.example",
            industry: "Hotels",
            city: "Douala",
            notes: "Read-only fixture row for dev/test",
          },
        ],
      };
    }
    return { source: "unconfigured", rows: [], error: "EXPLEE_READ_API_URL and EXPLEE_READ_API_TOKEN not set" };
  }

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/prospects`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return { source: "api", rows: [], error: `Explee API returned ${response.status}` };
    }
    const json = (await response.json()) as unknown;
    const list = Array.isArray(json) ? json : (json as { prospects?: unknown[] })?.prospects ?? [];
    const rows: ExpleeProspectRow[] = [];
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const companyName = String(r.company_name ?? r.companyName ?? "").trim();
      if (!companyName) continue;
      rows.push({
        companyName,
        email: r.email ? String(r.email) : undefined,
        phone: r.phone ? String(r.phone) : undefined,
        websiteDomain: r.website ?? r.website_domain ? String(r.website ?? r.website_domain) : undefined,
        industry: r.industry ? String(r.industry) : undefined,
        city: r.city ? String(r.city) : undefined,
        notes: r.notes ? String(r.notes) : "Imported from Explee (read-only)",
      });
    }
    return { source: "api", rows };
  } catch (error) {
    return { source: "api", rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}
