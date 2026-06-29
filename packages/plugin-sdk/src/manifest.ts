// A plugin's manifest — the `plugin.json` an author publishes (or authors in TS
// via `defineManifest`). The OFP server stores these as rows in the `plugins`
// table; the fields here are the author-controlled subset.
import type { PluginEventKind } from "./events.js";

export interface PluginManifest {
  /** Stable unique id, e.g. "twilio-sms". Lowercase, hyphenated. */
  slug: string;
  name: string;
  description?: string;
  /** semver, e.g. "1.0.0". */
  version: string;
  author?: string;
  iconUrl?: string;
  /** Domain events to subscribe to. Must be drawn from PLUGIN_EVENTS. */
  events: PluginEventKind[];
  /**
   * OAuth-style scopes the plugin requests for its inbound token, e.g.
   * ["customers:read", "jobs:read"]. Use ["*"] to request full read access.
   */
  scopes: string[];
  /** Default endpoint the signed event webhooks are POSTed to. */
  webhookUrl?: string;
}

/** Identity helper that gives a `plugin.json`-in-TS full type-checking. */
export function defineManifest(manifest: PluginManifest): PluginManifest {
  return manifest;
}
