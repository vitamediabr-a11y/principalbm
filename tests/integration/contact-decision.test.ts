import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";
import {
  RELATIONSHIP_CONTACT_PURPOSE,
} from "@/domain/contact-decision/contact-decision";
import {
  evaluateContactDecisionsForCustomerWithContext,
  getContactDecisionWithContext,
  getContactReadinessSnapshotWithContext,
  listContactDecisionsForOpportunitiesWithContext,
  listContactDecisionsWithContext,
  refreshContactDecisionsForOrganizationWithContext,
} from "@/services/contact-decision-service";
import {
  dismissOpportunityWithContext,
  listOpportunitiesWithContext,
  refreshJourneyEventsForCustomerWithContext,
  snoozeOpportunityWithContext,
} from "@/services/journey-opportunity-service";
import { getCustomer360WithContext } from "@/services/customer-service";
import { cleanDatabase, createActor } from "./helpers";

const d = (value: string) => new Date(`${value}T12:00:00Z`);
let contactCounter = 0;

function whatsapp() {
  contactCounter += 1;
  return `559198${String(contactCounter).padStart(7, "0")}`;
}

async function createCurrentChildOpportunity(
  context: Awaited<ReturnType<typeof createActor>>,
  label: string,
  options: { whatsappAvailable?: boolean; status?: "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED" } = {},
) {
  const normalized = options.whatsappAvailable === false ? null : whatsapp();
  const customer = await prisma.customer.create({
    data: {
      organizationId: context.organizationId,
      responsibleMembershipId: context.membershipId,
      name: `Cliente decisão ${label}`,
      source: "WHATSAPP",
      status: options.status ?? "CUSTOMER",
      whatsapp: normalized ? `+${normalized}` : null,
      whatsappNormalized: normalized,
    },
  });
  const child = await prisma.child.create({
    data: { customerId: customer.id, name: `Criança ${label}`, birthDate: d("2026-06-09") },
  });
  await refreshJourneyEventsForCustomerWithContext(context, customer.id, d("2026-09-09"));
  const opportunity = await prisma.opportunity.findFirstOrThrow({
    where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_3_MONTHS" } },
  });
  return { customer, child, opportunity };
}

async function createFutureChildOpportunity(
  context: Awaited<ReturnType<typeof createActor>>,
  label: string,
) {
  const normalized = whatsapp();
  const customer = await prisma.customer.create({
    data: {
      organizationId: context.organizationId,
      responsibleMembershipId: context.membershipId,
      name: `Cliente futuro ${label}`,
      source: "WHATSAPP",
      status: "CUSTOMER",
      whatsapp: `+${normalized}`,
      whatsappNormalized: normalized,
    },
  });
  const child = await prisma.child.create({ data: { customerId: customer.id, name: `Futuro ${label}`, birthDate: d("2026-03-19") } });
  await refreshJourneyEventsForCustomerWithContext(context, customer.id, d("2026-09-09"));
  const opportunity = await prisma.opportunity.findFirstOrThrow({
    where: { customerId: customer.id, journeyEvent: { childId: child.id, type: "CHILD_6_MONTHS" } },
  });
  expect(opportunity.recommendedAt.toISOString().slice(0, 10)).toBe("2026-09-19");
  return { customer, child, opportunity };
}

async function addConsent(
  customerId: string,
  status: "GRANTED" | "REVOKED",
  capturedAt: string,
  options: { channel?: "WHATSAPP" | "EMAIL"; purpose?: string } = {},
) {
  return prisma.consent.create({
    data: {
      customerId,
      channel: options.channel ?? "WHATSAPP",
      purpose: options.purpose ?? RELATIONSHIP_CONTACT_PURPOSE,
      status,
      capturedAt: d(capturedAt),
      source: "integration-test",
      version: "1",
    },
  });
}

async function decisionFor(context: Awaited<ReturnType<typeof createActor>>, customerId: string, opportunityId: string) {
  await evaluateContactDecisionsForCustomerWithContext(context, customerId, d("2026-09-09"));
  return prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId } });
}

beforeEach(async () => {
  contactCounter = 0;
  await cleanDatabase();
});

