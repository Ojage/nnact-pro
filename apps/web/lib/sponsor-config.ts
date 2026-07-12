export interface SponsorConfig {
  name: string;
  message: string;
  url: string;
}

export function readSponsorConfig(
  env: Record<string, string | undefined> = process.env,
): SponsorConfig | null {
  if (env.OFP_SPONSOR_ENABLED?.toLowerCase() !== "true") return null;

  const name = env.OFP_SPONSOR_NAME?.trim();
  const message = env.OFP_SPONSOR_MESSAGE?.trim();
  const rawUrl = env.OFP_SPONSOR_URL?.trim();
  if (!name || !message || !rawUrl) return null;
  if (name.length > 80 || message.length > 180) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!["", "/"].includes(url.pathname) || url.search || url.hash) return null;

  return { name, message, url: url.origin };
}
