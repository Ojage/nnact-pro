import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description:
    "Sign in to NNACT Pro — the technical operations workspace for HVAC, refrigeration, electrical, solar, and field maintenance teams in Buea and Southwest Cameroon.",
  path: "/login",
  noIndex: true,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
