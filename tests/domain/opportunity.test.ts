import { describe, expect, it } from "vitest";
import { customerAllowsActionableOpportunity, getOpportunityDefinition, priorityForOpportunity, scoreOpportunity } from "@/domain/opportunity/opportunity";

const d = (value: string) => new Date(`${value}T12:00:00Z`);

describe("opportunity domain", () => {
  it("maps events to explicit PT-BR reasons and safe suggested actions", () => {
    expect(getOpportunityDefinition("PREGNANCY_MONTH_6")).toEqual({
      reasonCode: "PREGNANCY_MONTH_6",
      reasonLabel: "Cliente entrou no 6º mês de gestação",
      suggestedAction: "Revisar necessidades para esta fase",
    });
    expect(getOpportunityDefinition("PREGNANCY_UPDATE_REQUIRED").suggestedAction).toBe("Atualizar o momento atual da cliente");
    expect(getOpportunityDefinition("PREGNANCY_UPDATE_REQUIRED").reasonLabel).not.toMatch(/parab|nascido|bebê nasceu/i);
  });

  it("scores identical inputs identically and explains every factor", () => {
    const input = { type: "CHILD_3_MONTHS" as const, source: "CHILD" as const, recommendedAt: d("2026-09-09"), informationUpdatedAt: d("2026-08-30"), customerStatus: "RECURRING" as const, asOf: d("2026-09-09") };
    const first = scoreOpportunity(input);
    const second = scoreOpportunity(input);
    expect(first).toEqual(second);
    expect(first.score).toBe(97);
    expect(first.factors.map((factor) => factor.label)).toEqual(["Momento ideal", "Jornada atualizada", "Marco baseado em data de nascimento confirmada", "Status do relacionamento"]);
  });

  it("reduces freshness points for stale journey information", () => {
    const fresh = scoreOpportunity({ type: "PREGNANCY_MONTH_6", source: "PREGNANCY", recommendedAt: d("2026-09-09"), informationUpdatedAt: d("2026-09-01"), customerStatus: "CUSTOMER", asOf: d("2026-09-09") });
    const stale = scoreOpportunity({ type: "PREGNANCY_MONTH_6", source: "PREGNANCY", recommendedAt: d("2026-09-09"), informationUpdatedAt: d("2025-01-01"), customerStatus: "CUSTOMER", asOf: d("2026-09-09") });
    expect(fresh.score).toBeGreaterThan(stale.score);
  });

  it("derives priority deterministically", () => {
    expect(priorityForOpportunity("CHILD_3_MONTHS", 92)).toBe("URGENT");
    expect(priorityForOpportunity("CHILD_3_MONTHS", 75)).toBe("HIGH");
    expect(priorityForOpportunity("DPP_MINUS_15", 40)).toBe("HIGH");
    expect(priorityForOpportunity("PREGNANCY_UPDATE_REQUIRED", 40)).toBe("HIGH");
  });

  it("blocks ordinary actionable opportunities for do-not-contact and archived customers", () => {
    expect(customerAllowsActionableOpportunity("DO_NOT_CONTACT")).toBe(false);
    expect(customerAllowsActionableOpportunity("ARCHIVED")).toBe(false);
    expect(customerAllowsActionableOpportunity("INACTIVE")).toBe(true);
  });
});
