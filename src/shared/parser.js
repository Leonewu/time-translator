import {
  addDaysToDateParts,
  compareDateParts,
  formatBeijingDateTime,
  formatClock,
  formatDateOnly,
  formatFixedOffsetName,
  formatTimeZoneName,
  getFixedOffsetDateParts,
  getWeekday,
  getZonedDateParts,
  normalizeTimeZone,
  resolveFixedOffsetDateTime,
  resolveLocalDateTime,
} from "./time.js";
import { detectFixedTimeZoneAbbreviation } from "./source-zone.js";

const WEEKDAY_NAMES = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_NAMES = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const TIME_ZONE_ALIASES = [
  { zone: "Europe/London", label: "英国", patterns: [/\buk\b/, /\bbritish time\b/, /\blondon(?: time)?\b/, /\bbst\b/, /\bgmt\b/] },
  { zone: "America/New_York", label: "美国东部", patterns: [/\beastern time\b/, /\beastern\b/, /\bet\b/, /\bnew york\b/, /\best\b/, /\bedt\b/] },
  { zone: "America/Los_Angeles", label: "美国太平洋", patterns: [/\bpacific time\b/, /\bpacific\b/, /\bpt\b/, /\blos angeles\b/, /\bpst\b/, /\bpdt\b/] },
  { zone: "Asia/Tokyo", label: "日本", patterns: [/\bjapan(?: time)?\b/, /\bjst\b/, /\btokyo(?: time)?\b/] },
  { zone: "Asia/Singapore", label: "新加坡", patterns: [/\bsingapore(?: time)?\b/, /\bsgt\b/] },
  { zone: "Asia/Kolkata", label: "印度", patterns: [/\bindia(?: time)?\b/, /\bist\b/, /\bmumbai\b/] },
  { zone: "Europe/Paris", label: "中欧", patterns: [/\bcentral european time\b/, /\bcet\b/, /\bparis(?: time)?\b/, /\bberlin(?: time)?\b/] },
  { zone: "Asia/Shanghai", label: "中国", patterns: [/\bchina(?: time)?\b/, /\bbeijing(?: time)?\b/, /\bcst\b/] },
  { zone: "UTC", label: "UTC", patterns: [/\butc\b/, /\bzulu\b/] },
];

const TIME_ZONE_PATTERN = /\b(?:uk|british time|london(?: time)?|bst|gmt|eastern time|eastern|et|new york|est|edt|pacific time|pacific|pt|los angeles|pst|pdt|japan(?: time)?|jst|tokyo(?: time)?|singapore(?: time)?|sgt|india(?: time)?|ist|mumbai|central european time|cet|paris(?: time)?|berlin(?: time)?|china(?: time)?|beijing(?: time)?|cst|utc|zulu)\b/gi;

function normalizedText(text) {
  return text
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseOffsetMinutes(value) {
  const token = String(value || "").trim().toUpperCase();
  if (!token || token === "Z" || token === "UTC" || token === "GMT") return token ? 0 : null;
  const match = token.match(/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  if (minutes > 59) return null;
  const total = hours * 60 + minutes;
  if (total > 840) return null;
  return match[1] === "+" ? total : -total;
}

function detectExplicitOffset(text) {
  const value = String(text || "");
  if (/\bZ\b/i.test(value)) return 0;

  const match = value.match(/(?:\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?|([+-])(\d{2}):?(\d{2}))/i);
  if (!match) return null;

  const sign = match[1] || match[4];
  const hours = match[2] || match[5];
  const minutes = match[3] || match[6] || "00";
  return parseOffsetMinutes(`${sign}${hours}:${minutes}`);
}

function parseStandardDateTime(text) {
  const match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})[t\s]+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\s*(z|utc|gmt|utc[+-]\d{1,2}(?::?\d{2})?|gmt[+-]\d{1,2}(?::?\d{2})?|[+-]\d{2}:?\d{2}|(?:[a-z0-9_+-]+\/)+[a-z0-9_+-]+))?/i);
  if (!match) return null;

  const zoneToken = match[7] || "";
  const offsetMinutes = zoneToken.includes("/") ? null : parseOffsetMinutes(zoneToken);
  if (zoneToken && !zoneToken.includes("/") && offsetMinutes === null) return null;
  const sourceTimeZone = zoneToken.includes("/") ? normalizeTimeZone(zoneToken) : "";
  if (zoneToken.includes("/") && !sourceTimeZone) return null;

  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (!isValidDateParts(date)) return null;

  return {
    date,
    time: { hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) },
    dateExpression: `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`,
    sourceTimeZone,
    sourceOffsetMinutes: zoneToken.includes("/") ? null : offsetMinutes,
  };
}

