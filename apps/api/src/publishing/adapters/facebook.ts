// Facebook Page publishing adapter — official Meta Graph API.
// https://developers.facebook.com/docs/pages-api/posts
// Requires a page-connected token; missing credentials → normalized error.
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";
import { providerFetch, ProviderError } from "../infra/http.js";
import { normalizeError } from "../domain/errors.js";

interface FacebookDeps {
  credentialStore: CredentialStorePort;
  baseUrl?: string;
}

export class FacebookPublishingAdapter implements PublishingProviderPort {
  readonly channel = "FACEBOOK" as const;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.FACEBOOK;

  private readonly baseUrl: string;

  constructor(private readonly deps: FacebookDeps) {
    this.baseUrl = deps.baseUrl ?? "https://graph.facebook.com";
  }

  private async auth(orgId: string): Promise<{ token: string; pageId: string }> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    const token = cred?.accessToken;
    if (!token) {
      throw new ProviderError(normalizeError("AUTH_EXPIRED", "No Facebook connection configured. Connect Facebook to retry.", null));
    }
    return { token, pageId: cred.accountId ?? String(cred.meta?.pageId ?? "") };
  }

  async validateConnection(orgId: string): Promise<ConnectionValidationResult> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred?.accessToken) {
      return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: "No Facebook connection configured." };
    }
    try {
      const { token } = await this.auth(orgId);
      const pageId = cred.accountId ?? "me";
      const res = await providerFetch(`${this.baseUrl}/v21.0/${pageId}?fields=name,id`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status !== 200) return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: `Facebook rejected the token (${res.status})` };
      const info = res.body as { name?: string; id?: string };
      return { valid: true, accountName: info?.name ?? null, accountId: info?.id ?? null };
    } catch {
      return { valid: false, errorCode: "NETWORK_ERROR", errorMessage: "Could not reach Facebook" };
    }
  }

  validateContent(request: PublishRequest): ContentValidationIssue[] {
    const issues: ContentValidationIssue[] = [];
    const body = request.body ?? request.caption ?? "";
    if (body.length > this.capabilities.maxTextLength) {
      issues.push({ field: "body", message: `Facebook limits text to ${this.capabilities.maxTextLength} characters`, code: "INVALID_CONTENT" });
    }
    if (!body.trim() && request.media.length === 0) {
      issues.push({ field: "body", message: "Facebook post requires text or media", code: "INVALID_CONTENT" });
    }
    return issues;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { token, pageId } = await this.auth(request.organizationId);
    const message = [request.body ?? request.caption ?? "", ...(request.hashtags ?? [])].join(" ");

    let res;
    if (request.media.length > 0) {
      const photos = request.media.slice(0, this.capabilities.maxImages);
      const params = new URLSearchParams({ access_token: token, message });
      if (photos.length === 1) {
        params.set("url", photos[0].url);
        res = await providerFetch(`${this.baseUrl}/${pageId}/photos`, { method: "POST", body: params.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      } else {
        // Multi-photo post via attached media.
        photos.forEach((p, i) => params.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: undefined, url: p.url })));
        res = await providerFetch(`${this.baseUrl}/${pageId}/feed`, { method: "POST", body: params.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      }
    } else {
      res = await providerFetch(`${this.baseUrl}/${pageId}/feed`, {
        method: "POST",
        body: new URLSearchParams({ access_token: token, message }).toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    }

    if (res.status >= 400) {
      throw new ProviderError(this.mapError(res.status, res.body, request.idempotencyKey));
    }
    const id = (res.body as { id?: string })?.id ?? request.idempotencyKey;
    return {
      providerPublicationId: id,
      externalUrl: `https://www.facebook.com/${pageId}/posts/${id}`,
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
    };
  }

  async deleteOrUnpublish(orgId: string, providerPublicationId: string): Promise<void> {
    const { token } = await this.auth(orgId);
    const res = await providerFetch(`${this.baseUrl}/${providerPublicationId}?access_token=${token}`, { method: "DELETE" });
    if (res.status >= 400 && res.status !== 404) throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
  }

  async getPublicationStatus(_orgId: string, providerPublicationId: string) {
    return { status: "PUBLISHED", externalUrl: providerPublicationId ? `https://www.facebook.com/${providerPublicationId}` : null };
  }

  private mapError(status: number, body: unknown, requestId: string) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
    const message = err?.message ?? "Facebook API error";
    if (err?.code === 190 || status === 401) return normalizeError("AUTH_EXPIRED", "Facebook authentication expired. Reconnect Facebook to retry.", requestId);
    if (err?.code === 200 || status === 403) return normalizeError("PERMISSION_DENIED", "Facebook permission denied.", requestId);
    if (err?.code === 613 || status === 429) return normalizeError("RATE_LIMITED", "Facebook rate limit reached.", requestId);
    if (status >= 500) return normalizeError("PROVIDER_UNAVAILABLE", "Facebook is temporarily unavailable.", requestId);
    return normalizeError("INVALID_CONTENT", message, requestId);
  }
}
