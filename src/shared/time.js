const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const datePartFormatterCache = new Map();
let canonicalTimeZoneMap;

function getCanonicalTimeZoneMap() {
  if (canonicalTimeZoneMap) return canonicalTimeZoneMap;

  canonicalTimeZoneMap = new Map([
    ["utc", "UTC"],
    ["gmt", "UTC"],
    ["etc/utc", "UTC"],
    ["etc/gmt", "UTC"],
  ]);

  if (typeof Intl.supportedValuesOf === "function") {
    for (const timeZone of Intl.supportedValuesOf("timeZone")) {
      canonicalTimeZoneMap.set(timeZone.toLowerCase(), timeZone);
    }
  }

  return canonicalTimeZoneMap;
}

/**
 * Normalize an IANA time-zone identifier to its canonical spelling.
 * Numeric offsets and ambiguous abbreviations deliberately do not belong here.
 */
export function normalizeTimeZone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  if (/^(?:utc|gmt)[+-]/i.test(raw) || /^[+-]\d/.test(raw)) return null;

  const known = getCanonicalTimeZoneMap().get(lower);
  if (known) return known;

  // Canonical IANA geographic zones use an Area/Location form. This rejects
  // abbreviations such as CST/IST, whose meaning varies by country.
  if (!raw.includes("/")) return null;

  try {
    const resolved = new Intl.DateTimeFormat("en-US", { timeZone: raw })
      .resolvedOptions()
      .timeZone;
    if (!resolved) return null;
    if (resolved.toUpperCase() === "GMT") return "UTC";
    return getCanonicalTimeZoneMap().get(resolved.toLowerCase()) || resolved;
  } catch {
    return null;
  }
}

function getFormatter(timeZone) {
  if (!datePartFormatterCache.has(timeZone)) {
    datePartFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
  }
  return datePartFormatterCache.get(timeZone);
}

function partMap(formatter, date) {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

export function getZonedDateParts(date, timeZone) {
  const parts = partMap(getFormatter(timeZone), date);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getFixedOffsetDateParts(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + Number(offsetMinutes) * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function localPartsToUtcMs(parts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );
}

function sameLocalParts(a, b) {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute &&
    a.second === b.second
  );
}

function getOffsetMs(date, timeZone) {
  const local = getZonedDateParts(date, timeZone);
  return localPartsToUtcMs(local) - date.getTime();
}

/**
 * Resolve a wall-clock time in an IANA time zone to an instant.
 * DST gaps use the Temporal-compatible "shift forward" behavior.
 * DST overlaps choose the earlier occurrence.
 */
export function resolveLocalDateTime(localParts, timeZone) {
  const target = {
    year: localParts.year,
    month: localParts.month,
    day: localParts.day,
    hour: localParts.hour ?? 0,
    minute: localParts.minute ?? 0,
    second: localParts.second ?? 0,
  };
  const wallMs = localPartsToUtcMs(target);
  let candidateMs = wallMs;
  const beforeOffsetMs = getOffsetMs(new Date(wallMs - 6 * 60 * 60 * 1000), timeZone);
  const afterOffsetMs = getOffsetMs(new Date(wallMs + 6 * 60 * 60 * 1000), timeZone);

  for (let index = 0; index < 8; index += 1) {
    const offsetMs = getOffsetMs(new Date(candidateMs), timeZone);
    const nextMs = wallMs - offsetMs;
    if (nextMs === candidateMs) break;
    candidateMs = nextMs;
  }

  if (afterOffsetMs < beforeOffsetMs) {
    // Ambiguous local time: choose the earlier occurrence even if iteration converged to the later one.
    return new Date(wallMs - beforeOffsetMs);
  }

  if (sameLocalParts(getZonedDateParts(new Date(candidateMs), timeZone), target)) {
    return new Date(candidateMs);
  }

  if (afterOffsetMs > beforeOffsetMs) {
    // Non-existent local time: move forward by the DST gap.
    return new Date(wallMs + afterOffsetMs - beforeOffsetMs - afterOffsetMs);
  }

  if (afterOffsetMs < beforeOffsetMs) {
    // Ambiguous local time: choose the earlier occurrence.
    return new Date(wallMs - beforeOffsetMs);
  }

  return new Date(candidateMs);
}

export function resolveFixedOffsetDateTime(localParts, offsetMinutes) {
  return new Date(localPartsToUtcMs(localParts) - Number(offsetMinutes) * 60 * 1000);
}

export function formatFixedOffsetName(offsetMinutes) {
  const value = Number(offsetMinutes);
  if (!Number.isInteger(value) || value === 0) return "UTC";
  const sign = value > 0 ? "+" : "-";
  const absolute = Math.abs(value);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatBeijingDateTime(date, timeZone = "Asia/Shanghai") {
  const parts = getZonedDateParts(date, timeZone);
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return `${formatDateParts(parts)}（${WEEKDAYS[weekday]}）${formatClock(parts)}`;
}

export function formatClock(parts) {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function formatTimeZoneName(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  });
  const name = formatter
    .formatToParts(date)
    .find(({ type }) => type === "timeZoneName")?.value;

  if (timeZone === "Europe/London") {
    if (name === "GMT+1" || name === "UTC+1") return "BST";
    if (name === "GMT" || name === "UTC") return "GMT";
  }
  return name || timeZone;
}

export function addDaysToDateParts(dateParts, amount) {
  const date = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  date.setUTCDate(date.getUTCDate() + amount);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getWeekday(dateParts) {
  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)).getUTCDay();
}

export function formatDateOnly(dateParts) {
  const weekday = getWeekday(dateParts);
  return `${formatDateParts(dateParts)}（${WEEKDAYS[weekday]}）`;
}

function formatDateParts(dateParts) {
  return `${String(dateParts.year).padStart(4, "0")}/${String(dateParts.month).padStart(2, "0")}/${String(dateParts.day).padStart(2, "0")}`;
}

export function compareDateParts(a, b) {
  return localPartsToUtcMs({ ...a, hour: 0, minute: 0, second: 0 }) -
    localPartsToUtcMs({ ...b, hour: 0, minute: 0, second: 0 });
}
