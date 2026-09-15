import * as SQLite from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";

const REQUEST_TIMEOUT_MS = 12_000;
const MEDIA_FLUSH_LIMIT = 10;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("network request failed");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface SyncServiceOptions {
  apiUrl: string;
  orgId: string;
  token: string;
}

export type OfflineOpKind =
  | "measurement.create"
  | "session.create"
  | "session.patch"
  | "correction.create"
  | "job.status";

export interface OfflineOperation {
  opId: string;
  kind: OfflineOpKind;
  payload: Record<string, unknown>;
}

export interface FieldPackage {
  packageVersion: number;
  generatedAt: string;
  job: Record<string, unknown>;
  customer: Record<string, unknown> | null;
  equipment: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  workflow: Record<string, unknown> | null;
  steps: Array<Record<string, unknown>>;
  measurements: Array<Record<string, unknown>>;
  supportState: string;
  downloadReady: boolean;
}

export interface MediaOutboxItem {
  mediaId: string;
  kind: "photo" | "voice_note";
  jobId: string;
  localUri: string;
  durationMs: number | null;
  attempts: number;
  createdAt: string;
}

export interface FieldSyncResult {
  downloaded: number;
  queuedBeforeFlush: number;
  flushed: number;
  failed: number;
  flushedMedia: number;
  mediaFailed: number;
  queuedMedia: number;
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

interface MediaOutboxRow {
  media_id: string;
  kind: string;
  job_id: string;
  file_uri: string;
  duration_ms: number | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
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

const SCHEMA_SQL = `
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
    CREATE TABLE IF NOT EXISTS media_outbox (
      media_id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      job_id TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      duration_ms INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
  `;

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

  private async openDatabase(): Promise<SQLite.SQLiteDatabase> {
    const database = await SQLite.openDatabaseAsync("nnactpro-field.db");
    try {
      await database.execAsync(SCHEMA_SQL);
    } catch (error) {
      // A failed schema bootstrap can leave the native handle unusable
      // (e.g. NullPointerException from a stale connection). Drop it and
      // let the next attempt open a fresh connection.
      try {
        await database.closeAsync();
      } catch {
        // ignore close failures — the handle is already broken
      }
      throw error;
    }
    return database;
  }

