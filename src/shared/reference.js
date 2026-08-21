const CLOCK_TIME = /\b(?:0?[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i;
const NAMED_TIME = /\b(?:noon|midnight|close\s+of\s+business|cob|end\s+of\s+business|eod|end\s+of\s+day)\b/i;
const RELATIVE_DATE = /\b(?:today|yesterday|tomorrow|this|next)\b/i;
const EXPLICIT_FULL_DATE = [
  /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s+20\d{2}\b/i,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+20\d{2}\b/i,
];

/**
 * Gmail's message date is the calendar reference for omitted or relative dates.
 * A full calendar date already carries its own date and should not be labelled
 * as depending on the Gmail message date.
 */
export function needsReferenceDate(text) {
  const value = String(text || "").trim();
  if (!value || EXPLICIT_FULL_DATE.some((pattern) => pattern.test(value))) return false;
  return RELATIVE_DATE.test(value) || CLOCK_TIME.test(value) || NAMED_TIME.test(value);
}
