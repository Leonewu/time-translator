import { normalizeCustomKeywords } from "./config.js";

const TWELVE_HOUR_TIME = /\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/i;
const TWENTY_FOUR_HOUR_TIME = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
const NAMED_TIME = /\b(?:noon|midnight)\b/i;
const STANDARD_DATE_TIME = /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}[T\s]+(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?(?:\s*(?:Z|UTC|GMT|UTC[+-]\d{1,2}(?::?\d{2})?|GMT[+-]\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}))?/i;

/**
 * Conservative gate for automatic conversion.
 * A bare number or a generic word such as "before" is not enough.
 */
export function isTimeCandidate(text, { customKeywords = [] } = {}) {
  const value = String(text || "").trim();
  if (!value || value.length > 240 || /https?:\/\//i.test(value)) return false;
  if (TWELVE_HOUR_TIME.test(value) || TWENTY_FOUR_HOUR_TIME.test(value) || NAMED_TIME.test(value) || STANDARD_DATE_TIME.test(value)) return true;
  const lowerValue = value.toLocaleLowerCase();
  return normalizeCustomKeywords(customKeywords).some((keyword) => lowerValue.includes(keyword.toLocaleLowerCase()));
}
