// Facebook Page publishing adapter — official Meta Graph API.
// https://developers.facebook.com/docs/pages-api/posts
//
// Token model: every call is made with the *Page* access token obtained from
// /me/accounts during the OAuth callback. A user access token is rejected by
// /{page-id}/feed with error 200 ("(#200) Pages API method requires a Page
// access token"), so the page token is required — never a fallback.
import type { ConnectionValidationResult, ContentValidationIssue, ProviderCapabilities, PublishRequest, PublishResult, PublishingProviderPort } from "@nnact/shared";
import { PROVIDER_CAPABILITIES } from "@nnact/shared";
import type { CredentialStorePort } from "../ports/index.js";
import { providerFetch, ProviderError, type HttpResponse } from "../infra/http.js";
import { normalizeError } from "../domain/errors.js";

/**
 * Graph version is env-tunable so a Meta upgrade never needs a code change.
 *
 * Meta expires versions ~2 years after release and, critically, *falls forward*
 * to the next oldest usable version instead of rejecting the call — so a stale
 * pin degrades silently rather than erroring loudly. v25.0 is chosen over the
 * newer v26.0 because it has a published sunset (2028-07-29) and two years of
 * production use behind it. Verified against Meta's changelog 2026-09-25:
 *   v20.0 expired 2026-09-24 (already fell forward), v23.0 -> 2027-10-08,
 *   v24.0 -> 2028-02-18, v25.0 -> 2028-07-29, v26.0 -> TBD.
 */
export const DEFAULT_GRAPH_VERSION = "v25.0";

export function graphVersionFor(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.META_GRAPH_VERSION?.trim();
  return raw ? (raw.startsWith("v") ? raw : `v${raw}`) : DEFAULT_GRAPH_VERSION;
}

interface FacebookDeps {
  credentialStore: CredentialStorePort;
  baseUrl?: string;
  graphVersion?: string;
}

export class FacebookPublishingAdapter implements PublishingProviderPort {
  readonly channel = "FACEBOOK" as const;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.FACEBOOK;

  private readonly baseUrl: string;
  private readonly graphVersion: string;

  constructor(private readonly deps: FacebookDeps) {
    this.baseUrl = deps.baseUrl ?? "https://graph.facebook.com";
    this.graphVersion = deps.graphVersion ?? graphVersionFor();
  }

