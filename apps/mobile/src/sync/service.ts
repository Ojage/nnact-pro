import type { SyncResponseDTO } from "@ofp/shared";

export interface SyncServiceOptions {
  apiUrl: string;
  orgId: string;
  token: string;
}

export class SyncService {
  constructor(private opts: SyncServiceOptions) {}

  /** Pull delta from the server: POST /api/sync with an empty batch (just to get server-side changes).
   *  The server sync endpoint accepts ops but for a pull-only we send an empty batch.
   */
  async pull(): Promise<SyncResponseDTO> {
    const res = await fetch(`${this.opts.apiUrl}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.opts.token}`,
      },
      body: JSON.stringify({
        ops: [],
        orgId: this.opts.orgId,
      }),
    });
    if (!res.ok) throw new Error(`sync pull failed: ${res.status}`);
    return res.json() as Promise<SyncResponseDTO>;
  }
}
