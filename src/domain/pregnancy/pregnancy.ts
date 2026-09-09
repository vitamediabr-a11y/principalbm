import { diffCalendarDays } from "@/domain/shared/date-only";

export type PregnancyStage =
  | "1º mês"
  | "2º mês"
  | "3º mês"
  | "4º mês"
  | "5º mês"
  | "6º mês"
  | "7º mês"
  | "8º mês"
  | "9º mês"
  | "Próximo ao parto"
  | "Aguardando atualização";

const monthByWeek = (week: number) => {
  if (week <= 4) return 1;
  if (week <= 8) return 2;
  if (week <= 13) return 3;
  if (week <= 17) return 4;
  if (week <= 22) return 5;
  if (week <= 27) return 6;
  if (week <= 31) return 7;
  if (week <= 35) return 8;
  return 9;
};

export function calculatePregnancyEstimate(expectedDueDate: Date, today: Date) {
  const daysUntilDueDate = diffCalendarDays(expectedDueDate, today);
  const dueDatePassed = daysUntilDueDate < 0;
  const estimatedWeek = Math.max(1, Math.min(40, 40 - Math.ceil(daysUntilDueDate / 7)));
  const estimatedMonth = monthByWeek(estimatedWeek);
  let stage: PregnancyStage = `${estimatedMonth}º mês` as PregnancyStage;

  if (dueDatePassed) stage = "Aguardando atualização";
  else if (daysUntilDueDate <= 14) stage = "Próximo ao parto";

  return {
    daysUntilDueDate,
    dueDatePassed,
    estimatedWeek,
    estimatedMonth,
    stage,
    isEstimate: true as const,
  };
}