  private async database(): Promise<SQLite.SQLiteDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = this.openDatabase().catch((error) => {
        this.databasePromise = null;
        throw error;
      });
    }
    try {
      return await this.databasePromise;
    } catch (error) {
      this.databasePromise = null;
      throw error;
    }
  }

  async downloadPackage(jobId: string): Promise<FieldPackage> {
    const response = await fetchWithTimeout(
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

  /**
   * Resolve a diagnostic session for offline viewing.
   *
   * Prefers a downloaded field package whose session matches. When a session
   * was created offline (a queued `session.create` op that has not synced yet),
   * synthesizes a session view from that op plus the job's cached package so a
   * technician can keep recording readings with no connectivity.
   */
  async getCachedSessionDetail(sessionId: string): Promise<FieldPackage | null> {
    const database = await this.database();
    const rows = await database.getAllAsync<PackageRow>(
      "SELECT payload_json FROM field_packages",
    );
    const packages = rows.flatMap((row) => {
      try {
        return [JSON.parse(row.payload_json) as FieldPackage];
      } catch {
        return [];
      }
    });

    const existing = packages.find((pkg) => pkg.session?.id === sessionId);
    if (existing) return existing;

    const createOp = await this.findQueuedOp("session.create", (payload) => payload.id === sessionId);
    if (createOp) {
      const payload = createOp.payload as {
        id: string;
        jobId: string;
        equipmentId: string;
        workflowId: string;
        customerComplaint?: string;
        technicianObservation?: string;
      };
      const jobPackage = packages.find((pkg) => pkg.job && pkg.job.id === createOp.payload.jobId);
      if (jobPackage) {
        return {
          ...jobPackage,
          session: {
            id: payload.id,
            jobId: payload.jobId,
            equipmentId: payload.equipmentId,
            workflowId: payload.workflowId,
            status: "workflow_ready",
            customerComplaint: payload.customerComplaint ?? null,
            technicianObservation: payload.technicianObservation ?? null,
            version: 1,
            updatedAt: new Date().toISOString(),
          },
          measurements: [],
        };
      }
    }

    return null;
  }

  /** Job plus customer from the cached field package — used for offline job detail. */
  async getCachedJobDetail(jobId: string): Promise<FieldPackage | null> {
    return this.getCachedPackage(jobId);
  }

  async queuedCount(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM diagnostic_outbox",
    );
    return row?.count ?? 0;
  }

  async queuedMediaCount(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM media_outbox",
    );
    return row?.count ?? 0;
  }

  /** Total pending changes across the diagnostic outbox and media outbox. */
  async pendingCount(): Promise<number> {
    return (await this.queuedCount()) + (await this.queuedMediaCount());
  }

  /** Queued offline ops for a session (measurements, then patches). */
  async listQueuedSessionOps(sessionId: string): Promise<{
    measurements: Array<Record<string, unknown>>;
    patches: Array<Record<string, unknown>>;
  }> {
    const database = await this.database();
    const rows = await database.getAllAsync<OutboxRow>(
      "SELECT kind, payload_json FROM diagnostic_outbox ORDER BY created_at ASC",
    );
    const measurements: Array<Record<string, unknown>> = [];
    const patches: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        if (payload.sessionId !== sessionId) continue;
        if (row.kind === "measurement.create") measurements.push(payload);
        else if (row.kind === "session.patch") patches.push(payload);
      } catch {
        // skip malformed rows
      }
    }
    return { measurements, patches };
  }

  private async findQueuedOp(
    kind: OfflineOpKind,
    predicate: (payload: Record<string, unknown>) => boolean,
  ): Promise<{ kind: OfflineOpKind; payload: Record<string, unknown> } | null> {
    const database = await this.database();
    const rows = await database.getAllAsync<OutboxRow>(
      "SELECT kind, payload_json FROM diagnostic_outbox",
    );
    for (const row of rows) {
      try {
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        if (row.kind === kind && predicate(payload)) return { kind: row.kind, payload };
      } catch {
        // skip malformed rows
      }
    }
    return null;
  }

  async countCachedPackages(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM field_packages",
    );
    return row?.count ?? 0;
  }

  async storedBytes(): Promise<number> {
    const database = await this.database();
    const row = await database.getFirstAsync<{ total: number | null }>(
      "SELECT SUM(LENGTH(payload_json)) AS total FROM field_packages",
    );
    return row?.total ?? 0;
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

  async queueSessionCreate(input: {
    jobId: string;
    equipmentId: string;
    workflowId: string;
    customerComplaint?: string;
    technicianObservation?: string;
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `session-create:${id}`,
      kind: "session.create",
      payload: { id, ...input },
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

  async queueJobStatus(input: {
    jobId: string;
    toStatus: "scheduled" | "in_progress" | "completed" | "canceled";
    baseStatus?: "scheduled" | "in_progress" | "completed" | "canceled";
  }): Promise<string> {
    const id = makeId();
    await this.queueOperation({
      opId: `job:${id}`,
      kind: "job.status",
      payload: input,
    });
    return id;
  }

  /** Session summaries for sessions created offline (queued `session.create` ops). */
  async listQueuedSessionCreates(): Promise<Array<{
    id: string;
    jobId: string;
    equipmentId: string;
    workflowId: string;
    status: string;
  }>> {
    const database = await this.database();
    const rows = await database.getAllAsync<OutboxRow>(
      "SELECT payload_json FROM diagnostic_outbox WHERE kind = ?",
      "session.create",
    );
    return rows.flatMap((row) => {
      try {
        const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
        if (
          typeof payload.id !== "string" ||
          typeof payload.jobId !== "string" ||
          typeof payload.workflowId !== "string"
        ) {
          return [];
        }
        return [
          {
            id: payload.id,
            jobId: payload.jobId,
            equipmentId: typeof payload.equipmentId === "string" ? payload.equipmentId : "",
            workflowId: payload.workflowId,
            status: "workflow_ready",
          },
        ];
      } catch {
        return [];
      }
    });
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

    const response = await fetchWithTimeout(`${this.opts.apiUrl}/api/diagnostics/offline-batch`, {
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

  private async persistMediaFile(
    sourceUri: string,
    kind: "photo" | "voice_note",
  ): Promise<string> {
    const dir = new Directory(Paths.document, "nnact-media", kind);
    dir.create({ intermediates: true, idempotent: true });
    const ext = /\.([a-zA-Z0-9]+)$/.exec(sourceUri)?.[1] ?? (kind === "photo" ? "jpg" : "m4a");
    const destination = new File(dir, `${makeId()}.${ext}`);
    const source = new File(sourceUri);
    if (!source.exists) throw new Error("captured media file is missing");
    source.copy(destination);
    return destination.uri;
  }

  private async insertMediaRow(payload: {
    mediaId: string;
    kind: "photo" | "voice_note";
    jobId: string;
    localUri: string;
    durationMs: number | null;
  }): Promise<void> {
    const database = await this.database();
    await database.runAsync(
      `INSERT OR REPLACE INTO media_outbox
        (media_id, kind, job_id, file_uri, duration_ms, attempts, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, ?)`,
      payload.mediaId,
      payload.kind,
      payload.jobId,
      payload.localUri,
      payload.durationMs,
      new Date().toISOString(),
    );
  }

  private static toMediaItem(row: MediaOutboxRow): MediaOutboxItem {
    return {
      mediaId: row.media_id,
      kind: (row.kind as MediaOutboxItem["kind"]) ?? "photo",
      jobId: row.job_id,
      localUri: row.file_uri,
      durationMs: row.duration_ms,
      attempts: row.attempts,
      createdAt: row.created_at,
    };
  }

  /**
   * Queue a field photo offline. The captured image is copied into the app's
   * persistent media directory so the queue survives restarts.
   */
  async queuePhoto(jobId: string, sourceUri: string): Promise<MediaOutboxItem> {
    const mediaId = makeId();
    const localUri = await this.persistMediaFile(sourceUri, "photo");
    await this.insertMediaRow({ mediaId, kind: "photo", jobId, localUri, durationMs: null });
    return SyncService.toMediaItem({
      media_id: mediaId,
      kind: "photo",
      job_id: jobId,
      file_uri: localUri,
      duration_ms: null,
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    });
  }

  /** Queue a voice note offline (e.g. "voice to dispatch") for later upload. */
  async queueVoiceNote(jobId: string, sourceUri: string, durationMs: number): Promise<MediaOutboxItem> {
    const mediaId = makeId();
    const localUri = await this.persistMediaFile(sourceUri, "voice_note");
    await this.insertMediaRow({
      mediaId,
      kind: "voice_note",
      jobId,
      localUri,
      durationMs: Math.round(durationMs),
    });
    return SyncService.toMediaItem({
      media_id: mediaId,
      kind: "voice_note",
      job_id: jobId,
      file_uri: localUri,
      duration_ms: Math.round(durationMs),
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    });
  }

  async listQueuedMedia(jobId: string): Promise<MediaOutboxItem[]> {
    const database = await this.database();
    const rows = await database.getAllAsync<MediaOutboxRow>(
      "SELECT * FROM media_outbox WHERE job_id = ? ORDER BY created_at ASC",
      jobId,
    );
    return rows.map(SyncService.toMediaItem);
  }

  /**
   * Upload queued media to the job photo / voice-note endpoints. Uploaded rows
   * are deleted; failures stay queued with incremented attempts. A stale or
   * revoked token simply defers the upload to the next sync.
   */
  async flushMediaOutbox(): Promise<{ flushed: number; failed: number }> {
    const database = await this.database();
    const rows = await database.getAllAsync<MediaOutboxRow>(
      "SELECT * FROM media_outbox ORDER BY created_at ASC LIMIT ?",
      MEDIA_FLUSH_LIMIT,
    );
    if (rows.length === 0) return { flushed: 0, failed: 0 };

    let flushed = 0;
    let failed = 0;
    for (const row of rows) {
      if (await this.uploadMediaRow(row)) {
        await database.runAsync("DELETE FROM media_outbox WHERE media_id = ?", row.media_id);
        flushed += 1;
      } else {
        await database.runAsync(
          "UPDATE media_outbox SET attempts = attempts + 1, last_error = ? WHERE media_id = ?",
          "upload deferred while offline",
          row.media_id,
        );
        failed += 1;
      }
    }
    return { flushed, failed };
  }

  private async uploadMediaRow(row: MediaOutboxRow): Promise<boolean> {
    const formData = new FormData();
    const name =
      row.file_uri.split("/").pop() ??
      (row.kind === "photo" ? "field-photo.jpg" : "voice-note.m4a");

    if (row.kind === "photo") {
      formData.append("file", {
        uri: row.file_uri,
        name,
        type: "image/jpeg",
      } as unknown as Blob);
      return (await this.uploadForm(`${this.opts.apiUrl}/api/photos/upload/${row.job_id}`, formData)) === 200;
    }

    formData.append("file", { uri: row.file_uri, name, type: "audio/m4a" } as unknown as Blob);
    formData.append("durationMs", String(row.duration_ms ?? 0));
    return (await this.uploadForm(`${this.opts.apiUrl}/api/jobs/${row.job_id}/voice-notes`, formData)) === 200;
  }

  private async uploadForm(url: string, formData: FormData): Promise<number> {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.opts.token}` },
        body: formData,
      });
      return response.status;
    } catch {
      return 0;
    }
  }

  /**
   * Synchronize field work as coherent job/appliance/diagnostic packages.
   * This replaces the former empty generic sync request, which could not
   * populate a durable local mirror.
   */
  async pull(): Promise<FieldSyncResult> {
    const queuedBeforeFlush = await this.queuedCount();
    const flush = await this.flushOutbox().catch(() => ({ flushed: 0, failed: queuedBeforeFlush }));
    const flushMedia = await this.flushMediaOutbox().catch(() => ({ flushed: 0, failed: 0 }));

    const [appointmentsResponse, sessionsResponse] = await Promise.all([
      fetchWithTimeout(`${this.opts.apiUrl}/api/appointments`, { headers: this.headers() }),
      fetchWithTimeout(`${this.opts.apiUrl}/api/diagnostics/sessions`, { headers: this.headers() }),
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
    let failed = flush.failed + flushMedia.failed;
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
      flushedMedia: flushMedia.flushed,
      mediaFailed: flushMedia.failed,
      queuedMedia: await this.queuedMediaCount(),
      cachedJobs: [...jobIds],
    };
  }
}
