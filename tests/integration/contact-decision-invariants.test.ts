import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { RELATIONSHIP_CONTACT_PURPOSE } from "@/domain/contact-decision/contact-decision";
import {
  evaluateContactDecisionsForCustomerWithContext,
} from "@/services/contact-decision-service";
import {
  refreshJourneyEventsForCustomerWithContext,
  snoozeOpportunityWithContext,
} from "@/services/journey-opportunity-service";
import { cleanDatabase, createActor } from "./helpers";

const d = (value: string) => new Date(`${value}T12:00:00Z`);
let seq = 0;

async function fixture(label: string, birthDate: string) {
  const actor = await createActor("SELLER", label);
  seq += 1;
  const normalized = `559197${String(seq).padStart(7, "0")}`;
  const customer = await prisma.customer.create({ data: {
    organizationId: actor.organizationId,
    responsibleMembershipId: actor.membershipId,
    name: `Cliente ${label}`,
    source: "WHATSAPP",
    status: "CUSTOMER",
    whatsapp: `+${normalized}`,
    whatsappNormalized: normalized,
  } });
  const child = await prisma.child.create({ data: { customerId: customer.id, name: `Criança ${label}`, birthDate: d(birthDate) } });
  await prisma.consent.create({ data: {
    customerId: customer.id,
    channel: "WHATSAPP",
    purpose: RELATIONSHIP_CONTACT_PURPOSE,
    status: "GRANTED",
    capturedAt: d("2026-09-01"),
  } });
  await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
  return { actor, customer, child };
}

beforeEach(async () => {
  seq = 0;
  await cleanDatabase();
});

describe("ContactDecision transitions and PostgreSQL invariants", () => {
  it("moves future WAIT to PROCEED when recommendedAt is reached", async () => {
    const { actor, customer, child } = await fixture("future-transition", "2026-03-19");
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_6_MONTHS" } } });
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    expect(await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } })).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_NOT_READY" });

    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-19"));
    expect(await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } })).toMatchObject({ status: "PROCEED", primaryReasonCode: "CONTACT_PREPARATION_ALLOWED" });
  });

  it("keeps SNOOZED as WAIT until Opportunity reopens, then evaluates normally", async () => {
    const { actor, customer, child } = await fixture("snooze-transition", "2026-06-09");
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_3_MONTHS" } } });
    await snoozeOpportunityWithContext(actor, opportunity.id, 7, d("2026-09-09"));
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    expect(await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } })).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_SNOOZED" });

    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-16"));
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe("OPEN");
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-16"));
    expect((await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } })).status).toBe("PROCEED");
  });

  it("enforces one decision per Opportunity, WHATSAPP-only and suppression CHECK constraints", async () => {
    const { actor, customer, child } = await fixture("checks", "2026-06-09");
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_3_MONTHS" } } });
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const existing = await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });

    await expect(prisma.contactDecision.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      opportunityId: opportunity.id,
      status: "PROCEED",
      channel: "WHATSAPP",
      evaluatedAt: d("2026-09-09"),
      primaryReasonCode: "CONTACT_PREPARATION_ALLOWED",
      reasonsJson: {},
      policyVersion: 1,
    } })).rejects.toBeTruthy();

    await prisma.contactDecision.delete({ where: { id: existing.id } });
    await expect(prisma.contactDecision.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      opportunityId: opportunity.id,
      status: "PROCEED",
      channel: "EMAIL",
      evaluatedAt: d("2026-09-09"),
      primaryReasonCode: "CONTACT_PREPARATION_ALLOWED",
      reasonsJson: {},
      policyVersion: 1,
    } })).rejects.toBeTruthy();

    await expect(prisma.contactDecision.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      opportunityId: opportunity.id,
      status: "SUPPRESSED",
      channel: "WHATSAPP",
      evaluatedAt: d("2026-09-09"),
      primaryReasonCode: "HIGHER_PRIORITY_OPPORTUNITY",
      reasonsJson: {},
      suppressedByOpportunityId: null,
      policyVersion: 1,
    } })).rejects.toBeTruthy();
  });

  it("rejects a suppression reference to the same Opportunity", async () => {
    const { actor, customer, child } = await fixture("self-suppression", "2026-06-09");
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_3_MONTHS" } } });
    await expect(prisma.contactDecision.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      opportunityId: opportunity.id,
      status: "SUPPRESSED",
      channel: "WHATSAPP",
      evaluatedAt: d("2026-09-09"),
      primaryReasonCode: "HIGHER_PRIORITY_OPPORTUNITY",
      reasonsJson: {},
      suppressedByOpportunityId: opportunity.id,
      policyVersion: 1,
    } })).rejects.toBeTruthy();
  });
});
