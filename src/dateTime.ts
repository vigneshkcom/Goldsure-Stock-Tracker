export const BUSINESS_TIME_ZONE = "Australia/Sydney";

type BusinessDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

export function businessDateParts(date: Date): BusinessDateParts {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

export function businessDateValue(date = new Date()) {
  const { year, month, day } = businessDateParts(date);
  return `${year}-${month}-${day}`;
}

export function businessDottedDate(date = new Date()) {
  const { year, month, day } = businessDateParts(date);
  return `${day}.${month}.${year}`;
}

// Excel has no timezone-aware datetime cell. Store the Sydney wall-clock parts
// as UTC components so Excel consistently displays the intended local time.
export function businessWallClockDate(date: Date) {
  const { year, month, day, hour, minute, second } = businessDateParts(date);
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

// Calendar-only values are handled in UTC so week arithmetic never shifts a day.
export function dateOnlyDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function dateOnlyValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatDateOnly(value: string, includeWeekday = false) {
  const date = dateOnlyDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", {
    timeZone: BUSINESS_TIME_ZONE,
    ...(includeWeekday ? { weekday: "short" as const } : {}),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
