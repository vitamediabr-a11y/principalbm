import { AppError } from "@/lib/app-error";
import { diffCalendarDays } from "@/domain/shared/date-only";

export type ChildStage = "RN" | "1 mês" | "2 meses" | "3 meses" | "4 meses" | "5 meses" | "6 meses" | "9 meses" | "12 meses" | "18 meses" | "2 anos" | "2+ anos";

export function ageInCompletedMonths(birthDate: Date, today: Date) {
  if (diffCalendarDays(today, birthDate) < 0) throw new AppError(422, "FUTURE_BIRTH_DATE", "A data de nascimento não pode estar no futuro.");
  let months = (today.getUTCFullYear() - birthDate.getUTCFullYear()) * 12 + (today.getUTCMonth() - birthDate.getUTCMonth());
  if (today.getUTCDate() < birthDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function formatChildAge(birthDate: Date, today: Date) {
  const days = diffCalendarDays(today, birthDate);
  if (days < 0) throw new AppError(422, "FUTURE_BIRTH_DATE", "A data de nascimento não pode estar no futuro.");
  if (days < 30) return `${days} ${days === 1 ? "dia" : "dias"}`;
  const months = ageInCompletedMonths(birthDate, today);
  if (months < 12) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (remainingMonths === 0) return `${years} ${years === 1 ? "ano" : "anos"}`;
  return `${years} ${years === 1 ? "ano" : "anos"} e ${remainingMonths} ${remainingMonths === 1 ? "mês" : "meses"}`;
}

export function getChildStage(birthDate: Date, today: Date): ChildStage {
  const days = diffCalendarDays(today, birthDate);
  if (days < 0) throw new AppError(422, "FUTURE_BIRTH_DATE", "A data de nascimento não pode estar no futuro.");
  const months = ageInCompletedMonths(birthDate, today);
  if (days < 30) return "RN";
  if (months < 2) return "1 mês";
  if (months < 3) return "2 meses";
  if (months < 4) return "3 meses";
  if (months < 5) return "4 meses";
  if (months < 6) return "5 meses";
  if (months < 9) return "6 meses";
  if (months < 12) return "9 meses";
  if (months < 18) return "12 meses";
  if (months < 24) return "18 meses";
  if (months < 36) return "2 anos";
  return "2+ anos";
}
