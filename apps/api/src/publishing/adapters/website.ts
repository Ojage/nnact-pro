// Website publishing adapter — NNACT Webapp is a first-class destination.
// Technically "publishing" to the website is a database state change that the
// public Content API (and revalidation webhook) reflects. We still model it as
// a provider so the application treats it like any other channel.
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingErrorCode, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";

export interface WebsiteAdapterDeps {
  websiteBaseUrl: string;
}

export class WebsitePublishingAdapter implements PublishingProviderPort {
  readonly channel = "WEBSITE" as const;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.WEBSITE;

  constructor(private readonly deps: WebsiteAdapterDeps) {}

  async validateConnection(_orgId: string): Promise<ConnectionValidationResult> {
    // Website is always "connected" — it's our own property.
    return { valid: true, accountName: this.deps.websiteBaseUrl };
  }

  validateContent(request: PublishRequest): ContentValidationIssue[] {
    const issues: ContentValidationIssue[] = [];
    if (!request.title?.trim()) issues.push({ field: "title", message: "Title is required for the website", code: "INVALID_CONTENT" });
    if (!request.body?.trim()) issues.push({ field: "body", message: "Body is required for the website", code: "INVALID_CONTENT" });
    if (request.body && request.body.length > this.capabilities.maxTextLength) {
      issues.push({ field: "body", message: `Body exceeds website limit of ${this.capabilities.maxTextLength}`, code: "INVALID_CONTENT" });
    }
    return issues;
  }

  // Website publish is handled at the repository/application layer (DB state +
  // content API exposure). We return a normalized result keyed on the public URL.
  async publish(request: PublishRequest): Promise<PublishResult> {
    const slug = (request.metadata?.slug as string) || request.contentId;
    return {
      providerPublicationId: request.publicationId,
      externalUrl: `${this.deps.websiteBaseUrl.replace(/\/$/, "")}/blog/${slug}`,
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
      rawMetadata: { channel: "WEBSITE", slug },
    };
  }

  async update(request: PublishRequest & { providerPublicationId: string }): Promise<PublishResult> {
    return this.publish(request);
  }

  async deleteOrUnpublish(_orgId: string, providerPublicationId: string): Promise<void> {
    // Unpublishing is a repository-level state change handled by the use case.
    void providerPublicationId;
  }

  async getPublicationStatus(_orgId: string, providerPublicationId: string) {
    return { status: "PUBLISHED", externalUrl: null };
  }
}
