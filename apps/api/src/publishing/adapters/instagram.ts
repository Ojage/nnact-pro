// Instagram Professional publishing adapter — official Meta Graph API.
// Instagram has distinct media constraints; we enforce them via capabilities
// and fail with a domain-level validation error before any publish attempt when
// no eligible image/video exists (never silently truncate or invent media).
//
// Token model: /{ig-user-id}/media and /media_publish require the *Facebook
// Page* access token of the Page linked to the Instagram professional account.
// A user access token is rejected, so the page token is required — never a
// fallback.
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";
import { providerFetch, ProviderError } from "../infra/http.js";
import { normalizeError } from "../domain/errors.js";
import { graphVersionFor } from "./facebook.js";

const VIDEO_MIME = new Set(["video/mp4", "video/quicktime"]);

interface InstagramDeps {
  credentialStore: CredentialStorePort;
  baseUrl?: string;
  graphVersion?: string;
}

export class InstagramPublishingAdapter implements PublishingProviderPort {
  readonly channel = "INSTAGRAM" as const;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.INSTAGRAM;

  private readonly baseUrl: string;
  private readonly graphVersion: string;

  constructor(private readonly deps: InstagramDeps) {
    this.baseUrl = deps.baseUrl ?? "https://graph.facebook.com";
    this.graphVersion = deps.graphVersion ?? graphVersionFor();
  }

