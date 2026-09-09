import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/app-error";
import { ageInCompletedMonths, formatChildAge, getChildStage } from "@/domain/child/child";
import { parseDateOnly } from "@/domain/shared/date-only";

describe("child age and lifecycle", () => {
  const today = parseDateOnly("2026-09-09");
  it("formats a newborn in days and RN stage", () => {
    const birth = parseDateOnly("2026-08-25");
    expect(formatChildAge(birth, today)).toBe("15 dias");
    expect(getChildStage(birth, today)).toBe("RN");
  });
  it("handles month boundary using completed months", () => {
    expect(ageInCompletedMonths(parseDateOnly("2026-08-10"), today)).toBe(0);
    expect(ageInCompletedMonths(parseDateOnly("2026-08-09"), today)).toBe(1);
  });
  it("formats year plus months", () => {
    expect(formatChildAge(parseDateOnly("2025-05-09"), today)).toBe("1 ano e 4 meses");
  });
  it("rejects future birth dates", () => {
    expect(() => getChildStage(parseDateOnly("2026-09-10"), today)).toThrowError(AppError);
  });
});
