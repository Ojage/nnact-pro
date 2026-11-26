import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AirVent(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8h13a3 3 0 1 0-3-3" />
      <path d="M3 12h17a3 3 0 1 1-3 3" />
      <path d="M3 16h9" />
    </Icon>
  );
}

export function Refrigerator(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M5 10h14" />
      <path d="M9 6v2" />
      <path d="M9 13v3" />
    </Icon>
  );
}

export function Car(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 17h14" />
      <path d="M6 17v2" />
      <path d="M18 17v2" />
      <path d="M4 13l2-6h12l2 6" />
      <path d="M4 13h16v4H4z" />
      <path d="M7 15h2" />
      <path d="M15 15h2" />
    </Icon>
  );
}

export function Zap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
    </Icon>
  );
}

export function Power(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v9" />
      <path d="M6.5 6.5a8 8 0 1 0 11 0" />
    </Icon>
  );
}

export function Sun(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.9 4.9l1.4 1.4" />
      <path d="M17.7 17.7l1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.9 19.1l1.4-1.4" />
      <path d="M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function Home(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v12h14V9" />
      <path d="M9 21v-7h6v7" />
    </Icon>
  );
}

export function CalendarCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="m9 14 2 2 4-4" />
    </Icon>
  );
}

export function Factory(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 21V10l6 4V10l6 4V7l6 3v11z" />
      <path d="M7 17h2" />
      <path d="M13 17h2" />
    </Icon>
  );
}

export function ArrowDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v16" />
      <path d="m6 14 6 6 6-6" />
    </Icon>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </Icon>
  );
}

export function ClipboardCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2" />
      <path d="m9 13 2 2 4-4" />
    </Icon>
  );
}

export function ShieldCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function Wrench(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 6.5a4 4 0 0 0-5 5L4 17v3h3l5.5-5.5a4 4 0 0 0 5-5l-3 3-3-3z" />
    </Icon>
  );
}

export function Mail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Icon>
  );
}

export function MapPin(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </Icon>
  );
}

export function Phone(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z" />
    </Icon>
  );
}
