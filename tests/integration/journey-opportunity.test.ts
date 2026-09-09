import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";
import {
  dismissOpportunityWithContext,
  listOpportunitiesWithContext,
  refreshJourneyEventsForCustomerWithContext,
  snoozeOpportunityWithContext,
} from "@/services/journey-opportunity-service";
import { cleanDatabase, createActor } from "./helpers";

const d = (value: string) => new Date(`${value}T12:00:00Z`);

async function customerWithPregnancy(context: Awaited<ReturnType<typeof createActor>>, options: { status?: "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED"; dueDate?: string } = {}) {
  const customer = await prisma.customer.create({ data: {
    organizationId: context.organizationId,
    responsibleMembershipId: context.membershipId,
    name: `Cliente ${context.organizationId.slice(0, 8)}`,
    source: "PHYSICAL_STORE",
    status: options.status ?? "CUSTOMER",
  } });
  const pregnancy = await prisma.pregnancy.create({ data: {
    customerId: customer.id,
    expectedDueDate: d(options.dueDate ?? "2027-01-03"),
    informationUpdatedAt: d("2026-09-01"),
  } });
  return { customer, pregnancy };
}

beforeEach(cleanDatabase);

describe("journey event → opportunity PostgreSQL slice", () => {
  it("persists a pregnancy milestone and its deterministic opportunity", async () => {
    const actor = await createActor("SELLER", "pregnancy-event");
    const { customer, pregnancy } = await customerWithPregnancy(actor);
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));

    const event = await prisma.journeyEvent.findFirstOrThrow({ where: { customerId: customer.id, pregnancyId: pregnancy.id, type: "PREGNANCY_MONTH_6" } });
    expect(event.status).toBe("DUE");
    const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { journeyEventId: event.id } });
    expect(opportunity).toMatchObject({ customerId: customer.id, pregnancyId: pregnancy.id, childId: null, reasonCode: "PREGNANCY_MONTH_6", reasonLabel: "Cliente entrou no 6º mês de gestação", recommendedAt: d("2026-09-06") });
    expect(opportunity.score).toBeGreaterThan(0);
    expect(opportunity.suggestedAction).toBe("Revisar necessidades para esta fase");
  });

  it("uses actual confirmed birth date for child milestones, never the DPP", async () => {
    const actor = await createActor("SELLER", "actual-birth");
    const customer = await prisma.customer.create({ data: { organizationId: actor.organizationId, name: "Cliente nascimento real", source: "WHATSAPP" } });
    const child = await prisma.child.create({ data: { customerId: customer.id, name: "Laura", birthDate: d("2026-10-03") } });
    await prisma.pregnancy.create({ data: { customerId: customer.id, expectedDueDate: d("2026-10-10"), status: "COMPLETED", confirmedBirthDate: d("2026-10-03"), confirmedChildId: child.id } });

    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2027-01-03"));
    const event = await prisma.journeyEvent.findFirstOrThrow({ where: { customerId: customer.id, childId: child.id, type: "CHILD_3_MONTHS" } });
    expect(event.effectiveAt.toISOString().slice(0, 10)).toBe("2027-01-03");
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
    const openSources = await prisma.opportunity.findMany({ where: { customerId: customer.id }, select: { pregnancyId: true, childId: true } });
    expect(openSources.some((item) => item.pregnancyId === pregnancy.id)).toBe(true);
    expect(openSources.some((item) => item.childId === laura.id)).toBe(true);
    expect(openSources.some((item) => item.childId === pedro.id)).toBe(true);
  });

  it("is idempotent under repeated and concurrent refreshes", async () => {
    const actor = await createActor("SELLER", "dedupe");
    const { customer } = await customerWithPregnancy(actor);
    await Promise.all([
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
      refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06")),
    ]);
    const firstEvents = await prisma.journeyEvent.count({ where: { customerId: customer.id } });
    const firstOpportunities = await prisma.opportunity.count({ where: { customerId: customer.id } });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-06"));
    expect(await prisma.journeyEvent.count({ where: { customerId: customer.id } })).toBe(firstEvents);
    expect(await prisma.opportunity.count({ where: { customerId: customer.id } })).toBe(firstOpportunities);
    expect(firstEvents).toBeGreaterThan(0);
  });

  it("detects the neutral passed-DPP event but suppresses contact opportunity for Não contatar", async () => {
    const actor = await createActor("SELLER", "do-not-contact");
    const { customer } = await customerWithPregnancy(actor, { status: "DO_NOT_CONTACT", dueDate: "2026-09-01" });
    await refreshJourneyEventsForCustomerWithContext(actor, customer.id, d("2026-09-09"));
    const event = await prisma.journeyEvent.findFirstOrThrow({ where: { customerId: customer.id, type: "PREGNANCY_UPDATE_REQUIRED" } });
    expect(event.status).toBe("DUE");
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
    expect(snoozed.snoozedUntil?.toISOString().slice(0, 10)).toBe("2026-09-13");
    await expect(snoozeOpportunityWithContext(actorB, opportunity.id, 7, d("2026-09-06"))).rejects.toMatchObject({ status: 404 } satisfies Partial<AppError>);

    const dismissed = await dismissOpportunityWithContext(actorA, opportunity.id);
    expect(dismissed.status).toBe("DISMISSED");
    expect(await prisma.auditLog.count({ where: { entityId: opportunity.id, action: { in: ["opportunity.created", "opportunity.snoozed", "opportunity.dismissed"] } } })).toBe(3);
  });

  it("keeps Marketing read-only through real service authorization", async () => {
    const seller = await createActor("SELLER", "seller-owner");
    const marketingUser = await prisma.user.create({ data: { name: "Marketing", email: "marketing-opportunity@example.test", emailVerified: true } });
    const marketingMembership = await prisma.membership.create({ data: { organizationId: seller.organizationId, userId: marketingUser.id, role: "MARKETING" } });
    const marketing = { ...seller, userId: marketingUser.id, userName: marketingUser.name, membershipId: marketingMembership.id, role: "MARKETING" as const };
    const { customer } = await customerWithPregnancy(seller);
    await refreshJourneyEventsForCustomerWithContext(seller, customer.id, d("2026-09-06"));
    const opportunity = await prisma.opportunity.findFirstOrThrow({ where: { customerId: customer.id } });
    const result = await listOpportunitiesWithContext(marketing, { status: "OPEN" }, d("2026-09-06"));
    expect(result.items.length).toBeGreaterThan(0);
    await expect(snoozeOpportunityWithContext(marketing, opportunity.id, 7, d("2026-09-06"))).rejects.toMatchObject({ status: 403 } satisfies Partial<AppError>);
  });
});
