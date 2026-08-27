import type { Metadata } from "next";
import { NNACT_COMPANY, NNACT_PRODUCT, NNACT_SEO_KEYWORDS } from "@nnact/shared";

const DEFAULT_SITE_URL = "https://pro.nnactrepairs.com";

/** Resolve the public site origin for canonical URLs, OG tags, and sitemaps. */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return DEFAULT_SITE_URL;
}

export const SITE_CONFIG = {
  productName: NNACT_PRODUCT.name,
  companyName: NNACT_COMPANY.shortName,
  legalName: NNACT_COMPANY.legalName,
  tagline: NNACT_COMPANY.tagline,
  subtitle: NNACT_PRODUCT.subtitle,
  description: NNACT_PRODUCT.description,
  positioning: NNACT_PRODUCT.positioning,
  keywords: [...NNACT_SEO_KEYWORDS],
  locale: "en_CM",
  email: NNACT_COMPANY.contact.email,
  phone: NNACT_COMPANY.contact.phones[0],
  address: NNACT_COMPANY.location,
  serviceAreas: [...NNACT_COMPANY.serviceAreas],
  twitterHandle: "@nnactrepairs",
  ogImagePath: "/nnact-logo.jpeg",
  logoPath: "/nnact-logo.jpeg",
} as const;

export function absoluteUrl(path = ""): string {
  const base = getSiteUrl();
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildRootMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  const title = `${SITE_CONFIG.productName} — ${SITE_CONFIG.subtitle}`;
  const ogImage = absoluteUrl(SITE_CONFIG.ogImagePath);

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s · ${SITE_CONFIG.productName}`,
    },
    description: SITE_CONFIG.description,
    keywords: SITE_CONFIG.keywords,
    applicationName: SITE_CONFIG.productName,
    authors: [{ name: NNACT_COMPANY.shortName, url: NNACT_COMPANY.contact.website }],
    creator: NNACT_COMPANY.shortName,
    publisher: NNACT_COMPANY.legalName,
    category: "Business",
    alternates: {
      canonical: "/",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: SITE_CONFIG.locale.replace("_", "-"),
      url: siteUrl,
      siteName: SITE_CONFIG.productName,
      title,
      description: SITE_CONFIG.positioning,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${SITE_CONFIG.productName} — ${NNACT_COMPANY.tagline}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: SITE_CONFIG.positioning,
      images: [ogImage],
      creator: SITE_CONFIG.twitterHandle,
    },
    other: {
      "geo.region": "CM-SW",
      "geo.placename": SITE_CONFIG.address.addressLocality,
      "geo.position": `${NNACT_COMPANY.location.geo.latitude};${NNACT_COMPANY.location.geo.longitude}`,
      ICBM: `${NNACT_COMPANY.location.geo.latitude}, ${NNACT_COMPANY.location.geo.longitude}`,
    },
  };
}

export function pageMetadata(input: {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
}): Metadata {
  const canonical = input.path ?? "/";
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical },
    ...(input.noIndex
      ? { robots: { index: false, follow: false } }
      : {}),
    openGraph: {
      title: `${input.title} · ${SITE_CONFIG.productName}`,
      description: input.description,
      url: absoluteUrl(canonical),
    },
    twitter: {
      title: `${input.title} · ${SITE_CONFIG.productName}`,
      description: input.description,
    },
  };
}
