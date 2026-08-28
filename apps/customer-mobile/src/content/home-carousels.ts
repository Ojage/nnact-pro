import type { ImageSourcePropType } from "react-native";
import { NNACT_COMPANY } from "@nnact/shared";

export type HomeCarouselSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
  badge?: string;
};

export const SERVICE_CAROUSEL_SLIDES: HomeCarouselSlide[] = [
  {
    id: "hvac",
    eyebrow: NNACT_COMPANY.divisions[0].name,
    title: "Climate you can count on",
    description: `${NNACT_COMPANY.divisions[0].services.length} services including ${NNACT_COMPANY.divisions[0].services[0].toLowerCase()}.`,
    image: require("../../assets/carousel/carousel-hvac.png"),
  },
  {
    id: "electrical",
    eyebrow: NNACT_COMPANY.divisions[1].name,
    title: "Power that keeps you running",
    description: `${NNACT_COMPANY.divisions[1].services.length} services including ${NNACT_COMPANY.divisions[1].services[0].toLowerCase()}.`,
    image: require("../../assets/carousel/carousel-electrical.png"),
  },
  {
    id: "technical",
    eyebrow: NNACT_COMPANY.divisions[2].name,
    title: "Expert care for every machine",
    description: `${NNACT_COMPANY.divisions[2].services.length} services including ${NNACT_COMPANY.divisions[2].services[0].toLowerCase()}.`,
    image: require("../../assets/carousel/carousel-maintenance.png"),
  },
];

export function buildActionCarouselSlides(pendingEstimates?: number): HomeCarouselSlide[] {
  return [
    {
      id: "estimates",
      eyebrow: "Estimates",
      title: "Approve estimates",
      description: "Review and accept repair quotes sent by your NNACT technician.",
      image: require("../../assets/carousel/carousel-estimates.png"),
      badge: pendingEstimates ? `${pendingEstimates} pending` : undefined,
    },
    {
      id: "payments",
      eyebrow: "Secure checkout",
      title: "Pay invoices",
      description: "Pay your balance online when checkout is enabled for your account.",
      image: require("../../assets/carousel/carousel-payments.png"),
    },
    {
      id: "tracking",
      eyebrow: "Maintenance plans",
      title: "Track maintenance",
      description: "See service history and active preventive maintenance plans.",
      image: require("../../assets/carousel/carousel-tracking.png"),
    },
    {
      id: "booking",
      eyebrow: "Schedule a visit",
      title: "Book a service call",
      description: "Request HVAC, refrigeration, electrical, or appliance service.",
      image: require("../../assets/carousel/carousel-booking.png"),
    },
  ];
}
