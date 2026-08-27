import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = absoluteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/welcome", "/login"],
        disallow: [
          "/api/",
          "/customers/",
          "/jobs/",
          "/dispatch/",
          "/schedule/",
          "/invoices/",
          "/estimates/",
          "/settings/",
          "/repair-brain/",
          "/diagnostics/",
          "/equipment/",
          "/reports/",
          "/portal/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
