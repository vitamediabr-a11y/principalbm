import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";
import {
  dismissOpportunityWithContext,
  getNextCustomerOpportunityWithContext,
  listCustomerJourneyEventsWithContext,
  listCustomerOpportunitiesWithContext,
  listOpportunitiesWithContext,
  refreshJourneyEventsForCustomerWithContext,
  refreshJourneyEventsForOrganizationWithContext,
  snoozeOpportunityWithContext,
} from "@/services/journey-opportunity-service";
import { cleanDatabase, createActor } from "./helpers";

const d = (value: string) => new Date(`${value}T12:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);

async function customerWithPregnancy(
  context: Awaited<ReturnType<typeof createActor>>,
  options: {
    status?: "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED";
    dueDate?: string;
  } = {},
) {
  const customer = await prisma.customer.create({
    data: {
      organizationId: context.organizationId,
      responsibleMembershipId: context.membershipId,
      name: `Cliente ${context.organizationId.slice(0, 8)}`,
      source: "PHYSICAL_STORE",
      status: options.status ?? "CUSTOMER",
    },
  });
  const pregnancy = await prisma.pregnancy.create({
    data: {
      customerId: customer.id,
      expectedDueDate: d(options.dueDate ?? "2027-01-03"),
      informationUpdatedAt: d("2026-09-01"),
    },
  });
  return { customer, pregnancy };
}

beforeEach(cleanDatabase);

describe("journey event → opportunity PostgreSQL slice", () => {
  it("persists a pregnancy milestone and its deterministic opportunity", async () => {
    const actor = await createActor("SELLER", "pregnancy-event");
    const { customer, pregnancy } = await customerWithPregnancy(actor);
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));

    const event = await prisma.journeyEvent.findFirstOrThrow({
      where: { customerId: customer.id, pregnancyId: pregnancy.id, type: "PREGNANCY_MONTH_6" },
    });
    expect(event.status).toBe("DUE");
    const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { journeyEventId: event.id } });
    expect(opportunity).toMatchObject({
      customerId: customer.id,
      reasonCode: "PREGNANCY_MONTH_6",
      reasonLabel: "Cliente entrou no 6º mês de gestação",
      suggestedAction: "Revisar necessidades para esta fase",
    });
    expect(iso(opportunity.recommendedAt)).toBe("2026-09-06");
    expect(opportunity.score).toBeGreaterThan(0);
  });

  it("uses actual confirmed birth date for child milestones, never the DPP", async () => {
    const actor = await createActor("SELLER", "actual-birth");
    const customer = await prisma.customer.create({
      data: { organizationId: actor.organizationId, name: "Cliente nascimento real", source: "WHATSAPP" },
    });
    const child = await prisma.child.create({
      data: { customerId: customer.id, name: "Laura", birthDate: d("2026-10-03") },
    });
    await prisma.pregnancy.create({
      data: {
        customerId: customer.id,
        expectedDueDate: d("2026-10-10"),
        status: "COMPLETED",
        confirmedBirthDate: d("2026-10-03"),
        confirmedChildId: child.id,
      },
    });

    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2027-01-03"));
    const event = await prisma.journeyEvent.findFirstOrThrow({
      where: { customerId: customer.id, childId: child.id, type: "CHILD_3_MONTHS" },
    });
    expect(iso(event.effectiveAt)).toBe("2027-01-03");
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, pregnancyId: { not: null } } })).toBe(0);
  });

  it("keeps pregnancy and multiple children as independent journeys", async () => {
    const actor = await createActor("SELLER", "multi-journey");
    const { customer, pregnancy } = await customerWithPregnancy(actor, { dueDate: "2026-10-09" });
    const laura = await prisma.child.create({ data: { customerId: customer.id, name: "Laura", birthDate: d("2026-06-09") } });
    const pedro = await prisma.child.create({ data: { customerId: customer.id, name: "Pedro", birthDate: d("2024-09-09") } });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));

    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, pregnancyId: pregnancy.id } })).toBeGreaterThan(0);
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, childId: laura.id } })).toBe(7);
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, childId: pedro.id } })).toBe(7);
    const openSources = await prisma.opportunity.findMany({
      where: { customerId: customer.id },
      include: { journeyEvent: { select: { pregnancyId: true, childId: true } } },
    });
    expect(openSources.some((item) => item.journeyEvent.pregnancyId === pregnancy.id)).toBe(true);
    expect(openSources.some((item) => item.journeyEvent.childId === laura.id)).toBe(true);
    expect(openSources.some((item) => item.journeyEvent.childId === pedro.id)).toBe(true);
  });

  it("is idempotent under repeated and concurrent refreshes including creation audit", async () => {
    const actor = await createActor("SELLER", "dedupe");
    const { customer } = await customerWithPregnancy(actor);
    await Promise.all([
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
    ]);
    const firstEvents = await prisma.journeyEvent.count({ where: { customerId: customer.id } });
    const firstOpportunities = await prisma.opportunity.count({ where: { customerId: customer.id } });
    const firstCreationAudits = await prisma.auditLog.count({ where: { customerId: customer.id, action: "opportunity.created" } });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id } })).toBe(firstEvents);
    expect(await prisma.opportunity.count({ where: { customerId: customer.id } })).toBe(firstOpportunities);
    expect(await prisma.auditLog.count({ where: { customerId: customer.id, action: "opportunity.created" } })).toBe(firstCreationAudits);
    expect(firstCreationAudits).toBe(firstOpportunities);
    expect(firstEvents).toBeGreaterThan(0);
  });

  it("keeps passed-DPP handling neutral and never infers a child or birth", async () => {
    const actor = await createActor("SELLER", "passed-dpp");
    const { customer } = await customerWithPregnancy(actor, { dueDate: "2026-09-01" });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const event = await prisma.journeyEvent.findFirstOrThrow({
      where: { customerId: customer.id, type: "PREGNANCY_UPDATE_REQUIRED" },
    });
    expect(event.status).toBe("DUE");
    const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { journeyEventId: event.id } });
    expect(opportunity.reasonLabel).toBe("Data prevista ultrapassada e nascimento ainda não foi confirmado");
    expect(opportunity.suggestedAction).toBe("Atualizar o momento atual da cliente");
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(0);
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, childId: { not: null } } })).toBe(0);
  });

  it("suppresses actionable opportunities for Não contatar while retaining the neutral journey event", async () => {
    const actor = await createActor("SELLER", "do-not-contact");
    const { customer } = await customerWithPregnancy(actor, { status: "DO_NOT_CONTACT", dueDate: "2026-09-01" });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id, type: "PREGNANCY_UPDATE_REQUIRED" } })).toBe(1);
    expect(await prisma.opportunity.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it("snoozes and dismisses with audit while enforcing tenant isolation", async () => {
    const actorA = await createActor("SELLER", "tenant-a");
    const actorB = await createActor("SELLER", "tenant-b");
    const { customer } = await customerWithPregnancy(actorA);
    await refreshJourneyEventsForCustomerWithContext(actorA, customer.id, d("2026-09-06"));
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id, status: "OPEN" } });

    const snoozed = await snoozeOpportunityWithContext(actorA, opportunity.id, 7, d("2026-09-06"));
    expect(snoozed.status).toBe("SNOOZED");
    expect(iso(snoozed.snoozedUntil!)).toBe("2026-09-13");
    await expect(snoozeOpportunityWithContext(actorB, opportunity.id, 7, d("2026-09-06"))).rejects.toMatchObject({ status: 404 } satisfies Partial<AppError>);

    const dismissed = await dismissOpportunityWithContext(actorA, opportunity.id);
    expect(dismissed.status).toBe("DISMISSED");
    expect(await prisma.auditLog.count({ where: { entityId: opportunity.id, action: { in: ["opportunity.created", "opportunity.snoozed", "opportunity.dismissed"] } } })).toBe(3);
  });

  it("keeps every Marketing read path pure and rejects explicit refresh", async () => {
    const seller = await createActor("SELLER", "seller-marketing-org");
    const marketingUser = await prisma.user.create({ data: { name: "Marketing", email: "marketing-opportunity@example.test", emailVerified: true } });
    const marketingMembership = await prisma.membership.create({ data: { organizationId: seller.organizationId, userId: marketingUser.id, role: "MARKETING" } });
    const marketing = { ...seller, userId: marketingUser.id, userName: marketingUser.name, membershipId: marketingMembership.id, role: "MARKETING" as const };
    const { customer } = await customerWithPregnancy(seller);

    const emptyBefore = {
      events: await prisma.journeyEvent.count(),
      opportunities: await prisma.opportunity.count(),
      audits: await prisma.auditLog.count(),
    };
    expect((await listOpportunitiesWithContext(marketing, { status: "OPEN" }, d("2026-09-06"))).items).toHaveLength(0);
    expect(await listCustomerJourneyEventsWithContext(marketing, customer.id)).toHaveLength(0);
    expect(await listCustomerOpportunitiesWithContext(marketing, customer.id)).toHaveLength(0);
    expect(await getNextCustomerOpportunityWithContext(marketing, customer.id)).toBeNull();
    expect({
      events: await prisma.journeyEvent.count(),
      opportunities: await prisma.opportunity.count(),
      audits: await prisma.auditLog.count(),
    }).toEqual(emptyBefore);

    await refreshJourneyEventsForCustomerWithContext(seller, customer.id, d("2026-09-06"));
    const opportunityState = await prisma.opportunity.findMany({ where: { customerId: customer.id }, select: { id: true, status: true }, orderBy: { id: "asc" } });
    const auditCount = await prisma.auditLog.count({ where: { customerId: customer.id } });
    const eventCount = await prisma.journeyEvent.count({ where: { customerId: customer.id } });
    const opportunityCount = await prisma.opportunity.count({ where: { customerId: customer.id } });

    expect((await listOpportunitiesWithContext(marketing, { status: "OPEN" }, d("2026-09-06"))).items.length).toBeGreaterThan(0);
    expect((await listCustomerJourneyEventsWithContext(marketing, customer.id)).length).toBeGreaterThan(0);
    expect((await listCustomerOpportunitiesWithContext(marketing, customer.id)).length).toBeGreaterThan(0);
    expect(await getNextCustomerOpportunityWithContext(marketing, customer.id)).not.toBeNull();
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id } })).toBe(eventCount);
    expect(await prisma.opportunity.count({ where: { customerId: customer.id } })).toBe(opportunityCount);
    expect(await prisma.opportunity.findMany({ where: { customerId: customer.id }, select: { id: true, status: true }, orderBy: { id: "asc" } })).toEqual(opportunityState);
    expect(await prisma.auditLog.count({ where: { customerId: customer.id } })).toBe(auditCount);
    await expect(refreshJourneyEventsForOrganizationWithContext(marketing, d("2026-09-06"))).rejects.toMatchObject({ status: 403 } satisfies Partial<AppError>);
  });

  it("allows OWNER, MANAGER and SELLER explicit organization refresh and keeps it idempotent", async () => {
    for (const role of ["OWNER", "MANAGER", "SELLER"] as const) {
      const actor = await createActor(role, `manage-${role.toLowerCase()}`);
      const { customer } = await customerWithPregnancy(actor);
      await refreshJourneyEventsForOrganizationWithContext(actor, d("2026-09-06"));
      const events = await prisma.journeyEvent.count({ where: { customerId: customer.id } });
      const opportunities = await prisma.opportunity.count({ where: { customerId: customer.id } });
      const creationAudits = await prisma.auditLog.count({ where: { customerId: customer.id, action: "opportunity.created" } });
      expect(events).toBeGreaterThan(0);
      expect(opportunities).toBeGreaterThan(0);
      expect(creationAudits).toBe(opportunities);
      await refreshJourneyEventsForOrganizationWithContext(actor, d("2026-09-06"));
      expect(await prisma.journeyEvent.count({ where: { customerId: customer.id } })).toBe(events);
      expect(await prisma.opportunity.count({ where: { customerId: customer.id } })).toBe(opportunities);
      expect(await prisma.auditLog.count({ where: { customerId: customer.id, action: "opportunity.created" } })).toBe(creationAudits);
    }
  });

  it("supersedes old DPP-derived events and resolves their opportunities with engine audit", async () => {
    const actor = await createActor("SELLER", "dpp-change");
    const { customer, pregnancy } = await customerWithPregnancy(actor);
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    const oldEvent = await prisma.journeyEvent.findFirstOrThrow({ where: { pregnancyId: pregnancy.id, type: "PREGNANCY_MONTH_6", effectiveAt: d("2026-09-06") } });
    const oldOpportunity = await prisma.opportunity.findUniqueOrThrow({ where: { journeyEventId: oldEvent.id } });

    await prisma.pregnancy.update({ where: { id: pregnancy.id }, data: { expectedDueDate: d("2027-02-03"), informationUpdatedAt: d("2026-09-07") } });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-07"));

    expect((await prisma.journeyEvent.findUniqueOrThrow({ where: { id: oldEvent.id } })).status).toBe("SUPERSEDED");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: oldOpportunity.id } })).status).toBe("RESOLVED");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: oldOpportunity.id, action: "opportunity.resolved" } });
    expect(audit.metadata).toMatchObject({ origin: "engine", reason: "journey_event_superseded" });
    expect(await prisma.journeyEvent.count({ where: { pregnancyId: pregnancy.id, status: { in: ["UPCOMING", "DUE"] } } })).toBeGreaterThan(0);
    expect(await prisma.opportunity.count({ where: { customerId: customer.id, status: "OPEN", journeyEventId: { not: oldEvent.id } } })).toBeGreaterThan(0);
  });

  it("marks a stale milestone EXPIRED and resolves its active opportunity with engine audit", async () => {
    const actor = await createActor("SELLER", "expired-event");
    const { customer, pregnancy } = await customerWithPregnancy(actor);
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    const event = await prisma.journeyEvent.findFirstOrThrow({ where: { pregnancyId: pregnancy.id, type: "PREGNANCY_MONTH_6" } });
    const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { journeyEventId: event.id } });

    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-10-23"));
    expect((await prisma.journeyEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("EXPIRED");
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunity.id } })).status).toBe("RESOLVED");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: opportunity.id, action: "opportunity.resolved" } });
    expect(audit.metadata).toMatchObject({ origin: "engine", reason: "journey_event_expired" });
  });

  it("resolves active opportunities when the customer becomes not actionable and audits the reason", async () => {
    const actor = await createActor("SELLER", "customer-suppression");
    const { customer } = await customerWithPregnancy(actor);
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    const activeBefore = await prisma.opportunity.findMany({ where: { customerId: customer.id, status: "OPEN" }, select: { id: true } });
    expect(activeBefore.length).toBeGreaterThan(0);
    await prisma.customer.update({ where: { id: customer.id }, data: { status: "DO_NOT_CONTACT" } });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    expect(await prisma.opportunity.count({ where: { customerId: customer.id, status: { in: ["OPEN", "SNOOZED"] } } })).toBe(0);
    for (const opportunity of activeBefore) {
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: opportunity.id, action: "opportunity.resolved" } });
      expect(audit.metadata).toMatchObject({ origin: "engine", reason: "customer_not_actionable" });
    }
  });

  it("enforces JourneyEvent source cardinality and type/source matching at PostgreSQL level", async () => {
    const actor = await createActor("SELLER", "source-check");
    const { customer, pregnancy } = await customerWithPregnancy(actor);
    const child = await prisma.child.create({ data: { customerId: customer.id, name: "Fonte", birthDate: d("2026-06-09") } });

    await expect(prisma.journeyEvent.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      type: "PREGNANCY_MONTH_6",
      effectiveAt: d("2026-09-06"),
      dedupeKey: "invalid-no-source",
      ruleVersion: 1,
    } })).rejects.toBeTruthy();

    await expect(prisma.journeyEvent.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      pregnancyId: pregnancy.id,
      childId: child.id,
      type: "PREGNANCY_MONTH_6",
      effectiveAt: d("2026-09-06"),
      dedupeKey: "invalid-two-sources",
      ruleVersion: 1,
    } })).rejects.toBeTruthy();

    await expect(prisma.journeyEvent.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      pregnancyId: pregnancy.id,
      type: "CHILD_6_MONTHS",
      effectiveAt: d("2026-12-09"),
      dedupeKey: "invalid-child-type-pregnancy-source",
      ruleVersion: 1,
    } })).rejects.toBeTruthy();

    await expect(prisma.journeyEvent.create({ data: {
      organizationId: actor.organizationId,
      customerId: customer.id,
      childId: child.id,
      type: "DPP_MINUS_30",
      effectiveAt: d("2026-12-04"),
      dedupeKey: "invalid-pregnancy-type-child-source",
      ruleVersion: 1,
    } })).rejects.toBeTruthy();
  });
});