  private url(path: string): string {
    return `${this.baseUrl}/${this.graphVersion}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async auth(orgId: string): Promise<{ token: string; igId: string }> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred) {
      throw new ProviderError(normalizeError("AUTH_EXPIRED", "No Instagram connection configured. Connect Instagram to retry.", null));
    }
    // The Page token, not the user token — see the header note.
    const token = typeof cred.meta?.pageAccessToken === "string" ? cred.meta.pageAccessToken : null;
    if (!token) {
      throw new ProviderError(
        normalizeError("AUTH_EXPIRED", "Instagram connection has no Page access token. Reconnect Instagram to grant Page access.", null),
      );
    }
    const igId = cred.accountId ?? (typeof cred.meta?.igProfileId === "string" ? cred.meta.igProfileId : null);
    if (!igId) {
      throw new ProviderError(
        normalizeError("AUTH_EXPIRED", "No Instagram professional account is linked to the connected Page.", null),
      );
    }
    return { token, igId };
  }

  async validateConnection(orgId: string): Promise<ConnectionValidationResult> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred) {
      return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: "No Instagram connection configured." };
    }
    try {
      const { token, igId } = await this.auth(orgId);
      const res = await providerFetch(this.url(`/${igId}?fields=id,username&access_token=${encodeURIComponent(token)}`));
      if (res.status !== 200) {
        return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: `Instagram rejected the Page token (HTTP ${res.status})` };
      }
      const info = res.body as { username?: string; id?: string };
      return { valid: true, accountName: info?.username ?? null, accountId: info?.id ?? igId };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { valid: false, errorCode: err.normalized.code, errorMessage: err.normalized.message };
      }
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

  private captionFor(request: PublishRequest): string {
    return [request.caption ?? request.body ?? "", ...(request.hashtags ?? [])].join(" ").slice(0, this.capabilities.maxTextLength);
  }

  private permalinkFor(mediaId: string, isVideo: boolean): string {
    // Only videos are reels. Images and carousels live under /p/.
    return isVideo ? `https://www.instagram.com/reel/${mediaId}/` : `https://www.instagram.com/p/${mediaId}/`;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { token, igId } = await this.auth(request.organizationId);
    const media = request.media.find((m) => m.contentType.startsWith("image/") || VIDEO_MIME.has(m.contentType));
    if (!media) {
      throw new ProviderError(normalizeError("INVALID_MEDIA", "No eligible image/video for Instagram", null));
    }

    const caption = this.captionFor(request);
    const isVideo = VIDEO_MIME.has(media.contentType);

    // 1. Create a media container. Only the relevant media url is sent —
    //    sending the other as an empty string makes Graph reject the request.
    const containerParams = new URLSearchParams({
      access_token: token,
      media_type: isVideo ? "REELS" : "IMAGE",
      caption,
    });
    containerParams.set(isVideo ? "video_url" : "image_url", media.url);

    const containerRes = await providerFetch(this.url(`/${igId}/media`), {
      method: "POST",
      body: containerParams.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (containerRes.status >= 400) throw new ProviderError(this.mapError(containerRes.status, containerRes.body, request.idempotencyKey));
    const containerId = (containerRes.body as { id?: string })?.id;
    if (!containerId) throw new ProviderError(normalizeError("UNKNOWN_PROVIDER_ERROR", "Instagram did not return a container id", request.idempotencyKey));

    // 2. Publish the container.
    const publishRes = await providerFetch(this.url(`/${igId}/media_publish`), {
      method: "POST",
      body: new URLSearchParams({ access_token: token, creation_id: containerId }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (publishRes.status >= 400) {
      // A container that is never published expires in 24h; do not leak it.
      await this.deleteMedia(token, igId, containerId).catch(() => undefined);
      throw new ProviderError(this.mapError(publishRes.status, publishRes.body, request.idempotencyKey));
    }
    const mediaId = (publishRes.body as { id?: string })?.id;
    if (!mediaId) {
      // Never substitute the idempotency key for a real media id — every later
      // delete and status check would target a nonexistent object.
      throw new ProviderError(normalizeError("UNKNOWN_PROVIDER_ERROR", "Instagram published the media but returned no id.", request.idempotencyKey));
    }

    return {
      providerPublicationId: mediaId,
      externalUrl: this.permalinkFor(mediaId, isVideo),
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
    };
  }

  /**
   * Instagram media cannot be edited once published. Editing means deleting
   * and republishing, which produces a new media id.
   */
  async update(request: PublishRequest & { providerPublicationId: string }): Promise<PublishResult> {
    const { token, igId } = await this.auth(request.organizationId);
    const del = await this.deleteMedia(token, igId, request.providerPublicationId);
    if (del.status >= 400 && del.status !== 404) {
      throw new ProviderError(this.mapError(del.status, del.body, request.providerPublicationId));
    }
    const result = await this.publish({ ...request, providerPublicationId: undefined } as PublishRequest);
    return { ...result, rawMetadata: { replacedMediaId: request.providerPublicationId } };
  }

  private async deleteMedia(token: string, igId: string, mediaId: string) {
    return providerFetch(this.url(`/${igId}/media?ids=${encodeURIComponent(mediaId)}&access_token=${encodeURIComponent(token)}`), {
      method: "DELETE",
    });
  }

  async deleteOrUnpublish(orgId: string, providerPublicationId: string): Promise<void> {
    const { token, igId } = await this.auth(orgId);
    const res = await this.deleteMedia(token, igId, providerPublicationId);
    if (res.status >= 400 && res.status !== 404) {
      throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
    }
  }

  async getPublicationStatus(orgId: string, providerPublicationId: string) {
    const { token, igId } = await this.auth(orgId);
    const res = await providerFetch(this.url(`/${igId}/media?fields=id,media_type,permalink&ids=${encodeURIComponent(providerPublicationId)}&access_token=${encodeURIComponent(token)}`));
    if (res.status === 404) return { status: "DELETED" as const, externalUrl: null };
    if (res.status >= 400) {
      if (res.status === 401) return { status: "UNKNOWN" as const, externalUrl: null };
      throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
    }
    const item = (res.body as { data?: Array<{ id?: string; permalink?: string }> })?.data?.[0];
    if (!item) return { status: "DELETED" as const, externalUrl: null };
    return { status: "PUBLISHED" as const, externalUrl: item.permalink ?? this.permalinkFor(providerPublicationId, false) };
  }

  private mapError(status: number, body: unknown, requestId: string) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
    const message = err?.message ?? "Instagram API error";
    // 190/463: token invalid or expired. Page tokens must be refreshed roughly
    // every 60 days, so this is an expected, recoverable condition.
    if (err?.code === 190 || err?.code === 463 || err?.error_subcode === 463 || status === 401) {
      return normalizeError("AUTH_EXPIRED", "Instagram Page access token expired. Reconnect Instagram to continue.", requestId);
    }
    if (err?.code === 200 || status === 403) {
      return normalizeError("PERMISSION_DENIED", `Instagram denied the request: ${message}`, requestId);
    }
    if (err?.code === 4 || err?.code === 17 || err?.code === 32 || err?.code === 613 || status === 429) {
      return normalizeError("RATE_LIMITED", `Instagram rate limit reached: ${message}`, requestId);
    }
    if (status >= 500) return normalizeError("PROVIDER_UNAVAILABLE", "Instagram is temporarily unavailable.", requestId);
    return normalizeError("INVALID_CONTENT", message, requestId);
  }
}
