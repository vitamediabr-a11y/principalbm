import { diffCalendarDays } from "@/domain/shared/date-only";
import type { JourneyEventTypeCode, JourneySource } from "@/domain/journey-event/rules";

export type OpportunityPriorityCode = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type OpportunityStatusCode = "OPEN" | "SNOOZED" | "DISMISSED" | "RESOLVED";
export type CustomerStatusCode = "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED";

const definitions: Record<JourneyEventTypeCode, { reasonLabel: string; suggestedAction: string }> = {
  PREGNANCY_MONTH_5: { reasonLabel: "Cliente entrou no 5º mês de gestação", suggestedAction: "Revisar necessidades para esta fase" },
  PREGNANCY_MONTH_6: { reasonLabel: "Cliente entrou no 6º mês de gestação", suggestedAction: "Revisar necessidades para esta fase" },
  PREGNANCY_MONTH_7: { reasonLabel: "Cliente entrou no 7º mês de gestação", suggestedAction: "Revisar necessidades para esta fase" },
  PREGNANCY_MONTH_8: { reasonLabel: "Cliente entrou no 8º mês de gestação", suggestedAction: "Revisar necessidades para esta fase" },
  DPP_MINUS_60: { reasonLabel: "Faltam aproximadamente 60 dias para a DPP", suggestedAction: "Revisar se faz sentido oferecer suporte para a fase final da gestação" },
  DPP_MINUS_30: { reasonLabel: "Faltam aproximadamente 30 dias para a DPP", suggestedAction: "Revisar se faz sentido oferecer suporte para a fase final da gestação" },
  DPP_MINUS_15: { reasonLabel: "Faltam aproximadamente 15 dias para a DPP", suggestedAction: "Revisar se faz sentido oferecer suporte para a fase final da gestação" },
  PREGNANCY_UPDATE_REQUIRED: { reasonLabel: "Data prevista ultrapassada e nascimento ainda não foi confirmado", suggestedAction: "Atualizar o momento atual da cliente" },
  CHILD_30_DAYS: { reasonLabel: "Criança completou 30 dias", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_3_MONTHS: { reasonLabel: "Criança completou 3 meses", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_6_MONTHS: { reasonLabel: "Criança completou 6 meses", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_9_MONTHS: { reasonLabel: "Criança completou 9 meses", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_12_MONTHS: { reasonLabel: "Criança completou 12 meses", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_18_MONTHS: { reasonLabel: "Criança completou 18 meses", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
  CHILD_2_YEARS: { reasonLabel: "Criança completou 2 anos", suggestedAction: "Revisar tamanho atual e necessidades da próxima fase" },
};

export function getOpportunityDefinition(type: JourneyEventTypeCode) {
  return { reasonCode: type, ...definitions[type] };
}

function timingPoints(type: JourneyEventTypeCode, recommendedAt: Date, asOf: Date) {
  if (type === "PREGNANCY_UPDATE_REQUIRED") return 45;
  const daysUntil = diffCalendarDays(recommendedAt, asOf);
  if (daysUntil === 0) return 45;
  if (daysUntil > 0) {
    if (daysUntil <= 7) return 42;
    if (daysUntil <= 14) return 36;
    return 28;
  }
  const overdue = Math.abs(daysUntil);
  if (overdue <= 7) return 40;
  if (overdue <= 14) return 34;
  if (overdue <= 30) return 26;
  return 18;
}

function freshnessPoints(informationUpdatedAt: Date, asOf: Date) {
  const days = Math.max(0, diffCalendarDays(asOf, informationUpdatedAt));
  if (days <= 30) return 20;
  if (days <= 90) return 15;
  if (days <= 180) return 10;
  return 5;
}

function confidencePoints(type: JourneyEventTypeCode, source: JourneySource) {
  if (source === "CHILD") return 25;
  if (type === "PREGNANCY_UPDATE_REQUIRED") return 20;
  return 15;
}

function customerStatusPoints(status: CustomerStatusCode) {
  if (status === "VIP") return 10;
  if (status === "RECURRING") return 7;
  if (status === "CUSTOMER") return 5;
  return 0;
}

export function scoreOpportunity(input: {
  type: JourneyEventTypeCode;
  source: JourneySource;
  recommendedAt: Date;
  informationUpdatedAt: Date;
  customerStatus: CustomerStatusCode;
  asOf: Date;
}) {
  const factors = [
    { label: "Momento ideal", points: timingPoints(input.type, input.recommendedAt, input.asOf) },
    { label: "Jornada atualizada", points: freshnessPoints(input.informationUpdatedAt, input.asOf) },
    { label: input.source === "CHILD" ? "Marco baseado em data de nascimento confirmada" : "Confiança do dado de jornada", points: confidencePoints(input.type, input.source) },
    { label: "Status do relacionamento", points: customerStatusPoints(input.customerStatus) },
  ];
  const score = Math.max(0, Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0)));
  return { score, factors };
}

export function priorityForOpportunity(type: JourneyEventTypeCode, score: number): OpportunityPriorityCode {
  if (type === "PREGNANCY_UPDATE_REQUIRED" || type === "DPP_MINUS_15") return "HIGH";
  if (score >= 90) return "URGENT";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function customerAllowsActionableOpportunity(status: CustomerStatusCode) {
  return status !== "DO_NOT_CONTACT" && status !== "ARCHIVED";
}
