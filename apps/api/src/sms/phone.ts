/** Normalize a Cameroon-typical number to 237XXXXXXXXX (206, 65, 66, 67, 68...). */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.length === 9) digits = `237${digits}`;
  if (digits.startsWith("00237")) digits = `237${digits.slice(5)}`;
  return digits;
}