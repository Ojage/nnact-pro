// Instagram Professional publishing adapter — official Meta Graph API.
// Instagram has distinct media constraints; we enforce them via capabilities
// and fail with a domain-level validation error before any publish attempt when
// no eligible image/video exists (never silently truncate or invent media).
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";
import { providerFetch, ProviderError } from "../infra/http.js";
import { normalizeError } from "../domain/errors.js";

const VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);

interface InstagramDeps {
  credentialStore: CredentialStorePort;
  baseUrl?: string;
}

export class InstagramPublishingAdapter implements PublishingProviderPort {
  readonly channel = "INSTAGRAM" as const;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.INSTAGRAM;

  private readonly baseUrl: string;

  constructor(private readonly deps: InstagramDeps) {
    this.baseUrl = deps.baseUrl ?? "https://graph.facebook.com";
  }

  private async auth(orgId: string): Promise<{ token: string; igId: string }> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    const token = cred?.accessToken;
    if (!token) {
      throw new ProviderError(normalizeError("AUTH_EXPIRED", "No Instagram connection configured. Connect Instagram to retry.", null));
    }
    return { token, igId: cred.accountId ?? String(cred.meta?.igId ?? "") };
  }

  async validateConnection(orgId: string): Promise<ConnectionValidationResult> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred?.accessToken) {
      return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: "No Instagram connection configured." };
    }
    try {
      const { token, igId } = await this.auth(orgId);
      const owner = igId || "me";
      const res = await providerFetch(`${this.baseUrl}/v21.0/${owner}?fields=id,username`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: `Instagram rejected the token (${res.status})` };
      const info = res.body as { username?: string; id?: string };
      return { valid: true, accountName: info?.username ?? null, accountId: info?.id ?? null };
    } catch {
      return { valid: false, errorCode: "NETWORK_ERROR", errorMessage: "Could not reach Instagram" };
    }
  }

  validateContent(request: PublishRequest): ContentValidationIssue[] {
    const issues: ContentValidationIssue[] = [];
    const hasEligibleMedia = request.media.some((m) => m.contentType.startsWith("image/") || VIDEO_MIME.has(m.contentType));
    if (!hasEligibleMedia) {
      issues.push({ field: "media", message: "Instagram requires at least one eligible image or video", code: "INVALID_MEDIA" });
    }
    const caption = request.caption ?? request.body ?? "";
    if (caption.length > this.capabilities.maxTextLength) {
      issues.push({ field: "caption", message: `Instagram caption is limited to ${this.capabilities.maxTextLength} characters`, code: "INVALID_CONTENT" });
    }
    return issues;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { token, igId } = await this.auth(request.organizationId);
    const media = request.media.find((m) => m.contentType.startsWith("image/") || VIDEO_MIME.has(m.contentType));
    if (!media) {
      throw new ProviderError(normalizeError("INVALID_MEDIA", "No eligible image/video for Instagram", null));
    }
    if (!igId) {
      throw new ProviderError(normalizeError("PERMISSION_DENIED", "Instagram business account not identified", null));
    }

    const caption = [request.caption ?? request.body ?? "", ...(request.hashtags ?? [])].join(" ").slice(0, this.capabilities.maxTextLength);

    // 1. Create a media container.
    const video = VIDEO_MIME.has(media.contentType);
    const containerParams = new URLSearchParams({
      access_token: token,
      media_type: video ? "VIDEO" : "IMAGE",
      image_url: video ? "" : media.url,
      video_url: video ? media.url : "",
      caption,
    });
    const containerRes = await providerFetch(`${this.baseUrl}/v21.0/${igId}/media`, { method: "POST", body: containerParams.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (containerRes.status >= 400) throw new ProviderError(this.mapError(containerRes.status, containerRes.body, request.idempotencyKey));
    const containerId = (containerRes.body as { id?: string })?.id;
    if (!containerId) throw new ProviderError(normalizeError("UNKNOWN_PROVIDER_ERROR", "Instagram did not return a container id", null));

    // 2. Publish the container.
    const publishParams = new URLSearchParams({ access_token: token, creation_id: containerId });
    const publishRes = await providerFetch(`${this.baseUrl}/v21.0/${igId}/media_publish`, { method: "POST", body: publishParams.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    if (publishRes.status >= 400) throw new ProviderError(this.mapError(publishRes.status, publishRes.body, request.idempotencyKey));
    const mediaId = (publishRes.body as { id?: string })?.id ?? request.idempotencyKey;

    return {
      providerPublicationId: mediaId,
      externalUrl: `https://www.instagram.com/reel/${mediaId}`,
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
    };
  }

  async deleteOrUnpublish(orgId: string, providerPublicationId: string): Promise<void> {
    const { token, igId } = await this.auth(orgId);
    const res = await providerFetch(`${this.baseUrl}/v21.0/${igId}/media?ids=${providerPublicationId}&access_token=${token}`, { method: "DELETE" });
    if (res.status >= 400 && res.status !== 404) throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
  }

  async getPublicationStatus(_orgId: string, providerPublicationId: string) {
    return { status: "PUBLISHED", externalUrl: providerPublicationId ? `https://www.instagram.com/reel/${providerPublicationId}` : null };
  }

  private mapError(status: number, body: unknown, requestId: string) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
    const message = err?.message ?? "Instagram API error";
    if (err?.code === 190 || status === 401) return normalizeError("AUTH_EXPIRED", "Instagram authentication expired. Reconnect Instagram to retry.", requestId);
    if (err?.code === 200 || status === 403) return normalizeError("PERMISSION_DENIED", "Instagram permission denied.", requestId);
    if (err?.code === 613 || status === 429) return normalizeError("RATE_LIMITED", "Instagram rate limit reached.", requestId);
    if (status >= 500) return normalizeError("PROVIDER_UNAVAILABLE", "Instagram is temporarily unavailable.", requestId);
    return normalizeError("INVALID_CONTENT", message, requestId);
  }
}
