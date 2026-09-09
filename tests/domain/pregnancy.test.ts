import { describe, expect, it } from "vitest";
import { calculatePregnancyEstimate } from "@/domain/pregnancy/pregnancy";
import { parseDateOnly } from "@/domain/shared/date-only";

describe("pregnancy lifecycle estimates", () => {
  const today = parseDateOnly("2026-09-09");

  it("keeps a future DPP as an estimate", () => {
    const result = calculatePregnancyEstimate(parseDateOnly("2026-10-09"), today);
    expect(result.daysUntilDueDate).toBe(30);
    expect(result.dueDatePassed).toBe(false);
    expect(result.isEstimate).toBe(true);
  });

  it("treats DPP today as próximo ao parto without confirming birth", () => {
    const result = calculatePregnancyEstimate(parseDateOnly("2026-09-09"), today);
    expect(result.daysUntilDueDate).toBe(0);
    expect(result.stage).toBe("Próximo ao parto");
    expect(result.dueDatePassed).toBe(false);
  });

  it("moves a passed DPP to aguardando atualização", () => {
    const result = calculatePregnancyEstimate(parseDateOnly("2026-09-08"), today);
    expect(result.daysUntilDueDate).toBe(-1);
    expect(result.dueDatePassed).toBe(true);
    expect(result.stage).toBe("Aguardando atualização");
  });

  it("calculates commercial week and month deterministically", () => {
    const result = calculatePregnancyEstimate(parseDateOnly("2026-12-16"), today);
    expect(result.estimatedWeek).toBe(26);
    expect(result.estimatedMonth).toBe(6);
    expect(result.stage).toBe("6º mês");
  });
});
