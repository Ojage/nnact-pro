import * as SQLite from "expo-sqlite";

export interface SyncServiceOptions {
  apiUrl: string;
  orgId: string;
  token: string;
}

export type OfflineOpKind =
  | "measurement.create"
  | "session.patch"
  | "correction.create";

export interface OfflineOperation {
  opId: string;
  kind: OfflineOpKind;
  payload: Record<string, unknown>;
}

export interface FieldPackage {
  packageVersion: number;
  generatedAt: string;
  job: Record<string, unknown>;
  equipment: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  measurements: Array<Record<string, unknown>>;
  supportState: string;
  downloadReady: boolean;
}

export interface FieldSyncResult {
  downloaded: number;
  queuedBeforeFlush: number;
  flushed: number;
  failed: number;
  cachedJobs: string[];
}

interface OutboxRow {
  op_id: string;
  kind: OfflineOpKind;
  payload_json: string;
  attempts: number;
}

interface PackageRow {
  payload_json: string;
}

function makeId(): string {
  const cryptoLike = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export class SyncService {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

  constructor(private opts: SyncServiceOptions) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {}),
      ...(this.opts.orgId ? { "x-org-id": this.opts.orgId } : {}),
    };
  }

  private async database(): Promise<SQLite.SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = SQLite.openDatabaseAsync("openfieldpro-field.db").then(
        async (database) => {
          await database.execAsync(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS field_packages (
              job_id TEXT PRIMARY KEY NOT NULL,
              payload_json TEXT NOT NULL,
              workflow_version TEXT,
              support_state TEXT NOT NULL,
              download_ready INTEGER NOT NULL DEFAULT 0,
              cached_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diagnostic_outbox (
              op_id TEXT PRIMARY KEY NOT NULL,
              kind TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              created_at TEXT NOT NULL
            );
          `);
          return database;
        },
      );
    }
    return this.databasePromise;
  }

  async downloadPackage(jobId: string): Promise<FieldPackage> {
    const response = await fetch(
      `${this.opts.apiUrl}/api/diagnostics/field-package/${jobId}`,
      { headers: this.headers() },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`field package failed: ${response.status} ${body}`);
    }

    const fieldPackage = (await response.json()) as FieldPackage;
    const database = await this.database();
    const workflowVersion =
      fieldPackage.session && typeof fieldPackage.session.workflowVersion === "number"
        ? String(fieldPackage.session.workflowVersion)
        : null;

    await database.runAsync(
      `INSERT OR REPLACE INTO field_packages
        (job_id, payload_json, workflow_version, support_state, download_ready, cached_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      jobId,
      JSON.stringify(fieldPackage),
      workflowVersion,
      fieldPackage.supportState,
      fieldPackage.downloadReady ? 1 : 0,
      new Date().toISOString(),
    );
    return fieldPackage;
  }

  async getCachedPackage(jobId: string): Promise<FieldPackage | null> {
    const database = await this.database();
    const row = await database.getFirstAsync<PackageRow>(
      "SELECT payload_json FROM field_packages WHERE job_id = ? LIMIT 1",
      jobId,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as FieldPackage;
    } catch {
      return null;
    }
  }

  async listCachedPackages(): Promise<FieldPackage[]> {
    const database = await this.database();
    const rows = await database.getAllAsync<PackageRow>(
      "SELECT payload_json FROM field_packages ORDER BY cached_at DESC",
    );
    return rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload_json) as FieldPackage];
      } catch {
        return [];
      }
    });
  }

  async queuedCount(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM diagnostic_outbox",
    );
    return row?.count ?? 0;
  }

  async queueOperation(operation: OfflineOperation): Promise<void> {
    const database = await this.database();
    await database.runAsync(
      `INSERT OR REPLACE INTO diagnostic_outbox
        (op_id, kind, payload_json, attempts, last_error, created_at)
       VALUES (?, ?, ?, 0, NULL, ?)`,
      operation.opId,
      operation.kind,
      JSON.stringify(operation.payload),
      new Date().toISOString(),
    );
  }

  async queueMeasurement(input: {
    sessionId: string;
    stepId: string;
    valueText?: string;
    unit?: string;
    result: "pass" | "fail" | "within_range" | "out_of_range" | "unable" | "not_reproduced";
    note?: string;
    unableReason?: string;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `measurement:${id}`,
      kind: "measurement.create",
      payload: { id, ...input, recordedAt: new Date().toISOString() },
    });
    return id;
  }

  async queueSessionPatch(input: {
    sessionId: string;
    baseVersion: number;
    status?: string;
    customerComplaint?: string | null;
    technicianObservation?: string | null;
    errorCodes?: string[];
    serviceTests?: Array<{ name: string; result?: string; note?: string }>;
    disposition?: string | null;
    summary?: string | null;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `session:${id}`,
      kind: "session.patch",
      payload: input,
    });
    return id;
  }

  async queueCorrection(input: {
    workflowId: string;
    workflowVersion: number;
    sessionId?: string;
    stepId?: string;
    category: string;
    severity: "low" | "medium" | "high" | "safety_critical";
    description: string;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `correction:${id}`,
      kind: "correction.create",
      payload: { id, ...input },
    });
    return id;
  }

  async flushOutbox(): Promise<{ flushed: number; failed: number }> {
    const database = await this.database();
    const rows = await database.getAllAsync<OutboxRow>(
      "SELECT op_id, kind, payload_json, attempts FROM diagnostic_outbox ORDER BY created_at ASC LIMIT 200",
    );
    if (rows.length === 0) return { flushed: 0, failed: 0 };

    const operations = rows.flatMap((row) => {
      try {
        return [
          {
            opId: row.op_id,
            kind: row.kind,
            payload: JSON.parse(row.payload_json) as Record<string, unknown>,
          },
        ];
      } catch {
        return [];
      }
    });

    const response = await fetch(`${this.opts.apiUrl}/api/diagnostics/offline-batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ops: operations }),
    });
    if (!response.ok) throw new Error(`diagnostic outbox flush failed: ${response.status}`);

    const body = (await response.json()) as {
      results: Array<{
        opId: string;
        ok: boolean;
        conflict?: { currentVersion: number };
        error?: string;
      }>;
    };

    let flushed = 0;
    let failed = 0;
    await database.withExclusiveTransactionAsync(async () => {
      for (const result of body.results) {
        if (result.ok) {
          await database.runAsync(
            "DELETE FROM diagnostic_outbox WHERE op_id = ?",
            result.opId,
          );
          flushed += 1;
        } else {
          await database.runAsync(
            `UPDATE diagnostic_outbox
             SET attempts = attempts + 1, last_error = ?
             WHERE op_id = ?`,
            result.conflict
              ? `conflict: server version ${result.conflict.currentVersion}`
              : result.error ?? "unknown error",
            result.opId,
          );
          failed += 1;
        }
      }
    });

    return { flushed, failed };
  }

  /**
   * Synchronize field work as coherent job/appliance/diagnostic packages.
   * This replaces the former empty generic sync request, which could not
   * populate a durable local mirror.
   */
  async pull(): Promise<FieldSyncResult> {
    const queuedBeforeFlush = await this.queuedCount();
    const flush = await this.flushOutbox().catch(() => ({ flushed: 0, failed: queuedBeforeFlush }));

    const [appointmentsResponse, sessionsResponse] = await Promise.all([
      fetch(`${this.opts.apiUrl}/api/appointments`, { headers: this.headers() }),
      fetch(`${this.opts.apiUrl}/api/diagnostics/sessions`, { headers: this.headers() }),
    ]);
    if (!appointmentsResponse.ok) {
      throw new Error(`appointment package discovery failed: ${appointmentsResponse.status}`);
    }

    const appointments = (await appointmentsResponse.json()) as Array<{
      jobId: string;
      startsAt: string;
      endsAt: string;
    }>;
    const sessions = sessionsResponse.ok
      ? ((await sessionsResponse.json()) as Array<{ session: { jobId: string; status: string } }>)
      : [];

    const now = Date.now();
    const horizon = now + 7 * 24 * 60 * 60 * 1000;
    const jobIds = new Set<string>();
    for (const appointment of appointments) {
      const starts = new Date(appointment.startsAt).getTime();
      const ends = new Date(appointment.endsAt).getTime();
      if (starts <= horizon && ends >= now - 24 * 60 * 60 * 1000) jobIds.add(appointment.jobId);
    }
    for (const item of sessions) {
      if (!["completed", "inconclusive"].includes(item.session.status)) {
        jobIds.add(item.session.jobId);
      }
    }

    let downloaded = 0;
    let failed = flush.failed;
    for (const jobId of jobIds) {
      try {
        await this.downloadPackage(jobId);
        downloaded += 1;
      } catch {
        failed += 1;
      }
    }

    return {
      downloaded,
      queuedBeforeFlush,
      flushed: flush.flushed,
      failed,
      cachedJobs: [...jobIds],
    };
  }
}
