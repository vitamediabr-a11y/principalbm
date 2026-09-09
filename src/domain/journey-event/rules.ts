import { diffCalendarDays } from "@/domain/shared/date-only";

export const JOURNEY_RULE_VERSION = 1;

export const journeyEventTypes = [
  "PREGNANCY_MONTH_5",
  "PREGNANCY_MONTH_6",
  "PREGNANCY_MONTH_7",
  "PREGNANCY_MONTH_8",
  "DPP_MINUS_60",
  "DPP_MINUS_30",
  "DPP_MINUS_15",
  "PREGNANCY_UPDATE_REQUIRED",
  "CHILD_30_DAYS",
  "CHILD_3_MONTHS",
  "CHILD_6_MONTHS",
  "CHILD_9_MONTHS",
  "CHILD_12_MONTHS",
  "CHILD_18_MONTHS",
  "CHILD_2_YEARS",
] as const;

export type JourneyEventTypeCode = (typeof journeyEventTypes)[number];
export type JourneyEventStatusCode = "UPCOMING" | "DUE" | "PROCESSED" | "DISMISSED";
export type JourneySource = "PREGNANCY" | "CHILD";

export type JourneyEventCandidate = {
  type: JourneyEventTypeCode;
  effectiveAt: Date;
  source: JourneySource;
  sourceId: string;
  informationUpdatedAt: Date;
};

function utcDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addCalendarDays(date: Date, days: number) {
  const result = utcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addCalendarMonthsClamped(date: Date, months: number) {
  const source = utcDate(date);
  const targetMonthStart = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return targetMonthStart;
}

export function dateKey(date: Date) {
  return utcDate(date).toISOString().slice(0, 10);
}

export function derivePregnancyEventCandidates(
  pregnancy: {
    id: string;
    expectedDueDate: Date;
    status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
    confirmedBirthDate: Date | null;
    informationUpdatedAt: Date;
  },
  asOf: Date,
): JourneyEventCandidate[] {
  if (pregnancy.status !== "ACTIVE" || pregnancy.confirmedBirthDate) return [];

  const dueDate = utcDate(pregnancy.expectedDueDate);
  const rules: Array<[JourneyEventTypeCode, number]> = [
    ["PREGNANCY_MONTH_5", -154],
    ["PREGNANCY_MONTH_6", -119],
    ["PREGNANCY_MONTH_7", -84],
    ["PREGNANCY_MONTH_8", -56],
    ["DPP_MINUS_60", -60],
    ["DPP_MINUS_30", -30],
    ["DPP_MINUS_15", -15],
  ];
  const candidates = rules.map(([type, offset]) => ({
    type,
    effectiveAt: addCalendarDays(dueDate, offset),
    source: "PREGNANCY" as const,
    sourceId: pregnancy.id,
    informationUpdatedAt: pregnancy.informationUpdatedAt,
  }));

  if (diffCalendarDays(asOf, dueDate) > 0) {
    candidates.push({
      type: "PREGNANCY_UPDATE_REQUIRED",
      effectiveAt: addCalendarDays(dueDate, 1),
      source: "PREGNANCY",
      sourceId: pregnancy.id,
      informationUpdatedAt: pregnancy.informationUpdatedAt,
    });
  }

  return candidates;
}

export function deriveChildEventCandidates(child: {
  id: string;
  birthDate: Date;
  updatedAt: Date;
}): JourneyEventCandidate[] {
  const birthDate = utcDate(child.birthDate);
  return [
    { type: "CHILD_30_DAYS", effectiveAt: addCalendarDays(birthDate, 30) },
    { type: "CHILD_3_MONTHS", effectiveAt: addCalendarMonthsClamped(birthDate, 3) },
    { type: "CHILD_6_MONTHS", effectiveAt: addCalendarMonthsClamped(birthDate, 6) },
    { type: "CHILD_9_MONTHS", effectiveAt: addCalendarMonthsClamped(birthDate, 9) },
    { type: "CHILD_12_MONTHS", effectiveAt: addCalendarMonthsClamped(birthDate, 12) },
    { type: "CHILD_18_MONTHS", effectiveAt: addCalendarMonthsClamped(birthDate, 18) },
    { type: "CHILD_2_YEARS", effectiveAt: addCalendarMonthsClamped(birthDate, 24) },
  ].map((candidate) => ({
    ...candidate,
    source: "CHILD" as const,
    sourceId: child.id,
    informationUpdatedAt: child.updatedAt,
  }));
}

export function classifyJourneyEventStatus(
  type: JourneyEventTypeCode,
  effectiveAt: Date,
  asOf: Date,
): JourneyEventStatusCode {
  const daysPast = diffCalendarDays(asOf, effectiveAt);
  if (daysPast < 0) return "UPCOMING";
  if (type === "PREGNANCY_UPDATE_REQUIRED") return "DUE";
  if (daysPast <= 45) return "DUE";
  return "PROCESSED";
}

export function isOpportunityActionable(
  type: JourneyEventTypeCode,
  status: JourneyEventStatusCode,
  effectiveAt: Date,
  asOf: Date,
) {
  if (type === "PREGNANCY_UPDATE_REQUIRED") return status === "DUE";
  if (status === "DUE") return true;
  return status === "UPCOMING" && diffCalendarDays(effectiveAt, asOf) <= 30;
}

export function buildJourneyEventDedupeKey(input: {
  customerId: string;
  source: JourneySource;
  sourceId: string;
  type: JourneyEventTypeCode;
  effectiveAt: Date;
  ruleVersion?: number;
}) {
  return `v${input.ruleVersion ?? JOURNEY_RULE_VERSION}:${input.customerId}:${input.source}:${input.sourceId}:${input.type}:${dateKey(input.effectiveAt)}`;
}