function isValidDateParts(date) {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return value.getUTCFullYear() === date.year &&
    value.getUTCMonth() + 1 === date.month &&
    value.getUTCDate() === date.day;
}

function detectTimeZone(text, defaultSourceTimeZone) {
  const fixedAbbreviation = detectFixedTimeZoneAbbreviation(text);
  if (fixedAbbreviation) {
    return {
      timeZone: "",
      label: fixedAbbreviation.token,
      offsetMinutes: fixedAbbreviation.offsetMinutes,
      explicit: true,
    };
  }
  for (const alias of TIME_ZONE_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(text))) {
      return { timeZone: alias.zone, label: alias.label, explicit: true };
    }
  }
  return { timeZone: defaultSourceTimeZone, label: defaultSourceTimeZone, explicit: false };
}

function parseClockValue(rawHour, rawMinute, meridiem) {
  let hour = Number(rawHour);
  const minute = Number(rawMinute ?? 0);
  const suffix = meridiem?.replace(/\./g, "").toLowerCase();

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { hour, minute, second: 0 };
}

function parseTimeAt(text, startIndex = 0) {
  const remaining = text.slice(startIndex);

  const special = remaining.match(/\b(noon|midnight)\b/i);
  if (special) {
    return {
      index: startIndex + special.index,
      length: special[0].length,
      time: special[1].toLowerCase() === "noon" ? { hour: 12, minute: 0, second: 0 } : { hour: 0, minute: 0, second: 0 },
      text: special[0],
    };
  }

  const twelveHour = remaining.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (twelveHour) {
    const time = parseClockValue(twelveHour[1], twelveHour[2], twelveHour[3]);
    return time
      ? {
          index: startIndex + twelveHour.index,
          length: twelveHour[0].length,
          time,
          text: twelveHour[0],
        }
      : null;
  }

  const twentyFourHour = remaining.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    return {
      index: startIndex + twentyFourHour.index,
      length: twentyFourHour[0].length,
      time: parseClockValue(twentyFourHour[1], twentyFourHour[2]),
      text: twentyFourHour[0],
    };
  }

  return null;
}

function parseBareTime(text) {
  const bare = text.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*$/);
  if (!bare) return null;
  const time = parseClockValue(bare[1], bare[2]);
  return time ? { time, text: bare[0].trim() } : null;
}

function parseRangeTimes(text) {
  const range = text.match(/\bbetween\s+(.+?)\s+and\s+(.+?)(?=\s+(?:uk|london|pacific|eastern|tokyo|new york|china|beijing|utc|gmt)\b|$)/i);
  if (range) {
    const first = parseTimeAt(range[1]) || parseBareTime(range[1]);
    const second = parseTimeAt(range[2]) || parseBareTime(range[2]);
    if (first && second) {
      if (!/[ap]\.?m\.?/i.test(range[1]) && /[ap]\.?m\.?/i.test(range[2])) {
        const meridiem = range[2].match(/([ap]\.?m\.?)/i)[1].toLowerCase();
        first.time = parseClockValue(first.time.hour, first.time.minute, meridiem);
      }
      return { start: first.time, end: second.time };
    }
  }

  const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:uk|london|pacific|eastern|tokyo|new york|china|beijing|utc|gmt)\b|$)/i);
  if (fromTo) {
    const first = parseTimeAt(fromTo[1]) || parseBareTime(fromTo[1]);
    const second = parseTimeAt(fromTo[2]) || parseBareTime(fromTo[2]);
    if (first && second) return { start: first.time, end: second.time };
  }

  return null;
}

