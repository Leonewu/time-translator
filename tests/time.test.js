import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBeijingDateTime,
  formatFixedOffsetName,
  getZonedDateParts,
  normalizeTimeZone,
  resolveFixedOffsetDateTime,
  resolveLocalDateTime,
  formatTimeZoneName,
} from "../src/shared/time.js";

const reference = new Date("2026-08-20T10:00:00.000Z");

test("IANA 时区会被规范化，缩写和 UTC+n 不会伪装成时区", () => {
  assert.equal(normalizeTimeZone("europe/london"), "Europe/London");
  assert.equal(normalizeTimeZone("US/Eastern"), "America/New_York");
  assert.equal(
    normalizeTimeZone("america/argentina/buenos_aires"),
    normalizeTimeZone("America/Argentina/Buenos_Aires"),
  );
  assert.equal(normalizeTimeZone("Etc/UTC"), "UTC");
  assert.equal(normalizeTimeZone("CST"), null);
  assert.equal(normalizeTimeZone("UTC+08:00"), null);
});

test("固定 UTC 偏移量可以换算且不引入夏令时规则", () => {
  const instant = resolveFixedOffsetDateTime(
    { year: 2026, month: 8, day: 20, hour: 15, minute: 0 },
    -420,
  );

  assert.equal(instant.toISOString(), "2026-08-20T22:00:00.000Z");
  assert.equal(formatBeijingDateTime(instant), "2026/08/21（周五）06:00");
  assert.equal(formatFixedOffsetName(-420), "UTC-07:00");
});

test("英国夏令时 15:00 转成北京时间当天 22:00", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 8, day: 20, hour: 15, minute: 0 },
    "Europe/London",
  );

  assert.equal(formatBeijingDateTime(instant), "2026/08/20（周四）22:00");
});

test("英国冬令时 15:00 转成北京时间当天 23:00", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 1, day: 20, hour: 15, minute: 0 },
    "Europe/London",
  );

  assert.equal(formatBeijingDateTime(instant), "2026/01/20（周二）23:00");
});

test("英国时间转换可以跨到北京时间次日", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 8, day: 20, hour: 23, minute: 30 },
    "Europe/London",
  );

  assert.equal(formatBeijingDateTime(instant), "2026/08/21（周五）06:30");
});

test("today 使用源时区的当地日期", () => {
  const parts = getZonedDateParts(reference, "Europe/London");
  assert.deepEqual(parts, {
    year: 2026,
    month: 8,
    day: 20,
    hour: 11,
    minute: 0,
    second: 0,
  });
});

test("输出时区名称能说明英国当前是 BST", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 8, day: 20, hour: 15, minute: 0 },
    "Europe/London",
  );

  assert.equal(formatTimeZoneName(instant, "Europe/London"), "BST");
});

test("夏令时切换日的不存在时间会顺延到有效时间", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
    "Europe/London",
  );

  assert.equal(formatBeijingDateTime(instant), "2026/03/29（周日）09:30");
});

test("冬令时回拨的重复时间选择较早的一次", () => {
  const instant = resolveLocalDateTime(
    { year: 2026, month: 10, day: 25, hour: 1, minute: 30 },
    "Europe/London",
  );

  assert.equal(instant.toISOString(), "2026-10-25T00:30:00.000Z");
});
