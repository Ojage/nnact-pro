import { redirect } from "next/navigation";

export default async function PortalRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const customerOrigin = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "");
  if (customerOrigin) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") qs.set(key, value);
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    redirect(`${customerOrigin}/p/${token}${suffix}`);
  }

  const LegacyPortalPage = (await import("./legacy-portal-page")).default;
  return LegacyPortalPage({ params: Promise.resolve({ token }), searchParams });
}
