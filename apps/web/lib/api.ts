import type { CustomerDTO, JobDTO } from "@ofp/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  customers: () => get<CustomerDTO[]>("/api/customers"),
  jobs: () => get<JobDTO[]>("/api/jobs"),
  health: () => get<{ ok: boolean }>("/api/health"),
};
