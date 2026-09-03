// Publishing provider registry — the composition root for channel adapters.
// The application requests a provider by channel; it never instantiates
// adapters directly and never branches on channel names in domain logic.
// Adding a provider = register an adapter here (Open/Closed Principle).
import type { PublishingChannel, PublishingProviderPort } from "@nnact/shared";
import type { CredentialStorePort } from "./ports/index.js";
import type { WebsiteAdapterDeps } from "./adapters/website.js";
import { WebsitePublishingAdapter } from "./adapters/website.js";
import { FakePublishingProvider } from "./adapters/fake.js";
import { LinkedInPublishingAdapter } from "./adapters/linkedin.js";
import { FacebookPublishingAdapter } from "./adapters/facebook.js";
import { InstagramPublishingAdapter } from "./adapters/instagram.js";
import { connectionStoreFor } from "./infra/connection-store.js";

export interface RegistryDeps {
  credentialStore: CredentialStorePort;
  website: WebsiteAdapterDeps;
  fake?: boolean;
}

export interface ResolvedCredential {
  accessToken: string;
  accountId?: string | null;
  meta?: Record<string, unknown>;
}

export class PublishingProviderRegistry {
  private readonly providers = new Map<string, PublishingProviderPort>();

  constructor(deps: RegistryDeps) {
    this.register(new WebsitePublishingAdapter(deps.website));
    if (deps.fake ?? (process.env.PUBLISHING_DEV_MODE === "true" || process.env.NODE_ENV === "test")) {
      // Local dev / test: simulate external posts; never hit real accounts.
      this.register(FakePublishingProvider.forChannel("LINKEDIN", deps.credentialStore));
      this.register(FakePublishingProvider.forChannel("FACEBOOK", deps.credentialStore));
      this.register(FakePublishingProvider.forChannel("INSTAGRAM", deps.credentialStore));
    } else {
      // Real adapters — return normalized AUTH_EXPIRED until a connection exists.
      this.register(new LinkedInPublishingAdapter({ credentialStore: deps.credentialStore }));
      this.register(new FacebookPublishingAdapter({ credentialStore: deps.credentialStore }));
      this.register(new InstagramPublishingAdapter({ credentialStore: deps.credentialStore }));
    }
  }

  register(provider: PublishingProviderPort): void {
    this.providers.set(provider.channel, provider);
  }

  get(channel: PublishingChannel): PublishingProviderPort {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new Error(`No publishing provider registered for channel: ${channel}`);
    }
    return provider;
  }

  has(channel: PublishingChannel): boolean {
    return this.providers.has(channel);
  }

  channels(): PublishingChannel[] {
    return [...this.providers.keys()] as PublishingChannel[];
  }
}

export async function resolveCredential(
  store: CredentialStorePort,
  orgId: string,
  channel: PublishingChannel,
): Promise<ResolvedCredential | null> {
  return store.get(orgId, channel);
}

/** Default registry wired to the real connection store (env-backed). */
export function defaultRegistry(): PublishingProviderRegistry {
  const credentialStore = connectionStoreFor(process.env);
  return new PublishingProviderRegistry({ credentialStore, website: { websiteBaseUrl: process.env.PUBLIC_WEB_URL ?? "http://localhost:3000" } });
}
