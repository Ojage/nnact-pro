export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.length === 9) digits = `237${digits}`;
  if (digits.startsWith("00237")) digits = `237${digits.slice(5)}`;
  return digits;
}

export type CameroonCarrier = "mtn" | "orange" | "camtel";

const CAMEROON_MOBILE_RE = /^6[2-9]\d{7}$/;

export function isValidCameroonMobile(input: string): boolean {
  const national = normalizePhone(input).replace(/^237/, "");
  return CAMEROON_MOBILE_RE.test(national);
}

export function cameroonCarrier(input: string): CameroonCarrier | null {
  const national = normalizePhone(input).replace(/^237/, "");
  if (!CAMEROON_MOBILE_RE.test(national)) return null;
  const prefix = national.slice(0, 2);
  if (prefix === "62" || prefix === "63") return "camtel";
  if (prefix === "65" || prefix === "67" || prefix === "68") return "mtn";
  if (prefix === "66" || prefix === "69") return "orange";
  return null;
}

export function cameroonCarrierLabel(input: string): string {
  const carrier = cameroonCarrier(input);
  if (carrier === "camtel") return "Camtel";
  if (carrier === "mtn") return "MTN Cameroon";
  if (carrier === "orange") return "Orange Cameroon";
  return "Cameroon Mobile";
}