const FIXED_ZONE_ABBREVIATIONS = [
  { token: "CEST", offsetMinutes: 120 },
  { token: "CET", offsetMinutes: 60 },
];

/**
 * These abbreviations are treated literally. They are not IANA regions and
 * therefore must not inherit a region's daylight-saving rule.
 */
export function detectFixedTimeZoneAbbreviation(text) {
  const value = String(text || "");
  for (const entry of FIXED_ZONE_ABBREVIATIONS) {
    if (new RegExp("\\b" + entry.token + "\\b", "i").test(value)) return entry;
  }
  return null;
}