  /** Absolute Graph endpoint, e.g. https://graph.facebook.com/v25.0/PAGE_ID/feed */
  private url(path: string): string {
    return `${this.baseUrl}/${this.graphVersion}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async pageAuth(orgId: string): Promise<{ token: string; pageId: string }> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred) {
      throw new ProviderError(normalizeError("AUTH_EXPIRED", "No Facebook connection configured. Connect Facebook to retry.", null));
    }
    const pageToken = typeof cred.meta?.pageAccessToken === "string" ? cred.meta.pageAccessToken : null;
    if (!pageToken) {
      throw new ProviderError(
        normalizeError("AUTH_EXPIRED", "Facebook connection has no Page access token. Reconnect Facebook to grant Page access.", null),
      );
    }
    const pageId = cred.pageId ?? cred.accountId ?? (typeof cred.meta?.pageId === "string" ? cred.meta.pageId : null);
    if (!pageId) {
      throw new ProviderError(normalizeError("AUTH_EXPIRED", "Facebook connection has no Page selected. Reconnect Facebook to choose a Page.", null));
    }
    return { token: pageToken, pageId };
  }

  async validateConnection(orgId: string): Promise<ConnectionValidationResult> {
    const cred = await this.deps.credentialStore.get(orgId, this.channel);
    if (!cred) {
      return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: "No Facebook connection configured." };
    }
    try {
      const { token, pageId } = await this.pageAuth(orgId);
      const res = await providerFetch(this.url(`/${pageId}?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`));
      if (res.status !== 200) {
        return { valid: false, errorCode: "AUTH_EXPIRED", errorMessage: `Facebook rejected the Page token (HTTP ${res.status})` };
      }
      const info = res.body as { name?: string; id?: string };
      return { valid: true, accountName: info?.name ?? null, accountId: info?.id ?? pageId };
    } catch (err) {
      if (err instanceof ProviderError) {
        return { valid: false, errorCode: err.normalized.code, errorMessage: err.normalized.message };
      }
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
    if (request.media.length > this.capabilities.maxImages) {
      issues.push({ field: "media", message: `Facebook allows at most ${this.capabilities.maxImages} images per post`, code: "INVALID_MEDIA" });
    }
    return issues;
  }

  private messageFor(request: PublishRequest): string {
    return [request.body ?? request.caption ?? "", ...(request.hashtags ?? [])].join(" ").trim();
  }

  private form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
    return { body: new URLSearchParams(fields).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } };
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { token, pageId } = await this.pageAuth(request.organizationId);
    const message = this.messageFor(request);
    const media = request.media.slice(0, this.capabilities.maxImages);
    const idempotencyKey = request.idempotencyKey;

    let postId: string | undefined;
    if (media.length === 0) {
      postId = await this.publishTextPost(pageId, token, message, idempotencyKey);
    } else if (media.length === 1) {
      // A single photo is a /photos call. The caption field is `caption`;
      // `message` is silently ignored on this endpoint.
      postId = await this.publishSinglePhoto(pageId, token, media[0]!.url, message, idempotencyKey);
    } else {
      postId = await this.publishPhotoAlbum(pageId, token, media, message, idempotencyKey);
    }

    return {
      providerPublicationId: postId,
      externalUrl: postId ? this.permalinkFor(pageId, postId) : null,
      publishedAt: new Date(),
      providerStatus: "PUBLISHED",
    };
  }

  private async publishTextPost(pageId: string, token: string, message: string, requestId: string): Promise<string> {
    const res = await providerFetch(this.url(`/${pageId}/feed`), {
      method: "POST",
      ...this.form({ access_token: token, message }),
    });
    return this.readPostId(res.status, res.body, requestId);
  }

  private async publishSinglePhoto(
    pageId: string,
    token: string,
    url: string,
    caption: string,
    requestId: string,
  ): Promise<string> {
    const res = await providerFetch(this.url(`/${pageId}/photos`), {
      method: "POST",
      ...this.form({ access_token: token, url, caption }),
    });
    return this.readPostId(res.status, res.body, requestId);
  }

  /**
   * Album post. Graph cannot attach photos by URL — `attached_media` only
   * accepts `media_fbid`. So each photo is uploaded unpublished to obtain its
   * media_fbid, then a single /feed post references them in order. If the feed
   * post fails the unpublished uploads are rolled back so we do not leak
   * orphaned media on the Page.
   */
  private async publishPhotoAlbum(
    pageId: string,
    token: string,
    media: Array<{ url: string }>,
    message: string,
    requestId: string,
  ): Promise<string> {
    const uploaded: string[] = [];
    try {
      for (const item of media) {
        const res = await providerFetch(this.url(`/${pageId}/photos`), {
          method: "POST",
          ...this.form({ access_token: token, url: item.url, published: "false" }),
        });
        if (res.status >= 400) throw new ProviderError(this.mapError(res.status, res.body, requestId));
        const fbid = (res.body as { post_id?: string; id?: string })?.post_id;
        if (!fbid) throw new ProviderError(normalizeError("PROVIDER_UNAVAILABLE", "Facebook did not return a media id for an uploaded photo.", requestId));
        uploaded.push(fbid);
      }

      const fields: Record<string, string> = { access_token: token, message };
      uploaded.forEach((mediaFbid, i) => {
        fields[`attached_media[${i}]`] = JSON.stringify({ media_fbid: mediaFbid });
      });

      const res = await providerFetch(this.url(`/${pageId}/feed`), { method: "POST", ...this.form(fields) });
      return this.readPostId(res.status, res.body, requestId);
    } catch (err) {
      await Promise.allSettled(uploaded.map((id) => this.deletePost(id, token)));
      throw err;
    }
  }

  /**
   * Graph is inconsistent about the id field: /feed returns `id`, while
   * /photos returns `post_id`. Accept both and never invent an id — storing an
   * idempotency key as a post id would make every later delete/retry fail
   * against a real-but-unknown target.
   */
  private readPostId(status: number, body: unknown, requestId: string): string {
    if (status >= 400) throw new ProviderError(this.mapError(status, body, requestId));
    const payload = body as { id?: string; post_id?: string };
    const id = payload?.id ?? payload?.post_id;
    if (!id) throw new ProviderError(normalizeError("PROVIDER_UNAVAILABLE", "Facebook accepted the post but returned no id.", requestId));
    return id;
  }

  private permalinkFor(pageId: string, postId: string): string {
    return `https://www.facebook.com/${pageId}/posts/${postId}`;
  }