describe("Opportunity → Contact Decision PostgreSQL slice", () => {
  it("resolves latest WhatsApp consent history deterministically and audits meaningful transitions", async () => {
    const actor = await createActor("SELLER", "consent-history");
    const { customer, opportunity } = await createCurrentChildOpportunity(actor, "consent");

    const initial = await decisionFor(actor, customer.id, opportunity.id);
    expect(initial).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_CONSENT_MISSING" });

    await addConsent(customer.id, "GRANTED", "2026-09-01");
    const granted = await decisionFor(actor, customer.id, opportunity.id);
    expect(granted.id).toBe(initial.id);
    expect(granted.status).toBe("PROCEED");

    await addConsent(customer.id, "REVOKED", "2026-09-02");
    const revoked = await decisionFor(actor, customer.id, opportunity.id);
    expect(revoked.id).toBe(initial.id);
    expect(revoked).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_CONSENT_REVOKED" });

    await addConsent(customer.id, "GRANTED", "2026-09-03");
    const regranted = await decisionFor(actor, customer.id, opportunity.id);
    expect(regranted.id).toBe(initial.id);
    expect(regranted.status).toBe("PROCEED");

    expect(await prisma.auditLog.count({ where: { entityId: initial.id, action: "contact_decision.created" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: initial.id, action: "contact_decision.changed" } })).toBe(3);
  });

  it("does not let EMAIL consent or an unrelated purpose authorize WhatsApp relationship outreach", async () => {
    const actor = await createActor("SELLER", "consent-scope");
    const first = await createCurrentChildOpportunity(actor, "email-only");
    await addConsent(first.customer.id, "GRANTED", "2026-09-01", { channel: "EMAIL" });
    expect(await decisionFor(actor, first.customer.id, first.opportunity.id)).toMatchObject({
      status: "BLOCKED",
      primaryReasonCode: "WHATSAPP_CONSENT_MISSING",
    });

    const second = await createCurrentChildOpportunity(actor, "other-purpose");
    await addConsent(second.customer.id, "GRANTED", "2026-09-01", { purpose: "ORDER_UPDATES" });
    expect(await decisionFor(actor, second.customer.id, second.opportunity.id)).toMatchObject({
      status: "BLOCKED",
      primaryReasonCode: "WHATSAPP_CONSENT_MISSING",
    });
  });

  it("blocks missing WhatsApp without falling back to regular phone", async () => {
    const actor = await createActor("SELLER", "missing-whatsapp");
    const { customer, opportunity } = await createCurrentChildOpportunity(actor, "missing", { whatsappAvailable: false });
    await prisma.customer.update({ where: { id: customer.id }, data: { phone: "(91) 99999-9999", phoneNormalized: "5591999999999" } });
    await addConsent(customer.id, "GRANTED", "2026-09-01");
    expect(await decisionFor(actor, customer.id, opportunity.id)).toMatchObject({ status: "BLOCKED", primaryReasonCode: "WHATSAPP_MISSING" });
  });

  it("keeps DO_NOT_CONTACT and ARCHIVED blocked even with WhatsApp and valid consent", async () => {
    const actor = await createActor("SELLER", "customer-blockers");
    for (const status of ["DO_NOT_CONTACT", "ARCHIVED"] as const) {
      const fixture = await createCurrentChildOpportunity(actor, status.toLowerCase());
      await addConsent(fixture.customer.id, "GRANTED", "2026-09-01");
      await prisma.customer.update({ where: { id: fixture.customer.id }, data: { status } });
      const decision = await decisionFor(actor, fixture.customer.id, fixture.opportunity.id);
      expect(decision.status).toBe("BLOCKED");
      expect(decision.primaryReasonCode).toBe(status === "DO_NOT_CONTACT" ? "CUSTOMER_DO_NOT_CONTACT" : "CUSTOMER_ARCHIVED");
    }
  });

  it("waits for future or snoozed opportunities and blocks inactive opportunity states", async () => {
    const actor = await createActor("SELLER", "timing");
    const future = await createFutureChildOpportunity(actor, "future");
    await addConsent(future.customer.id, "GRANTED", "2026-09-01");
    const futureDecision = await decisionFor(actor, future.customer.id, future.opportunity.id);
    expect(futureDecision).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_NOT_READY" });
    expect(futureDecision.eligibleAt?.toISOString().slice(0, 10)).toBe("2026-09-19");

    const snoozedFixture = await createCurrentChildOpportunity(actor, "snoozed");
    await addConsent(snoozedFixture.customer.id, "GRANTED", "2026-09-01");
    await snoozeOpportunityWithContext(actor, snoozedFixture.opportunity.id, 7, d("2026-09-09"));
    const snoozed = await decisionFor(actor, snoozedFixture.customer.id, snoozedFixture.opportunity.id);
    expect(snoozed).toMatchObject({ status: "WAIT", primaryReasonCode: "OPPORTUNITY_SNOOZED" });
    expect(snoozed.eligibleAt?.toISOString().slice(0, 10)).toBe("2026-09-16");

    const dismissedFixture = await createCurrentChildOpportunity(actor, "dismissed");
    await addConsent(dismissedFixture.customer.id, "GRANTED", "2026-09-01");
    await dismissOpportunityWithContext(actor, dismissedFixture.opportunity.id);
    expect(await decisionFor(actor, dismissedFixture.customer.id, dismissedFixture.opportunity.id)).toMatchObject({ status: "BLOCKED", primaryReasonCode: "OPPORTUNITY_DISMISSED" });

    const resolvedFixture = await createCurrentChildOpportunity(actor, "resolved");
    await addConsent(resolvedFixture.customer.id, "GRANTED", "2026-09-01");
    await prisma.opportunity.update({ where: { id: resolvedFixture.opportunity.id }, data: { status: "RESOLVED" } });
    expect(await decisionFor(actor, resolvedFixture.customer.id, resolvedFixture.opportunity.id)).toMatchObject({ status: "BLOCKED", primaryReasonCode: "OPPORTUNITY_RESOLVED" });
  });

  it("chooses one deterministic primary across multiple legitimate journeys and reverses suppression", async () => {
    const actor = await createActor("SELLER", "overlap");
    const normalized = whatsapp();
    const customer = await prisma.customer.create({
      data: {
        organizationId: actor.organizationId,
        responsibleMembershipId: actor.membershipId,
        name: "Cliente múltiplas oportunidades",
        source: "WHATSAPP",
        status: "RECURRING",
        whatsapp: `+${normalized}`,
        whatsappNormalized: normalized,
      },
    });
    await prisma.pregnancy.create({ data: { customerId: customer.id, expectedDueDate: d("2026-10-09"), informationUpdatedAt: d("2026-09-09") } });
    await prisma.child.create({ data: { customerId: customer.id, name: "Laura", birthDate: d("2026-06-09") } });
    await prisma.child.create({ data: { customerId: customer.id, name: "Pedro", birthDate: d("2024-09-09") } });
    await addConsent(customer.id, "GRANTED", "2026-09-01");
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));

    const decisions = await prisma.contactDecision.findMany({ where: { customerId: customer.id } });
    expect(decisions.filter((item) => item.status === "PROCEED")).toHaveLength(1);
    expect(decisions.filter((item) => item.status === "SUPPRESSED").length).toBeGreaterThanOrEqual(2);

    const competingIds = decisions.filter((item) => item.status === "PROCEED" || item.status === "SUPPRESSED").map((item) => item.opportunityId);
    const opportunities = await prisma.opportunity.findMany({ where: { id: { in: competingIds } } });
    const weight = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 } as const;
    const expectedPrimary = [...opportunities].sort((left, right) => {
      const priority = weight[right.priority] - weight[left.priority];
      if (priority) return priority;
      if (right.score !== left.score) return right.score - left.score;
      const timing = left.recommendedAt.getTime() - right.recommendedAt.getTime();
      if (timing) return timing;
      return left.id.localeCompare(right.id);
    })[0];
    const primaryDecision = decisions.find((item) => item.status === "PROCEED")!;
    expect(primaryDecision.opportunityId).toBe(expectedPrimary.id);
    expect(decisions.filter((item) => item.status === "SUPPRESSED").every((item) => item.suppressedByOpportunityId === expectedPrimary.id)).toBe(true);

    const previouslySuppressed = decisions.find((item) => item.status === "SUPPRESSED")!;
    await prisma.opportunity.update({ where: { id: expectedPrimary.id }, data: { status: "RESOLVED" } });
    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    expect((await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: expectedPrimary.id } })).status).toBe("BLOCKED");
    const recovered = await prisma.contactDecision.findMany({ where: { customerId: customer.id, status: "PROCEED" } });
    expect(recovered).toHaveLength(1);
    expect(recovered[0].opportunityId).not.toBe(expectedPrimary.id);
    expect((await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: previouslySuppressed.opportunityId } })).suppressedByOpportunityId).not.toBe(expectedPrimary.id);
  });

  it("keeps reads pure before and after explicit evaluation", async () => {
    const actor = await createActor("SELLER", "read-purity");
    const { customer, opportunity } = await createCurrentChildOpportunity(actor, "pure");
    await addConsent(customer.id, "GRANTED", "2026-09-01");

    const before = {
      decisions: await prisma.contactDecision.count(),
      audits: await prisma.auditLog.count(),
    };
    await listOpportunitiesWithContext(actor, { status: "OPEN" }, d("2026-09-09"));
    await getCustomer360WithContext(actor, customer.id);
    await listContactDecisionsWithContext(actor);
    await listContactDecisionsForOpportunitiesWithContext(actor, [opportunity.id]);
    await getContactDecisionWithContext(actor, opportunity.id);
    await getContactReadinessSnapshotWithContext(actor, customer.id);
    expect({ decisions: await prisma.contactDecision.count(), audits: await prisma.auditLog.count() }).toEqual(before);

    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const afterEvaluation = {
      decisions: await prisma.contactDecision.count(),
      audits: await prisma.auditLog.count(),
    };
    await listOpportunitiesWithContext(actor, { status: "OPEN" }, d("2026-09-09"));
    await getCustomer360WithContext(actor, customer.id);
    await listContactDecisionsWithContext(actor);
    await listContactDecisionsForOpportunitiesWithContext(actor, [opportunity.id]);
    await getContactDecisionWithContext(actor, opportunity.id);
    expect({ decisions: await prisma.contactDecision.count(), audits: await prisma.auditLog.count() }).toEqual(afterEvaluation);
  });

  it("is idempotent under repeated and concurrent identical evaluation without duplicate audit noise", async () => {
    const actor = await createActor("SELLER", "idempotency");
    const { customer, opportunity } = await createCurrentChildOpportunity(actor, "idem");
    await addConsent(customer.id, "GRANTED", "2026-09-01");

    await Promise.all([
      evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09")),
      evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09")),
      evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09")),
    ]);
    const first = await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });
    const auditCount = await prisma.auditLog.count({ where: { entityId: first.id, action: { in: ["contact_decision.created", "contact_decision.changed"] } } });
    expect(await prisma.contactDecision.count({ where: { opportunityId: opportunity.id } })).toBe(1);
    expect(auditCount).toBe(1);

    await evaluateContactDecisionsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const second = await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: opportunity.id } });
    expect(second.id).toBe(first.id);
    expect(second.status).toBe(first.status);
    expect(await prisma.auditLog.count({ where: { entityId: first.id, action: { in: ["contact_decision.created", "contact_decision.changed"] } } })).toBe(auditCount);
  });

  it("enforces tenant isolation and composite suppression integrity at PostgreSQL level", async () => {
    const actorA = await createActor("SELLER", "tenant-contact-a");
    const actorB = await createActor("SELLER", "tenant-contact-b");
    const fixtureA = await createCurrentChildOpportunity(actorA, "tenant-a");
    await addConsent(fixtureA.customer.id, "GRANTED", "2026-09-01");
    await evaluateContactDecisionsForCustomerWithContext(actorA, fixtureA.customer.id, d("2026-09-09"));

    expect(await listContactDecisionsWithContext(actorB)).toHaveLength(0);
    expect(await getContactDecisionWithContext(actorB, fixtureA.opportunity.id)).toBeNull();
    await expect(evaluateContactDecisionsForCustomerWithContext(actorB, fixtureA.customer.id, d("2026-09-09"))).rejects.toMatchObject({ status: 404 } satisfies Partial<AppError>);

    const fixtureB = await createCurrentChildOpportunity(actorA, "same-org-other-customer");
    await addConsent(fixtureB.customer.id, "GRANTED", "2026-09-01");
    await evaluateContactDecisionsForCustomerWithContext(actorA, fixtureB.customer.id, d("2026-09-09"));
    const decisionA = await prisma.contactDecision.findUniqueOrThrow({ where: { opportunityId: fixtureA.opportunity.id } });
    await expect(prisma.contactDecision.update({
      where: { id: decisionA.id },
      data: { status: "SUPPRESSED", suppressedByOpportunityId: fixtureB.opportunity.id },
    })).rejects.toBeTruthy();

    await prisma.contactDecision.delete({ where: { id: decisionA.id } });
    await expect(prisma.contactDecision.create({
      data: {
        organizationId: actorB.organizationId,
        customerId: fixtureA.customer.id,
        opportunityId: fixtureA.opportunity.id,
        status: "BLOCKED",
        channel: "WHATSAPP",
        evaluatedAt: d("2026-09-09"),
        primaryReasonCode: "WHATSAPP_CONSENT_MISSING",
        reasonsJson: {},
        policyVersion: 1,
      },
    })).rejects.toBeTruthy();
  });

  it("keeps Marketing read-only while OWNER, MANAGER and SELLER can explicitly evaluate", async () => {
    for (const role of ["OWNER", "MANAGER", "SELLER"] as const) {
      const actor = await createActor(role, `decision-${role.toLowerCase()}`);
      const fixture = await createCurrentChildOpportunity(actor, role.toLowerCase());
      await addConsent(fixture.customer.id, "GRANTED", "2026-09-01");
      await refreshContactDecisionsForOrganizationWithContext(actor, d("2026-09-09"));
      expect(await prisma.contactDecision.count({ where: { customerId: fixture.customer.id } })).toBeGreaterThan(0);
    }

    const seller = await createActor("SELLER", "marketing-parent");
    const fixture = await createCurrentChildOpportunity(seller, "marketing");
    await addConsent(fixture.customer.id, "GRANTED", "2026-09-01");
    await evaluateContactDecisionsForCustomerWithContext(seller, fixture.customer.id, d("2026-09-09"));
    const marketingUser = await prisma.user.create({ data: { name: "Marketing", email: "marketing-contact@example.test", emailVerified: true } });
    const membership = await prisma.membership.create({ data: { organizationId: seller.organizationId, userId: marketingUser.id, role: "MARKETING" } });
    const marketing = { ...seller, userId: marketingUser.id, userName: marketingUser.name, membershipId: membership.id, role: "MARKETING" as const };
    const before = { decisions: await prisma.contactDecision.count(), audits: await prisma.auditLog.count() };
    expect((await listContactDecisionsWithContext(marketing)).length).toBeGreaterThan(0);
    expect(await getContactDecisionWithContext(marketing, fixture.opportunity.id)).not.toBeNull();
    expect({ decisions: await prisma.contactDecision.count(), audits: await prisma.auditLog.count() }).toEqual(before);
    await expect(refreshContactDecisionsForOrganizationWithContext(marketing, d("2026-09-09"))).rejects.toMatchObject({ status: 403 } satisfies Partial<AppError>);
  });

  it("preserves neutral DPP safety when a passed-DPP update opportunity can proceed", async () => {
    const actor = await createActor("SELLER", "dpp-contact");
    const normalized = whatsapp();
    const customer = await prisma.customer.create({ data: {
      organizationId: actor.organizationId,
      responsibleMembershipId: actor.membershipId,
      name: "Cliente DPP sem nascimento confirmado",
      source: "WHATSAPP",
      status: "CUSTOMER",
      whatsapp: `+${normalized}`,
      whatsappNormalized: normalized,
    } });
    await prisma.pregnancy.create({ data: { customerId: customer.id, expectedDueDate: d("2026-09-01"), informationUpdatedAt: d("2026-09-09") } });
    await addConsent(customer.id, "GRANTED", "2026-09-01");
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, reasonCode: "PREGNANCY_UPDATE_REQUIRED" } });
    const decision = await decisionFor(actor, customer.id, opportunity.id);

    expect(decision.status).toBe("PROCEED");
    expect(opportunity.suggestedAction).toBe("Atualizar o momento atual da cliente");
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(0);
    const persisted = JSON.stringify({ opportunity: { reason: opportunity.reasonLabel, action: opportunity.suggestedAction }, decision: decision.reasonsJson });
    expect(persisted).not.toMatch(/parab[eé]ns|beb[eê] nasceu|rec[eé]m-nascido|como est[aá] o beb[eê]|produtos para o rec[eé]m-nascido/i);
  });
});
