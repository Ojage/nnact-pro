// Typed client for the OFP inbound plugin API (/api/plugin/v1/*). A plugin
// authenticates with the per-install scoped token it was issued at install.
export interface OFPClientOptions {
  /** OFP API base, e.g. "https://app.example.com" or "http://localhost:3001". */
  baseUrl: string;
  /** The install's scoped token (ofp_…). */
  token: string;
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface MeResponse {
  orgId: string;
  installId: string | null;
  scopes: string[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export class OFPApiError extends Error {
  constructor(public status: number, public path: string, body: string) {
    super(`OFP ${path} -> HTTP ${status}: ${body}`);
    this.name = "OFPApiError";
  }
}

export class OFPClient {
  constructor(private opts: OFPClientOptions) {}

  private async get<T>(path: string): Promise<T> {
    const f = this.opts.fetch ?? fetch;
    const res = await f(`${this.opts.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${this.opts.token}` },
    });
    if (!res.ok) throw new OFPApiError(res.status, path, await res.text().catch(() => ""));
    return res.json() as Promise<T>;
  }

  /** Identity + granted scopes for this install. */
  me(): Promise<MeResponse> {
    return this.get<MeResponse>("/api/plugin/v1/me");
  }

  /** List the org's customers (requires the customers:read scope). */
  customers(): Promise<CustomerSummary[]> {
    return this.get<CustomerSummary[]>("/api/plugin/v1/customers");
  }
}
