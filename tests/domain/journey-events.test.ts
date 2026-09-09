import { describe, expect, it } from "vitest";
import {
  addCalendarMonthsClamped,
  buildJourneyEventDedupeKey,
  classifyJourneyEventStatus,
  deriveChildEventCandidates,
  derivePregnancyEventCandidates,
} from "@/domain/journey-event/rules";

const d = (value: string) => new Date(`${value}T12:00:00Z`);

function pregnancy(overrides: Partial<Parameters<typeof derivePregnancyEventCandidates>[0]> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    expectedDueDate: d("2026-10-10"),
    status: "ACTIVE" as const,
    confirmedBirthDate: null,
    informationUpdatedAt: d("2026-09-01"),
    ...overrides,
  };
}

describe("journey event rules", () => {
  it("derives deterministic pregnancy month and DPP boundaries", () => {
    const events = derivePregnancyEventCandidates(pregnancy(), d("2026-09-09"));
    const byType = Object.fromEntries(events.map((event) => [event.type, event.effectiveAt.toISOString().slice(0, 10)]));
    expect(byType).toMatchObject({
      PREGNANCY_MONTH_5: "2026-05-09",
      PREGNANCY_MONTH_6: "2026-06-13",
      PREGNANCY_MONTH_7: "2026-07-18",
      PREGNANCY_MONTH_8: "2026-08-15",
      DPP_MINUS_60: "2026-08-11",
      DPP_MINUS_30: "2026-09-10",
      DPP_MINUS_15: "2026-09-25",
    });
    expect(byType.PREGNANCY_UPDATE_REQUIRED).toBeUndefined();
  });

  it("creates only a neutral update-required signal after DPP and never infers birth", () => {
    const events = derivePregnancyEventCandidates(pregnancy(), d("2026-10-12"));
    const update = events.find((event) => event.type === "PREGNANCY_UPDATE_REQUIRED");
    expect(update?.effectiveAt.toISOString().slice(0, 10)).toBe("2026-10-11");
    expect(events.some((event) => String(event.type).includes("BIRTH"))).toBe(false);
  });

  it("stops pregnancy rules after explicit birth confirmation", () => {
    expect(derivePregnancyEventCandidates(pregnancy({ status: "COMPLETED", confirmedBirthDate: d("2026-10-03") }), d("2026-10-12"))).toEqual([]);
  });

  it("derives child milestones from the actual birth date with month-end clamping", () => {
    const events = deriveChildEventCandidates({ id: "22222222-2222-4222-8222-222222222222", birthDate: d("2026-01-31"), updatedAt: d("2026-02-01") });
    const byType = Object.fromEntries(events.map((event) => [event.type, event.effectiveAt.toISOString().slice(0, 10)]));
    expect(byType).toEqual({
      CHILD_30_DAYS: "2026-03-02",
      CHILD_3_MONTHS: "2026-04-30",
      CHILD_6_MONTHS: "2026-07-31",
      CHILD_9_MONTHS: "2026-10-31",
      CHILD_12_MONTHS: "2027-01-31",
      CHILD_18_MONTHS: "2027-07-31",
      CHILD_2_YEARS: "2028-01-31",
    });
    expect(addCalendarMonthsClamped(d("2024-02-29"), 24).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("classifies future, due and expired events without implying human processing", () => {
    expect(classifyJourneyEventStatus("CHILD_3_MONTHS", d("2026-09-10"), d("2026-09-09"))).toBe("UPCOMING");
    expect(classifyJourneyEventStatus("CHILD_3_MONTHS", d("2026-09-09"), d("2026-09-09"))).toBe("DUE");
    expect(classifyJourneyEventStatus("CHILD_3_MONTHS", d("2026-07-01"), d("2026-09-09"))).toBe("EXPIRED");
    expect(classifyJourneyEventStatus("PREGNANCY_UPDATE_REQUIRED", d("2026-07-01"), d("2026-09-09"))).toBe("DUE");
  });

  it("builds stable dedupe keys", () => {
    const input = { customerId: "c", source: "CHILD" as const, sourceId: "x", type: "CHILD_6_MONTHS" as const, effectiveAt: d("2026-09-09") };
    expect(buildJourneyEventDedupeKey(input)).toBe(buildJourneyEventDedupeKey(input));
  });
});
