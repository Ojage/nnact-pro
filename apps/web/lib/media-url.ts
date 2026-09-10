const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003").replace(/\/$/, "");

/** Public URL for a content media asset (same origin the browser already uses for the API). */
export function mediaUrl(id: string | null | undefined): string | null {
  return id ? `${API_BASE}/api/v1/public/media/${id}` : null;
}