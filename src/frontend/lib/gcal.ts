// Build a "Quick add to Google Calendar" link (event TEMPLATE URL).
// https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...

const HOUR = 3_600_000;
const DAY = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

interface GcalEvent {
  title: string;
  start_at: number;
  end_at: number | null;
  all_day?: number | boolean | null;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}

function stampUtc(ms: number): string {
  const d = new Date(ms);
  return (
    `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}` +
    `T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`
  );
}

function stampDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
}

export function googleCalendarUrl(e: GcalEvent): string {
  const allDay = !!e.all_day;
  const start = e.start_at;
  const end = e.end_at ?? start + (allDay ? DAY : HOUR);

  const dates = allDay
    ? // Google treats the all-day end date as exclusive.
      `${stampDate(start)}/${stampDate(end + (end <= start ? DAY : 0))}`
    : `${stampUtc(start)}/${stampUtc(end <= start ? start + HOUR : end)}`;

  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });

  const details = [e.description?.trim(), e.url?.trim()].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (e.location?.trim()) params.set("location", e.location.trim());

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