  private async deletePost(postId: string, token: string): Promise<HttpResponse> {
    return providerFetch(this.url(`/${postId}?access_token=${encodeURIComponent(token)}`), { method: "DELETE" });
  }

  /**
   * Facebook has no post-edit endpoint — a published post's message is
   * immutable. Editing therefore means delete + repost, mirroring LinkedIn.
   * The new post id differs from the old one; the worker records it.
   */
  async update(request: PublishRequest & { providerPublicationId: string }): Promise<PublishResult> {
    const { token, pageId } = await this.pageAuth(request.organizationId);
    const del = await providerFetch(this.url(`/${request.providerPublicationId}?access_token=${encodeURIComponent(token)}`), { method: "DELETE" });
    if (del.status >= 400 && del.status !== 404) {
      throw new ProviderError(this.mapError(del.status, del.body, request.providerPublicationId));
    }
    const result = await this.publish({ ...request, providerPublicationId: undefined } as PublishRequest);
    return { ...result, rawMetadata: { replacedPostId: request.providerPublicationId, pageId } };
  }

  async deleteOrUnpublish(orgId: string, providerPublicationId: string): Promise<void> {
    const { token } = await this.pageAuth(orgId);
    const res = await this.deletePost(providerPublicationId, token);
    if (res.status >= 400 && res.status !== 404) {
      throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
    }
  }

  async getPublicationStatus(orgId: string, providerPublicationId: string) {
    const { token } = await this.pageAuth(orgId);
    const res = await providerFetch(this.url(`/${providerPublicationId}?access_token=${encodeURIComponent(token)}`));
    if (res.status === 404) return { status: "DELETED" as const, externalUrl: null };
    if (res.status >= 400) {
      if (res.status === 401) return { status: "UNKNOWN" as const, externalUrl: null };
      throw new ProviderError(this.mapError(res.status, res.body, providerPublicationId));
    }
    const id = (res.body as { id?: string })?.id ?? providerPublicationId;
    return { status: "PUBLISHED" as const, externalUrl: this.permalinkFor(String(id), providerPublicationId) };
  }

  private mapError(status: number, body: unknown, requestId: string) {
    const err = (body as { error?: { message?: string; code?: number; error_subcode?: number; type?: string } })?.error;
    const message = err?.message ?? "Facebook API error";
    const code = err?.code;
    const subcode = err?.error_subcode;
    // 190/463: token invalid or expired — the dominant real-world failure,
    // because Page tokens must be refreshed roughly every 60 days.
    if (code === 190 || code === 463 || subcode === 463 || status === 401) {
      return normalizeError("AUTH_EXPIRED", "Facebook Page access token expired. Reconnect Facebook to continue.", requestId);
    }
    // 200 with a Page-token hint is a scope problem, not a token problem.
    if (code === 200 || status === 403) {
      return normalizeError("PERMISSION_DENIED", `Facebook denied the request: ${message}`, requestId);
    }
    if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
      return normalizeError("RATE_LIMITED", `Facebook rate limit reached: ${message}`, requestId);
    }
    if (status >= 500) return normalizeError("PROVIDER_UNAVAILABLE", "Facebook is temporarily unavailable.", requestId);
    return normalizeError("INVALID_CONTENT", message, requestId);
  }
}
