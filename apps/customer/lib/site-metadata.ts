import type { Metadata } from "next";
import { NNACT_COMPANY, NNACT_PRODUCT } from "@nnact/shared";

const siteUrl = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3002";

export const customerSiteMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${NNACT_COMPANY.shortName} Customer — ${NNACT_COMPANY.tagline}`,
    template: `%s · ${NNACT_COMPANY.shortName}`,
  },
  description: `Request service, review estimates, pay invoices, and track maintenance with ${NNACT_COMPANY.shortName} — HVAC, refrigeration, electrical, and solar services in ${NNACT_COMPANY.location.addressLocality}.`,
  applicationName: `${NNACT_COMPANY.shortName} Customer`,
  openGraph: {
    type: "website",
    locale: "en_CM",
    siteName: `${NNACT_COMPANY.shortName} Customer`,
    title: `${NNACT_COMPANY.shortName} — ${NNACT_COMPANY.tagline}`,
    description: NNACT_COMPANY.customerPromise,
    images: [{ url: "/nnact-logo.jpeg", width: 1200, height: 630, alt: NNACT_COMPANY.shortName }],
  },
};
