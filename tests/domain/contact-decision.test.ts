import { describe, expect, it } from "vitest";
import {
  evaluateBaseContactDecision,
  evaluateContactDecisionSet,
  RELATIONSHIP_CONTACT_PURPOSE,
  type ContactDecisionInput,
} from "@/domain/contact-decision/contact-decision";

const d = (value: string) => new Date(`${value}T12:00:00Z`);

function input(overrides: Partial<ContactDecisionInput> = {}): ContactDecisionInput {
  return {
    opportunityId: "11111111-1111-4111-8111-111111111111",
    opportunityStatus: "OPEN",
    priority: "HIGH",
    score: 80,
    recommendedAt: d("2026-09-09"),
    snoozedUntil: null,
    customerStatus: "CUSTOMER",
    whatsappNormalized: "5591999991111",
    consentState: "GRANTED",
    asOf: d("2026-09-09"),
    ...overrides,
  };
}

describe("contact decision domain", () => {
  it("uses one explicit internal relationship consent purpose", () => {
    expect(RELATIONSHIP_CONTACT_PURPOSE).toBe("RELATIONSHIP_OUTREACH");
  });

  it("allows progression only with current WhatsApp availability and granted consent", () => {
    expect(evaluateBaseContactDecision(input()).status).toBe("PROCEED");
    expect(evaluateBaseContactDecision(input({ whatsappNormalized: null }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_MISSING" });
    expect(evaluateBaseContactDecision(input({ consentState: "MISSING" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_CONSENT_MISSING" });
    expect(evaluateBaseContactDecision(input({ consentState: "REVOKED" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_CONSENT_REVOKED" });
  });

  it("treats do-not-contact and archived as hard blockers", () => {
    expect(evaluateBaseContactDecision(input({ customerStatus: "DO_NOT_CONTACT" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "CUSTOMER_DO_NOT_CONTACT" });
    expect(evaluateBaseContactDecision(input({ customerStatus: "ARCHIVED" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "CUSTOMER_ARCHIVED" });
  });

  it("waits for future and snoozed opportunities without implying contact", () => {
    expect(evaluateBaseContactDecision(input({ recommendedAt: d("2026-09-20") }))).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_NOT_READY" });
    expect(evaluateBaseContactDecision(input({ opportunityStatus: "SNOOZED", snoozedUntil: d("2026-09-16") }))).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_SNOOZED" });
    expect(evaluateBaseContactDecision(input({ opportunityStatus: "DISMISSED" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "OPPORTUNITY_DISMISSED" });
    expect(evaluateBaseContactDecision(input({ opportunityStatus: "RESOLVED" }))).toMatchObject({ status: "BLOCKED", primaryReasonCode: "OPPORTUNITY_RESOLVED" });
  });

  it("selects exactly one deterministic primary and suppresses other eligible opportunities", () => {
    const decisions = evaluateContactDecisionSet([
      input({ opportunityId: "00000000-0000-4000-8000-000000000003", priority: "HIGH", score: 80 }),
      input({ opportunityId: "00000000-0000-4000-8000-000000000002", priority: "URGENT", score: 70 }),
      input({ opportunityId: "00000000-0000-4000-8000-000000000001", priority: "URGENT", score: 70 }),
    ]);
    expect(decisions.filter((item) => item.status === "PROCEED")).toHaveLength(1);
    const primary = decisions.find((item) => item.status === "PROCEED")!;
    expect(primary.opportunityId).toBe("00000000-0000-4000-8000-000000000001");
    const suppressed = decisions.filter((item) => item.status === "SUPPRESSED");
    expect(suppressed).toHaveLength(2);
    expect(suppressed.every((item) => item.suppressedByOpportunityId === primary.opportunityId)).toBe(true);
  });

  it("makes suppression reversible when the previous primary stops being actionable", () => {
    const primaryId = "00000000-0000-4000-8000-000000000001";
    const secondaryId = "00000000-0000-4000-8000-000000000002";
    const first = evaluateContactDecisionSet([
      input({ opportunityId: primaryId, priority: "URGENT", score: 95 }),
      input({ opportunityId: secondaryId, priority: "HIGH", score: 85 }),
    ]);
    expect(first.find((item) => item.opportunityId === secondaryId)?.status).toBe("SUPPRESSED");

    const second = evaluateContactDecisionSet([
      input({ opportunityId: primaryId, priority: "URGENT", score: 95, opportunityStatus: "RESOLVED" }),
      input({ opportunityId: secondaryId, priority: "HIGH", score: 85 }),
    ]);
    expect(second.find((item) => item.opportunityId === primaryId)?.status).toBe("BLOCKED");
    expect(second.find((item) => item.opportunityId === secondaryId)?.status).toBe("PROCEED");
  });
});
