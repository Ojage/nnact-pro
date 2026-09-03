// Connection store — reads/writes publishing_connections and encrypts the
// credential blob at rest. This is the ONLY place credentials are decrypted.
// Tokens are never returned by normal admin APIs; only the publishing worker
// (via this store) touches plaintext access tokens.
import { and, eq } from "drizzle-orm";
import { db, publishingConnections } from "@nnact/db";
import type { PublishingChannel } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";
import { decryptSecret, encryptSecret } from "./encryption.js";

interface CredentialBlob {
  accessToken: string;
  refreshToken?: string;
  accountId?: string;
  pageId?: string;
  meta?: Record<string, unknown>;
}

export class DbConnectionStore implements CredentialStorePort {
  async get(
    orgId: string,
    channel: string,
  ): Promise<{ accessToken: string; accountId?: string | null; meta?: Record<string, unknown> } | null> {
    const [row] = await db
      .select()
      .from(publishingConnections)
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel as PublishingChannel)))
      .limit(1);
    if (!row?.credentialsCipher) return null;
    const decrypted = decryptSecret(row.credentialsCipher);
    if (!decrypted) return null;
    try {
      const blob = JSON.parse(decrypted) as CredentialBlob;
      return {
        accessToken: blob.accessToken,
        accountId: blob.accountId ?? row.accountId,
        meta: blob.meta,
      };
    } catch {
      return null;
    }
  }

  async setLastError(orgId: string, channel: string, error: string | null): Promise<void> {
    await db
      .update(publishingConnections)
      .set({ lastError: error, updatedAt: new Date() })
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel as PublishingChannel)));
  }

  async markExpired(orgId: string, channel: string): Promise<void> {
    await db
      .update(publishingConnections)
      .set({ status: "EXPIRED", updatedAt: new Date(), lastError: "token expired or invalid" })
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel as PublishingChannel)));
  }

  async markValidated(orgId: string, channel: string, accountName: string | null, accountId: string | null): Promise<void> {
    await db
      .update(publishingConnections)
      .set({
        status: "CONNECTED",
        accountName,
        accountId,
        lastValidatedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(publishingConnections.orgId, orgId), eq(publishingConnections.channel, channel as PublishingChannel)));
  }
}

/** Simple in-memory store for tests / local dev without a real provider. */
export class MemoryCredentialStore implements CredentialStorePort {
  private creds = new Map<string, { accessToken: string; accountId?: string | null; meta?: Record<string, unknown> }>();
  get(orgId: string, channel: string) {
    return Promise.resolve(this.creds.get(`${orgId}:${channel}`) ?? null);
  }
  set(orgId: string, channel: string, value: { accessToken: string; accountId?: string | null; meta?: Record<string, unknown> }) {
    this.creds.set(`${orgId}:${channel}`, value);
    return Promise.resolve();
  }
  setLastError() { return Promise.resolve(); }
  markExpired() { return Promise.resolve(); }
  markValidated() { return Promise.resolve(); }
}

export function connectionStoreFor(env: NodeJS.ProcessEnv = process.env): CredentialStorePort {
  if (env.NODE_ENV === "test" || env.PUBLISHING_DEV_MODE === "true") {
    return new MemoryCredentialStore();
  }
  return new DbConnectionStore();
}

export { encryptSecret };
