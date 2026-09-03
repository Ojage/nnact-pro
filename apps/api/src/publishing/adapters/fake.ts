// Development publisher — simulates a successful external publication when no
// real provider credentials are available. Clearly marked as SIMULATED; it must
// never masquerade as a real post. Used in local dev and automated tests.
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingChannel, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";

interface FakeDeps {
  credentialStore: CredentialStorePort;
  endpoint: string;
}

export class FakePublishingProvider implements PublishingProviderPort {
  readonly channel: PublishingChannel;
  readonly capabilities: ProviderCapabilities;

  constructor(channel: PublishingChannel, private readonly deps: FakeDeps) {
    this.channel = channel;
    this.capabilities = PROVIDER_CAPABILITIES[channel];
  }

  static forChannel(channel: PublishingChannel, credentialStore: CredentialStorePort): FakePublishingProvider {
    return new FakePublishingProvider(channel, {
      credentialStore,
      endpoint: process.env.PUBLISHING_FAKE_ENDPOINT ?? "http://localhost:3999/simulate",
    });
  }

  async validateConnection(orgId: string): Promise<ConnectionValidationResult> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    return {
      valid: Boolean(cred?.accessToken) || process.env.PUBLISHING_DEV_MODE === "true",
      accountName: cred ? `${this.channel} (simulated)` : null,
      accountId: cred?.accountId ?? null,
      errorCode: cred ? undefined : "AUTH_EXPIRED",
      errorMessage: cred ? undefined : `No ${this.channel} connection configured (simulated)`,
    };
  }

  validateContent(request: PublishRequest): ContentValidationIssue[] {
    const issues: ContentValidationIssue[] = [];
    const body = request.body ?? "";
    if (body.length > this.capabilities.maxTextLength) {
      issues.push({ field: "body", message: `Exceeds ${this.channel} limit of ${this.capabilities.maxTextLength}`, code: "INVALID_CONTENT" });
    }
    if (this.capabilities.supportsImages && request.media.length === 0 && !this.capabilities.supportsText) {
      issues.push({ field: "media", message: `${this.channel} requires at least one image`, code: "INVALID_MEDIA" });
    }
    return issues;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    // Simulated latency so the worker's async path is exercised in dev.
    await new Promise((r) => setTimeout(r, 60));
    return {
      providerPublicationId: `sim_${request.publicationId}`,
      externalUrl: `https://simulated.local/${this.channel.toLowerCase()}/${request.publicationId}`,
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
      rawMetadata: { simulated: true, channel: this.channel },
    };
  }

  async deleteOrUnpublish(): Promise<void> {
    return;
  }

  async getPublicationStatus(_orgId: string, providerPublicationId: string) {
    return { status: "PUBLISHED", externalUrl: null };
  }
}
