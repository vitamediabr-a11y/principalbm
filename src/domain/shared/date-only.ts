import { AppError } from "@/lib/app-error";

export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AppError(422, "INVALID_DATE", "Data inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(422, "INVALID_DATE", "Data inválida.");
  }
  return date;
}

export function dateOnlyFromInstant(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return parseDateOnly(`${get("year")}-${get("month")}-${get("day")}`);
}

export function diffCalendarDays(later: Date, earlier: Date) {
  const dayMs = 86_400_000;
  return Math.round((Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate()) - Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate())) / dayMs);
}

export function formatDatePtBr(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}
