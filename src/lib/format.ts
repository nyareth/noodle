/** "Monday, 26 October 2026, 3:40 PM" - Moodle's default date-time format. */
export function formatDateTime(value: Date | string, timeZone: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** "8 mins 12 secs", "1 hour 5 mins" - Moodle's format_time(). */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return h ? `${plural(d, "day")} ${plural(h, "hour")}` : plural(d, "day");
  if (h) return m ? `${plural(h, "hour")} ${plural(m, "min")}` : plural(h, "hour");
  if (m) return sec ? `${plural(m, "min")} ${plural(sec, "sec")}` : plural(m, "min");
  return plural(sec, "sec");
}

export const fmt2 = (n: number) => n.toFixed(2);
/** 74 -> "74", 33.33 -> "33.33" */
export const fmtPct = (n: number) => String(Number(n.toFixed(2)));

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
