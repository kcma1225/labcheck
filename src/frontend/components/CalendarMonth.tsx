import type { CalendarEvent } from "../../shared/types";
import { ymd } from "../lib/date";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;
const MAX_LANES = 4;

/** Fallback colors when an event has no custom color. */
export const TYPE_HEX: Record<string, string> = {
  meeting: "#3b82f6",
  deadline: "#ef4444",
  milestone: "#8b5cf6",
  event: "#64748b",
};

export function eventColor(e: Pick<CalendarEvent, "color" | "type">): string {
  return e.color ?? TYPE_HEX[e.type] ?? TYPE_HEX.event;
}

interface Props {
  month: Date;
  events: CalendarEvent[];
  onDayClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

function midnight(d: Date | number): number {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}

/** Local-midnight ms of the last calendar day an event still covers. */
function lastCoveredMs(ev: CalendarEvent): number {
  const rawEnd = ev.end_at ?? ev.start_at;
  // For timed events, an end at exactly 00:00 belongs to the previous day.
  const end = ev.all_day ? rawEnd : Math.max(ev.start_at, rawEnd - 1);
  return midnight(end);
}

function isMultiDay(ev: CalendarEvent): boolean {
  return lastCoveredMs(ev) > midnight(ev.start_at);
}

interface Bar {
  event: CalendarEvent;
  colStart: number;
  colEnd: number;
  lane: number;
  startsHere: boolean;
  endsHere: boolean;
}

export function CalendarMonth({ month, events, onDayClick, onEventClick }: Props) {
  const m = month.getMonth();
  const clickable = !!onDayClick;
  const todayKey = ymd(new Date());

  // Whole-month grid, padded out to full weeks with adjacent-month days.
  const first = new Date(month.getFullYear(), m, 1);
  const last = new Date(month.getFullYear(), m + 1, 0);
  const weeks: Date[][] = [];
  const cur = new Date(month.getFullYear(), m, 1 - first.getDay());
  const stopMs = midnight(last) + (6 - last.getDay()) * DAY_MS;
  while (midnight(cur) <= stopMs) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Multi-day / all-day events first so their bars sit on the top lanes and
  // line up across week rows.
  const sorted = [...events].sort((a, b) => {
    const rank = (e: CalendarEvent) => (e.all_day || isMultiDay(e) ? 0 : 1);
    return rank(a) - rank(b) || a.start_at - b.start_at;
  });

  return (
    <div className="max-w-full overflow-x-auto" role="region" aria-label="Calendar — scroll horizontally on small screens" tabIndex={0}>
    <div className="calendar-grid min-w-[35rem] overflow-hidden rounded-lg border border-gray-200 bg-white text-xs">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="p-2 text-center font-medium text-gray-500">
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const weekStartMs = midnight(week[0]);
        const weekEndMs = weekStartMs + 7 * DAY_MS;

        const inWeek = sorted.filter(
          (ev) => ev.start_at < weekEndMs && lastCoveredMs(ev) >= weekStartMs,
        );

        const laneEnd: number[] = [];
        const bars: Bar[] = [];
        const overflow = new Array(7).fill(0);

        for (const ev of inWeek) {
          const sMid = midnight(ev.start_at);
          const eMid = lastCoveredMs(ev);
          const colStart = Math.max(0, Math.round((sMid - weekStartMs) / DAY_MS));
          const colEnd = Math.min(6, Math.round((eMid - weekStartMs) / DAY_MS));

          let lane = laneEnd.findIndex((end) => end < colStart);
          if (lane === -1) {
            lane = laneEnd.length;
            laneEnd.push(colEnd);
          } else {
            laneEnd[lane] = colEnd;
          }

          if (lane >= MAX_LANES) {
            for (let c = colStart; c <= colEnd; c++) overflow[c]++;
            continue;
          }
          bars.push({
            event: ev,
            colStart,
            colEnd,
            lane,
            startsHere: sMid >= weekStartMs,
            endsHere: eMid < weekEndMs,
          });
        }

        const laneCount = Math.max(1, Math.min(MAX_LANES, laneEnd.length));
        const hasOverflow = overflow.some((n) => n > 0);
        const laneRows = laneCount + (hasOverflow ? 1 : 0);

        return (
          <div
            key={wi}
            className="grid min-h-[6.5rem] grid-cols-7 border-b border-gray-200 last:border-b-0"
            style={{ gridTemplateRows: `1.75rem repeat(${laneRows}, var(--calendar-lane-height, 1.25rem)) 1fr` }}
          >
            {/* full-height clickable day backgrounds */}
            {week.map((date, di) => (
              <div
                key={`bg${di}`}
                onClick={clickable ? () => onDayClick!(date) : undefined}
                style={{ gridColumn: di + 1, gridRow: "1 / -1" }}
                className={`border-r border-gray-100 last:border-r-0 ${
                  date.getMonth() === m ? "bg-white" : "bg-gray-50/60"
                } ${clickable ? "cursor-pointer hover:bg-gray-50" : ""}`}
              />
            ))}

            {/* day numbers */}
            {week.map((date, di) => {
              const key = ymd(date);
              return (
                <div
                  key={`n${di}`}
                  style={{ gridColumn: di + 1, gridRow: 1 }}
                  className="pointer-events-none z-10 flex justify-end p-1"
                >
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 ${
                      key === todayKey
                        ? "bg-gray-900 font-semibold text-white"
                        : date.getMonth() === m
                          ? "text-gray-500"
                          : "text-gray-300"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>
              );
            })}

            {/* event bars — one continuous bar per week the event spans */}
            {bars.map((bar) => {
              const ev = bar.event;
              return (
                <button
                  key={ev.id}
                  type="button"
                  title={ev.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(ev);
                  }}
                  style={{
                    gridColumn: `${bar.colStart + 1} / ${bar.colEnd + 2}`,
                    gridRow: bar.lane + 2,
                    backgroundColor: eventColor(ev),
                  }}
                  className={`z-10 mx-1 flex items-center gap-1 self-center overflow-hidden whitespace-nowrap px-1 text-left text-[11px] leading-5 text-onscrim ${
                    bar.startsHere ? "rounded-l" : ""
                  } ${bar.endsHere ? "rounded-r" : ""}`}
                >
                  {!bar.startsHere && <span aria-hidden>‹</span>}
                  {bar.startsHere && !ev.all_day && (
                    <span className="shrink-0 opacity-80">{timeLabel(ev.start_at)}</span>
                  )}
                  <span className="truncate">{ev.title}</span>
                  {!bar.endsHere && (
                    <span className="ml-auto shrink-0" aria-hidden>
                      ›
                    </span>
                  )}
                </button>
              );
            })}

            {/* per-day "+N more" when a day has more overlapping events than lanes */}
            {hasOverflow &&
              overflow.map((n, di) =>
                n > 0 ? (
                  <button
                    key={`o${di}`}
                    type="button"
                    onClick={clickable ? () => onDayClick!(week[di]) : undefined}
                    style={{ gridColumn: di + 1, gridRow: laneCount + 2 }}
                    className="z-10 px-1 text-left text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    +{n} more
                  </button>
                ) : null,
              )}
          </div>
        );
      })}
    </div>
    </div>
  );
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