function parseDateExpression(text, reference, sourceTimeZone, sourceOffsetMinutes = null) {
  const sourceNow = sourceOffsetMinutes === null
    ? getZonedDateParts(reference, sourceTimeZone)
    : getFixedOffsetDateParts(reference, sourceOffsetMinutes);
  const baseDate = { year: sourceNow.year, month: sourceNow.month, day: sourceNow.day };

  if (/\btomorrow\b/.test(text)) return { date: addDaysToDateParts(baseDate, 1), expression: "tomorrow" };
  if (/\byesterday\b/.test(text)) return { date: addDaysToDateParts(baseDate, -1), expression: "yesterday" };
  if (/\btoday\b/.test(text)) return { date: baseDate, expression: "today" };

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const date = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
    if (!isValidDateParts(date)) return { date: baseDate, expression: iso[0], assumed: true };
    return {
      date,
      expression: iso[0],
    };
  }

  const monthNames = Object.keys(MONTH_NAMES).join("|");
  const monthFirst = text.match(new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i"));
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?(?:\\s+(\\d{4}))?\\b`, "i"));
  const explicitDate = monthFirst || dayFirst;
  if (explicitDate) {
    const isMonthFirst = Boolean(monthFirst);
    const month = MONTH_NAMES[(isMonthFirst ? explicitDate[1] : explicitDate[2]).toLowerCase()];
    const day = Number(isMonthFirst ? explicitDate[2] : explicitDate[1]);
    const year = Number(isMonthFirst ? explicitDate[3] : explicitDate[3]) || sourceNow.year;
    return { date: { year, month, day }, expression: explicitDate[0] };
  }

  const weekdayMatch = text.match(/\b(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekdayMatch) {
    const target = WEEKDAY_NAMES[weekdayMatch[2]];
    const current = getWeekday(baseDate);
    let delta = (target - current + 7) % 7;
    if (weekdayMatch[1] === "next" || (!weekdayMatch[1] && delta === 0)) delta = delta || 7;
    if (weekdayMatch[1] === "this" && delta === 0) delta = 0;
    return {
      date: addDaysToDateParts(baseDate, delta),
      expression: weekdayMatch[0].trim(),
    };
  }

  return { date: baseDate, expression: "today", assumed: true };
}

function detectRelation(text) {
  if (/\bbetween\b|\bfrom\b.+\bto\b/.test(text)) return "between";
  if (/\b(before|prior to|no later than)\b/.test(text)) return "before";
  if (/\bby\b/.test(text)) return "by";
  if (/\b(after|later than|following)\b/.test(text)) return "after";
  return "at";
}

function makeLocalDateTime(date, time) {
  return { ...date, ...time };
}

function displayForRelation(relation, instant, endInstant, targetTimeZone) {
  if (relation === "between") {
    const start = getZonedDateParts(instant, targetTimeZone);
    const end = getZonedDateParts(endInstant, targetTimeZone);
    const sameDate = start.year === end.year && start.month === end.month && start.day === end.day;
    return sameDate
      ? `${formatBeijingDateTime(instant, targetTimeZone)}–${formatClock(end)}`
      : `${formatBeijingDateTime(instant, targetTimeZone)}–${formatBeijingDateTime(endInstant, targetTimeZone)}`;
  }
  const value = formatBeijingDateTime(instant, targetTimeZone);
  if (relation === "before" || relation === "by") return `${value} 前`;
  if (relation === "after") return `${value} 之后`;
  return value;
}

function parseStructuredClock(value) {
  if (!value) return null;
  const parsed = parseTimeAt(String(value)) || parseBareTime(String(value));
  return parsed?.time || null;
}

function canonicalDefaultTimeZone(value) {
  return normalizeTimeZone(value) || "Europe/London";
}

function canonicalTargetTimeZone(value) {
  return normalizeTimeZone(value) || "Asia/Shanghai";
}

function parseNormalizedLocalDateTime(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
  );
  if (!match) return null;

  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (!isValidDateParts(date)) return null;

  return {
    ...date,
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  };
}

function normalizedFailure(reason, extraction, options) {
  return {
    ok: false,
    reason,
    rawText: options.rawText || "",
    confidence: extraction?.confidence || 0,
  };
}

const NORMALIZED_RESULT_KEYS = new Set([
  "status",
  "start_local",
  "end_local",
  "source_time_zone",
  "relation",
  "confidence",
  "reason",
  "assumptions",
]);

function hasValidNormalizedShape(extraction) {
  if (!extraction || typeof extraction !== "object" || Array.isArray(extraction)) return false;
  if (Object.keys(extraction).some((key) => !NORMALIZED_RESULT_KEYS.has(key))) return false;
  if (!Object.hasOwn(extraction, "status") ||
      !Object.hasOwn(extraction, "start_local") ||
      !Object.hasOwn(extraction, "end_local") ||
      !Object.hasOwn(extraction, "source_time_zone") ||
      !Object.hasOwn(extraction, "relation") ||
      !Object.hasOwn(extraction, "confidence") ||
      !Object.hasOwn(extraction, "reason") ||
      !Object.hasOwn(extraction, "assumptions")) return false;
  if (typeof extraction.source_time_zone !== "string" ||
      (extraction.start_local !== null && typeof extraction.start_local !== "string") ||
      (extraction.end_local !== null && typeof extraction.end_local !== "string") ||
      !["high", "medium", "low"].includes(extraction.confidence) ||
      typeof extraction.reason !== "string" ||
      !Array.isArray(extraction.assumptions) ||
      extraction.assumptions.some((item) => typeof item !== "string")) return false;
  return true;
}

function resolveSourceLocalDateTime(localDateTime, sourceTimeZone, sourceOffsetMinutes) {
  return sourceOffsetMinutes === null
    ? resolveLocalDateTime(localDateTime, sourceTimeZone)
    : resolveFixedOffsetDateTime(localDateTime, sourceOffsetMinutes);
}

/**
 * Convert the compact, normalized LLM result into the extension result.
 * The LLM supplies a local wall-clock value; this module owns timezone math.
 */
export function parseNormalizedTimeExpression(extraction, options = {}) {
  const defaultSourceTimeZone = canonicalDefaultTimeZone(options.defaultSourceTimeZone);
  const targetTimeZone = canonicalTargetTimeZone(options.targetTimeZone);
  const status = extraction?.status;

  if (!hasValidNormalizedShape(extraction)) {
    return normalizedFailure("在线模型返回的标准时间结构无效", extraction, options);
  }

  if (status === "not_time") {
    return normalizedFailure("这段文字不是具体时间表达", extraction, options);
  }
  if (status === "ambiguous") {
    return normalizedFailure("在线模型无法确定具体时间", extraction, options);
  }
  if (status === "unsupported") {
    return normalizedFailure("在线模型返回了不支持的时间表达", extraction, options);
  }
  if (status !== "ok") {
    return normalizedFailure("在线模型返回了无效的标准时间结果", extraction, options);
  }

  const startLocal = parseNormalizedLocalDateTime(extraction.start_local);
  const endLocal = extraction.end_local ? parseNormalizedLocalDateTime(extraction.end_local) : null;
  if (!startLocal) return normalizedFailure("在线模型返回了无效的开始时间", extraction, options);
  if (extraction.end_local && !endLocal) return normalizedFailure("在线模型返回了无效的结束时间", extraction, options);

  const relation = extraction.relation;
  if (!["before", "by", "after", "at", "between"].includes(relation)) {
    return normalizedFailure("在线模型返回了不支持的时间关系", extraction, options);
  }
  if (relation === "between" && !endLocal) {
    return normalizedFailure("时间范围缺少结束时间", extraction, options);
  }
  if (relation !== "between" && endLocal) {
    return normalizedFailure("非时间范围表达不应包含结束时间", extraction, options);
  }

  const fixedAbbreviation = detectFixedTimeZoneAbbreviation(options.rawText);
  const requestedSourceTimeZone = String(extraction.source_time_zone || "").trim();
  const sourceTimeZone = requestedSourceTimeZone
    ? (fixedAbbreviation ? "" : normalizeTimeZone(requestedSourceTimeZone))
    : "";
  if (requestedSourceTimeZone && !sourceTimeZone && !fixedAbbreviation) {
    return normalizedFailure("在线模型返回了无法识别的源时区", extraction, options);
  }

  const explicitOffsetInText = detectExplicitOffset(options.rawText);
  const hasSourceOffset = fixedAbbreviation !== null || explicitOffsetInText !== null;
  const sourceOffsetMinutes = fixedAbbreviation?.offsetMinutes ?? explicitOffsetInText;
  if (sourceTimeZone && hasSourceOffset) {
    return normalizedFailure("原文包含固定 UTC 偏移量时不能返回 IANA 时区", extraction, options);
  }

  const effectiveSourceTimeZone = sourceTimeZone || (hasSourceOffset ? formatFixedOffsetName(sourceOffsetMinutes) : defaultSourceTimeZone);
  const instant = resolveSourceLocalDateTime(startLocal, effectiveSourceTimeZone, sourceOffsetMinutes);
  const endInstant = endLocal
    ? resolveSourceLocalDateTime(endLocal, effectiveSourceTimeZone, sourceOffsetMinutes)
    : null;
  if (endInstant && endInstant <= instant) {
    return normalizedFailure("在线模型返回的时间范围顺序无效", extraction, options);
  }

  const assumptions = [
    ...(Array.isArray(extraction.assumptions) ? extraction.assumptions : []),
    ...(fixedAbbreviation
      ? ["原文时区缩写 " + fixedAbbreviation.token + " 按固定 " + formatFixedOffsetName(fixedAbbreviation.offsetMinutes) + " 计算"]
      : []),
    ...(!requestedSourceTimeZone && !hasSourceOffset
      ? [`未写明源时区，使用默认源时区 ${defaultSourceTimeZone}`]
      : []),
  ];
  const startText = String(extraction.start_local);
  const endText = endLocal ? String(extraction.end_local) : "";

  return {
    ok: true,
    rawText: options.rawText || "",
    sourceTimeZone: sourceTimeZone || (hasSourceOffset ? formatFixedOffsetName(sourceOffsetMinutes) : defaultSourceTimeZone),
    sourceTimeZoneName: sourceOffsetMinutes === null
      ? formatTimeZoneName(instant, effectiveSourceTimeZone)
      : formatFixedOffsetName(sourceOffsetMinutes),
    targetTimeZone,
    dateExpression: startText.slice(0, 10),
    timeExpression: endText ? `${startText.slice(11, 16)}–${endText.slice(11, 16)}` : startText.slice(11, 16),
    relation,
    localDateTime: startLocal,
    instant: instant.toISOString(),
    endInstant: endInstant?.toISOString() || null,
    sourceOffsetMinutes: sourceOffsetMinutes ?? undefined,
    displayText: displayForRelation(relation, instant, endInstant, targetTimeZone),
    assumptions,
    confidence: extraction.confidence || 0.8,
  };
}

export function parseStructuredTimeExpression(extraction, options = {}) {
  const reference = options.reference instanceof Date ? options.reference : new Date();
  const defaultSourceTimeZone = canonicalDefaultTimeZone(options.defaultSourceTimeZone);
  const targetTimeZone = canonicalTargetTimeZone(options.targetTimeZone);
  if (Object.prototype.hasOwnProperty.call(extraction || {}, "status")) {
    return parseNormalizedTimeExpression(extraction, options);
  }
  if (extraction?.is_time_expression === false) {
    return {
      ok: false,
      reason: "这段文字不是具体时间表达",
      rawText: options.rawText || "",
      confidence: extraction.confidence || 0,
    };
  }

  const requestedSourceTimeZone = String(extraction?.source_time_zone || "").trim();
  const sourceTimeZone = requestedSourceTimeZone ? normalizeTimeZone(requestedSourceTimeZone) : "";
  if (requestedSourceTimeZone && !sourceTimeZone) {
    return {
      ok: false,
      reason: "在线模型返回了无法识别的源时区",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }

  const hasSourceOffset = extraction?.source_offset_minutes !== null &&
    extraction?.source_offset_minutes !== undefined &&
    extraction?.source_offset_minutes !== "";
  const sourceOffsetMinutes = hasSourceOffset ? Number(extraction.source_offset_minutes) : null;
  if (hasSourceOffset && (!Number.isInteger(sourceOffsetMinutes) || sourceOffsetMinutes < -840 || sourceOffsetMinutes > 840)) {
    return {
      ok: false,
      reason: "在线模型返回了无效的 UTC 偏移量",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }
  if (requestedSourceTimeZone && hasSourceOffset) {
    return {
      ok: false,
      reason: "在线模型同时返回了 IANA 时区和 UTC 偏移量",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }

  const effectiveSourceTimeZone = sourceTimeZone || (hasSourceOffset ? formatFixedOffsetName(sourceOffsetMinutes) : defaultSourceTimeZone);
  const startTime = parseStructuredClock(extraction?.start_time || extraction?.time);
  const endTime = parseStructuredClock(extraction?.end_time);

  if (!startTime || extraction?.needs_clarification) {
    return {
      ok: false,
      reason: "在线模型无法确定具体时间",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }

  const dateInfo = parseDateExpression(
    normalizedText(extraction.date_expression || ""),
    reference,
    effectiveSourceTimeZone,
    sourceOffsetMinutes,
  );
  if (!String(extraction?.date_expression || "").trim() || dateInfo.assumed) {
    return {
      ok: false,
      reason: "在线模型返回了不支持的日期表达",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }

  const relation = extraction.relation || (endTime ? "between" : "at");
  if (!["before", "by", "after", "at", "between"].includes(relation)) {
    return {
      ok: false,
      reason: "在线模型返回了不支持的时间关系",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }
  if (relation === "between" && !endTime) {
    return {
      ok: false,
      reason: "时间范围缺少结束时间",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }
  if (relation !== "between" && endTime) {
    return {
      ok: false,
      reason: "非时间范围表达不应包含结束时间",
      rawText: options.rawText || "",
      confidence: 0,
    };
  }
  const localDateTime = makeLocalDateTime(dateInfo.date, startTime);
  const instant = sourceOffsetMinutes === null
    ? resolveLocalDateTime(localDateTime, effectiveSourceTimeZone)
    : resolveFixedOffsetDateTime(localDateTime, sourceOffsetMinutes);
  let endInstant = endTime
    ? (sourceOffsetMinutes === null
      ? resolveLocalDateTime(makeLocalDateTime(dateInfo.date, endTime), effectiveSourceTimeZone)
      : resolveFixedOffsetDateTime(makeLocalDateTime(dateInfo.date, endTime), sourceOffsetMinutes))
    : null;
  if (endInstant && endInstant <= instant) {
    const nextDateTime = makeLocalDateTime(addDaysToDateParts(dateInfo.date, 1), endTime);
    endInstant = sourceOffsetMinutes === null
      ? resolveLocalDateTime(nextDateTime, effectiveSourceTimeZone)
      : resolveFixedOffsetDateTime(nextDateTime, sourceOffsetMinutes);
  }
  const assumptions = [
    ...(Array.isArray(extraction.assumptions) ? extraction.assumptions : []),
    ...(!requestedSourceTimeZone && !hasSourceOffset
      ? [`未写明源时区，使用默认源时区 ${defaultSourceTimeZone}`]
      : []),
  ];

  return {
    ok: true,
    rawText: options.rawText || "",
    sourceTimeZone: effectiveSourceTimeZone,
    sourceTimeZoneName: sourceOffsetMinutes === null
      ? formatTimeZoneName(instant, effectiveSourceTimeZone)
      : formatFixedOffsetName(sourceOffsetMinutes),
    targetTimeZone,
    dateExpression: extraction.date_expression || "today",
    timeExpression: endTime ? `${extraction.start_time}–${extraction.end_time}` : extraction.start_time,
    relation,
    localDateTime,
    instant: instant.toISOString(),
    endInstant: endInstant?.toISOString() || null,
    sourceOffsetMinutes: sourceOffsetMinutes ?? undefined,
    displayText: displayForRelation(relation, instant, endInstant, targetTimeZone),
    assumptions,
    confidence: extraction.confidence || 0.8,
  };
}

export function parseEnglishTimeExpression(text, options = {}) {
  const reference = options.reference instanceof Date ? options.reference : new Date();
  const defaultSourceTimeZone = canonicalDefaultTimeZone(options.defaultSourceTimeZone);
  const targetTimeZone = canonicalTargetTimeZone(options.targetTimeZone);
  const normalized = normalizedText(text);
  const standard = parseStandardDateTime(String(text));
  if (standard) {
    const sourceOffsetMinutes = standard.sourceOffsetMinutes;
    const sourceTimeZone = standard.sourceTimeZone || defaultSourceTimeZone;
    const localDateTime = makeLocalDateTime(standard.date, standard.time);
    const instant = sourceOffsetMinutes === null
      ? resolveLocalDateTime(localDateTime, sourceTimeZone)
      : resolveFixedOffsetDateTime(localDateTime, sourceOffsetMinutes);
    const relation = detectRelation(normalized);
    const assumptions = [];
    if (!standard.sourceTimeZone && sourceOffsetMinutes === null) {
      assumptions.push(`未写明源时区，使用默认源时区 ${defaultSourceTimeZone}`);
    }
    return {
      ok: true,
      rawText: text,
      sourceTimeZone: sourceOffsetMinutes === null ? sourceTimeZone : formatFixedOffsetName(sourceOffsetMinutes),
      sourceTimeZoneName: sourceOffsetMinutes === null
        ? formatTimeZoneName(instant, sourceTimeZone)
        : formatFixedOffsetName(sourceOffsetMinutes),
      targetTimeZone,
      dateExpression: standard.dateExpression,
      timeExpression: formatClock(standard.time),
      relation,
      localDateTime,
      instant: instant.toISOString(),
      endInstant: null,
      sourceOffsetMinutes: sourceOffsetMinutes ?? undefined,
      displayText: displayForRelation(relation, instant, null, targetTimeZone),
      assumptions,
      confidence: standard.sourceTimeZone || sourceOffsetMinutes !== null ? 0.99 : 0.9,
    };
  }
  const zone = detectTimeZone(normalized, defaultSourceTimeZone);
  const sourceOffsetMinutes = Number.isInteger(zone.offsetMinutes) ? zone.offsetMinutes : null;
  const range = parseRangeTimes(normalized);
  const time = range ? null : parseTimeAt(normalized);

  if (!range && !time) {
    return {
      ok: false,
      reason: "无法从文本中确定具体时间",
      rawText: text,
      confidence: 0,
    };
  }

  const dateExpression = parseDateExpression(normalized, reference, zone.timeZone, sourceOffsetMinutes);
  const relation = range ? "between" : detectRelation(normalized);
  const startTime = range?.start || time.time;
  const endTime = range?.end;
  const localDateTime = makeLocalDateTime(dateExpression.date, startTime);
  const instant = sourceOffsetMinutes === null
    ? resolveLocalDateTime(localDateTime, zone.timeZone)
    : resolveFixedOffsetDateTime(localDateTime, sourceOffsetMinutes);
  let endInstant = endTime
    ? (sourceOffsetMinutes === null
      ? resolveLocalDateTime(makeLocalDateTime(dateExpression.date, endTime), zone.timeZone)
      : resolveFixedOffsetDateTime(makeLocalDateTime(dateExpression.date, endTime), sourceOffsetMinutes))
    : null;
  if (endInstant && endInstant <= instant) {
    const nextDateTime = makeLocalDateTime(addDaysToDateParts(dateExpression.date, 1), endTime);
    endInstant = sourceOffsetMinutes === null
      ? resolveLocalDateTime(nextDateTime, zone.timeZone)
      : resolveFixedOffsetDateTime(nextDateTime, sourceOffsetMinutes);
  }

  const assumptions = [];
  if (!zone.explicit) assumptions.push(`未写明源时区，使用默认源时区 ${defaultSourceTimeZone}`);
  if (dateExpression.assumed) assumptions.push("未写明日期，按源时区今天计算");
  if (relation === "by") assumptions.push("by 按“不晚于该时间”显示");
  if (relation === "before") assumptions.push("before 按“该时间之前”显示");

  const result = {
    ok: true,
    rawText: text,
    sourceTimeZone: sourceOffsetMinutes === null ? zone.timeZone : formatFixedOffsetName(sourceOffsetMinutes),
    sourceTimeZoneName: sourceOffsetMinutes === null
      ? formatTimeZoneName(instant, zone.timeZone)
      : formatFixedOffsetName(sourceOffsetMinutes),
    targetTimeZone,
    dateExpression: dateExpression.expression,
    timeExpression: time?.text || `${formatClock(startTime)}–${formatClock(endTime)}`,
    relation,
    localDateTime,
    instant: instant.toISOString(),
    endInstant: endInstant?.toISOString() || null,
    displayText: displayForRelation(relation, instant, endInstant, targetTimeZone),
    assumptions,
    confidence: zone.explicit && !dateExpression.assumed ? 0.98 : 0.86,
  };

  return result;
}

export const parserInternals = {
  detectTimeZone,
  parseStandardDateTime,
  parseDateExpression,
  parseTimeAt,
  detectRelation,
  parseStructuredClock,
};
