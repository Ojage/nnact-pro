import type { MetadataRoute } from "next";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";
import { SITE_CONFIG } from "@/lib/site-metadata";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${NNACT_PRODUCT.name} — ${NNACT_PRODUCT.subtitle}`,
    short_name: NNACT_PRODUCT.name,
    description: NNACT_PRODUCT.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    lang: "en-CM",
    orientation: "portrait-primary",
    categories: ["business", "productivity", "utilities"],
    icons: [
      {
        src: SITE_CONFIG.logoPath,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    scope: "/",
    id: "/",
    related_applications: [
      {
        platform: "web",
        url: NNACT_COMPANY.contact.website,
      },
    ],
  };
}
