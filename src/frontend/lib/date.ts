export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** First/last calendar day of the month containing `d`, as YYYY-MM-DD. */
export function monthRange(d: Date): { from: string; to: string } {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: ymd(first), to: ymd(last) };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY/MM/DD" — deterministic, locale-independent. */
export function fmtDate(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`;
}

/** "YYYY/MM/DD, h:mm AM/PM" — deterministic, no seconds. */
export function fmtDateTime(ms: number | null | undefined): string {
  if (ms == null) return "";
  const d = new Date(ms);
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 < 12 ? "AM" : "PM";
  return `${fmtDate(ms)}, ${hours12}:${p2(d.getMinutes())} ${ampm}`;
}

// --- split date + time helpers (for the Google-Calendar-style editor) ------

/** Epoch ms -> "YYYY-MM-DD" in local time. */
export function toDateInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Epoch ms -> "HH:MM" in local time. */
export function toTimeInput(ms: number): string {
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Combine a "YYYY-MM-DD" and optional "HH:MM" into epoch ms (local time). */
export function combineDateTime(date: string, time?: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0).getTime();
}

/** Local midnight (epoch ms) for a "YYYY-MM-DD". */
export function dateOnlyMs(date: string): number {
  return combineDateTime(date, "00:00");
}

