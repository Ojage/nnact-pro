// Currency support shared by api, web, and mobile.
// Values are held as integer cents; each catalog entry describes how to render them.

export const CURRENCY_CODES = [
  "XAF",
  "XOF",
  "USD",
  "EUR",
  "GBP",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "MAD",
  "TZS",
  "UGX",
  "CAD",
  "AUD",
  "CNY",
  "JPY",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  /** Preferred display symbol (not necessarily ISO 4217). */
  symbol: string;
  /** Human-readable name. */
  name: string;
  /** Locale used for digit grouping and decimals. */
  locale: string;
  /** Decimals normally shown for the currency (XAF / XOF / JPY / KES = 0). */
  minorUnits: number;
}

export const CURRENCY_CATALOG: Record<CurrencyCode, CurrencyInfo> = {
  XAF: { code: "XAF", symbol: "FCFA", name: "Central African CFA franc", locale: "fr-CM", minorUnits: 0 },
  XOF: { code: "XOF", symbol: "FCFA", name: "West African CFA franc", locale: "fr-SN", minorUnits: 0 },
  USD: { code: "USD", symbol: "$", name: "US dollar", locale: "en-US", minorUnits: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", locale: "fr-FR", minorUnits: 2 },
  GBP: { code: "GBP", symbol: "£", name: "British pound", locale: "en-GB", minorUnits: 2 },
  NGN: { code: "NGN", symbol: "₦", name: "Nigerian naira", locale: "en-NG", minorUnits: 2 },
  GHS: { code: "GHS", symbol: "GH₵", name: "Ghanaian cedi", locale: "en-GH", minorUnits: 2 },
  KES: { code: "KES", symbol: "KSh", name: "Kenyan shilling", locale: "en-KE", minorUnits: 0 },
  ZAR: { code: "ZAR", symbol: "R", name: "South African rand", locale: "en-ZA", minorUnits: 2 },
  MAD: { code: "MAD", symbol: "DH", name: "Moroccan dirham", locale: "ar-MA", minorUnits: 2 },
  TZS: { code: "TZS", symbol: "TSh", name: "Tanzanian shilling", locale: "en-TZ", minorUnits: 0 },
  UGX: { code: "UGX", symbol: "USh", name: "Ugandan shilling", locale: "en-UG", minorUnits: 0 },
  CAD: { code: "CAD", symbol: "CA$", name: "Canadian dollar", locale: "en-CA", minorUnits: 2 },
  AUD: { code: "AUD", symbol: "A$", name: "Australian dollar", locale: "en-AU", minorUnits: 2 },
  CNY: { code: "CNY", symbol: "¥", name: "Chinese yuan", locale: "zh-CN", minorUnits: 2 },
  JPY: { code: "JPY", symbol: "¥", name: "Japanese yen", locale: "ja-JP", minorUnits: 0 },
};

/** The currency new organizations start with. */
export const DEFAULT_CURRENCY: CurrencyCode = "XAF";

export function isCurrencyCode(input: unknown): input is CurrencyCode {
  return typeof input === "string" && (CURRENCY_CODES as readonly string[]).includes(input);
}

const _formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode): Intl.NumberFormat {
  const info = CURRENCY_CATALOG[currency];
  const key = `${info.locale}:${info.minorUnits}`;
  let cached = _formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(info.locale, { useGrouping: true, minimumFractionDigits: info.minorUnits, maximumFractionDigits: info.minorUnits });
    _formatters.set(key, cached);
  }
  return cached;
}

/**
 * Render integer cents in the org's currency. Defaults to XAF so that new
 * installations and any call that has not negotiated a currency still never
 * show a hardcoded dollar sign.
 */
export function formatMoney(cents: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const info = CURRENCY_CATALOG[currency];
  const scaled = info.minorUnits === 0 ? Math.round(cents / 100) : cents / 100;
  const digits = formatterFor(currency).format(scaled);
  // Multi-letter symbols read better with a gap ("FCFA 189"); glyphs don't ("$189.00").
  return info.symbol.length > 1 ? `${info.symbol} ${digits}` : `${info.symbol}${digits}`;
}