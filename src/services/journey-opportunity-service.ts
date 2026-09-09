import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";
import { dateOnlyFromInstant, diffCalendarDays } from "@/domain/shared/date-only";
import {
  JOURNEY_RULE_VERSION,
  buildJourneyEventDedupeKey,
  classifyJourneyEventStatus,
  deriveChildEventCandidates,
  derivePregnancyEventCandidates,
  isOpportunityActionable,
  type JourneyEventCandidate,
  type JourneyEventTypeCode,
} from "@/domain/journey-event/rules";
import {
  customerAllowsActionableOpportunity,
  getOpportunityDefinition,
  priorityForOpportunity,
  scoreOpportunity,
  type CustomerStatusCode,
} from "@/domain/opportunity/opportunity";
import { requireAuthContext, type AuthContext } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function asOfDate(instant: Date) {
  return dateOnlyFromInstant(instant, env.APP_TIME_ZONE);
}

function sourceFor(candidate: JourneyEventCandidate) {
  return candidate.source === "PREGNANCY"
    ? { pregnancyId: candidate.sourceId, childId: null }
    : { pregnancyId: null, childId: candidate.sourceId };
}

type EngineResolutionReason =
  | "journey_event_expired"
  | "journey_event_superseded"
  | "customer_not_actionable";

async function resolveActiveOpportunities(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  customerId: string,
  extraWhere: Prisma.OpportunityWhereInput,
  reason: EngineResolutionReason,
) {
  const opportunities = await tx.opportunity.findMany({
    where: {
      AND: [
        {
          organizationId: context.organizationId,
          customerId,
          status: { in: ["OPEN", "SNOOZED"] },
        },
        extraWhere,
      ],
    },
    select: { id: true, customerId: true, journeyEventId: true },
  });

  for (const opportunity of opportunities) {
    const updated = await tx.opportunity.updateMany({
      where: { id: opportunity.id, status: { in: ["OPEN", "SNOOZED"] } },
      data: { status: "RESOLVED", snoozedUntil: null },
    });
    if (updated.count !== 1) continue;
    await writeAudit(tx, context, {
      action: "opportunity.resolved",
      entityType: "Opportunity",
      entityId: opportunity.id,
      customerId: opportunity.customerId,
      metadata: { origin: "engine", reason, journeyEventId: opportunity.journeyEventId },
    });
  }
}

async function ensureOpportunity(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  customer: {
    id: string;
    status: CustomerStatusCode;
    responsibleMembershipId: string | null;
  },
  event: {
    id: string;
    type: JourneyEventTypeCode;
    effectiveAt: Date;
  },
  candidate: JourneyEventCandidate,
  today: Date,
) {
  const definition = getOpportunityDefinition(event.type);
  const explanation = scoreOpportunity({
    type: event.type,
    source: candidate.source,
    recommendedAt: event.effectiveAt,
    informationUpdatedAt: candidate.informationUpdatedAt,
    customerStatus: customer.status,
    asOf: today,
  });
  const data = {
    organizationId: context.organizationId,
    customerId: customer.id,
    journeyEventId: event.id,
    reasonCode: definition.reasonCode,
    reasonLabel: definition.reasonLabel,
    recommendedAt: event.effectiveAt,
    priority: priorityForOpportunity(event.type, explanation.score),
    score: explanation.score,
    responsibleMembershipId: customer.responsibleMembershipId,
    scoreExplanation: { total: explanation.score, factors: explanation.factors },
    suggestedAction: definition.suggestedAction,
  } satisfies Prisma.OpportunityCreateManyInput;

  const inserted = await tx.opportunity.createMany({ data: [data], skipDuplicates: true });
  const opportunity = await tx.opportunity.findUniqueOrThrow({ where: { journeyEventId: event.id } });

  if (inserted.count === 1) {
    await writeAudit(tx, context, {
      action: "opportunity.created",
      entityType: "Opportunity",
      entityId: opportunity.id,
      customerId: customer.id,
      metadata: { journeyEventId: event.id, reasonCode: definition.reasonCode },
    });
    return opportunity;
  }

  const shouldReopen =
    opportunity.status === "SNOOZED" &&
    opportunity.snoozedUntil &&
    diffCalendarDays(today, opportunity.snoozedUntil) >= 0;

  return tx.opportunity.update({
    where: { id: opportunity.id },
    data: {
      reasonCode: definition.reasonCode,
      reasonLabel: definition.reasonLabel,
      recommendedAt: event.effectiveAt,
      priority: data.priority,
      score: explanation.score,
      responsibleMembershipId: customer.responsibleMembershipId,
      scoreExplanation: data.scoreExplanation,
      suggestedAction: definition.suggestedAction,
      ...(shouldReopen ? { status: "OPEN", snoozedUntil: null } : {}),
    },
  });
}

export async function refreshJourneyEventsForCustomerWithContext(
  context: AuthContext,
  customerId: string,
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:manage",
  );
  const today = asOfDate(instant);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
    include: { pregnancies: true, children: true },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");

  const candidates: JourneyEventCandidate[] = [
    ...customer.pregnancies.flatMap((pregnancy) => derivePregnancyEventCandidates(pregnancy, today)),
    ...customer.children.flatMap((child) => deriveChildEventCandidates(child)),
  ];
  const currentKeys = candidates.map((candidate) =>
    buildJourneyEventDedupeKey({
      customerId: customer.id,
      source: candidate.source,
      sourceId: candidate.sourceId,
      type: candidate.type,
      effectiveAt: candidate.effectiveAt,
      ruleVersion: JOURNEY_RULE_VERSION,
    }),
  );

  return prisma.$transaction(async (tx) => {
    const obsoleteEvents = await tx.journeyEvent.findMany({
      where: {
        organizationId: context.organizationId,
        customerId: customer.id,
        status: { in: ["UPCOMING", "DUE"] },
        ...(currentKeys.length ? { dedupeKey: { notIn: currentKeys } } : {}),
      },
      select: { id: true },
    });

    if (obsoleteEvents.length) {
      await tx.journeyEvent.updateMany({
        where: { id: { in: obsoleteEvents.map((event) => event.id) } },
        data: { status: "SUPERSEDED" },
      });
    }

    const persisted = [];
    for (const candidate of candidates) {
      const dedupeKey = buildJourneyEventDedupeKey({
        customerId: customer.id,
        source: candidate.source,
        sourceId: candidate.sourceId,
        type: candidate.type,
        effectiveAt: candidate.effectiveAt,
        ruleVersion: JOURNEY_RULE_VERSION,
      });
      const status = classifyJourneyEventStatus(candidate.type, candidate.effectiveAt, today);
      const event = await tx.journeyEvent.upsert({
        where: { organizationId_dedupeKey: { organizationId: context.organizationId, dedupeKey } },
        create: {
          organizationId: context.organizationId,
          customerId: customer.id,
          ...sourceFor(candidate),
          type: candidate.type,
          effectiveAt: candidate.effectiveAt,
          status,
          dedupeKey,
          ruleVersion: JOURNEY_RULE_VERSION,
        },
        update: {
          ...sourceFor(candidate),
          effectiveAt: candidate.effectiveAt,
          status,
          ruleVersion: JOURNEY_RULE_VERSION,
        },
      });
      persisted.push(event);

      if (
        customerAllowsActionableOpportunity(customer.status) &&
        isOpportunityActionable(candidate.type, status, candidate.effectiveAt, today)
      ) {
        await ensureOpportunity(tx, context, customer, { id: event.id, type: candidate.type, effectiveAt: event.effectiveAt }, candidate, today);
      }
    }

    if (!customerAllowsActionableOpportunity(customer.status)) {
      await resolveActiveOpportunities(tx, context, customer.id, {}, "customer_not_actionable");
    } else {
      if (obsoleteEvents.length) {
        await resolveActiveOpportunities(
          tx,
          context,
          customer.id,
          { journeyEventId: { in: obsoleteEvents.map((event) => event.id) } },
          "journey_event_superseded",
        );
      }
      await resolveActiveOpportunities(
        tx,
        context,
        customer.id,
        { journeyEvent: { status: "EXPIRED" } },
        "journey_event_expired",
      );
    }

    return persisted;
  });
}

export async function refreshJourneyEventsForCustomer(customerId: string, instant = new Date()) {
  return refreshJourneyEventsForCustomerWithContext(await requireAuthContext(), customerId, instant);
}

export async function refreshJourneyEventsForOrganizationWithContext(
  context: AuthContext,
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:manage",
  );
  const customers = await prisma.customer.findMany({
    where: { organizationId: context.organizationId },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const customer of customers) {
    await refreshJourneyEventsForCustomerWithContext(context, customer.id, instant);
  }
  return { refreshedCustomers: customers.length };
}

export async function refreshJourneyEventsForOrganization(instant = new Date()) {
  return refreshJourneyEventsForOrganizationWithContext(await requireAuthContext(), instant);
}

export type OpportunityListInput = {
  status?: string;
  priority?: string;
  responsibleMembershipId?: string;
  source?: string;
  timing?: string;
  customer?: string;
};

const opportunityStatuses = ["OPEN", "SNOOZED", "DISMISSED", "RESOLVED"] as const;
const opportunityPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export async function listOpportunitiesWithContext(
  context: AuthContext,
  input: OpportunityListInput = {},
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:view",
  );
  const today = asOfDate(instant);
  const status = opportunityStatuses.includes(input.status as (typeof opportunityStatuses)[number])
    ? input.status
    : "OPEN";
  const priority = opportunityPriorities.includes(input.priority as (typeof opportunityPriorities)[number])
    ? input.priority
    : undefined;
  const source = input.source === "PREGNANCY" || input.source === "CHILD" ? input.source : undefined;
  const timing =
    input.timing === "OVERDUE" || input.timing === "TODAY" || input.timing === "UPCOMING"
      ? input.timing
      : undefined;
  const customerSearch = input.customer?.trim();

  const where: Prisma.OpportunityWhereInput = {
    organizationId: context.organizationId,
    status: status as Prisma.EnumOpportunityStatusFilter["equals"],
    ...(priority ? { priority: priority as Prisma.EnumOpportunityPriorityFilter["equals"] } : {}),
    ...(input.responsibleMembershipId ? { responsibleMembershipId: input.responsibleMembershipId } : {}),
    ...(source === "PREGNANCY" ? { journeyEvent: { pregnancyId: { not: null } } } : {}),
    ...(source === "CHILD" ? { journeyEvent: { childId: { not: null } } } : {}),
    ...(timing === "OVERDUE" ? { recommendedAt: { lt: today } } : {}),
    ...(timing === "TODAY" ? { recommendedAt: today } : {}),
    ...(timing === "UPCOMING" ? { recommendedAt: { gt: today } } : {}),
    ...(customerSearch ? { customer: { name: { contains: customerSearch, mode: "insensitive" } } } : {}),
  };

  const [items, members] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, status: true } },
        journeyEvent: {
          select: {
            type: true,
            effectiveAt: true,
            status: true,
            pregnancy: { select: { id: true, expectedDueDate: true } },
            child: { select: { id: true, name: true, birthDate: true } },
          },
        },
        responsibleMembership: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: [{ priority: "desc" }, { score: "desc" }, { recommendedAt: "asc" }, { id: "asc" }],
      take: 200,
    }),
    prisma.membership.findMany({
      where: { organizationId: context.organizationId, active: true },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  return {
    items,
    members,
    context,
    today,
    applied: {
      status,
      priority,
      source,
      timing,
      customer: customerSearch ?? "",
      responsibleMembershipId: input.responsibleMembershipId ?? "",
    },
  };
}

export async function listOpportunities(input: OpportunityListInput = {}) {
  return listOpportunitiesWithContext(await requireAuthContext(), input);
}

export async function listCustomerJourneyEventsWithContext(
  context: AuthContext,
  customerId: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:view",
  );
  return prisma.journeyEvent.findMany({
    where: {
      organizationId: context.organizationId,
      customerId,
      status: { in: ["UPCOMING", "DUE"] },
    },
    include: {
      child: { select: { name: true } },
      pregnancy: { select: { expectedDueDate: true } },
    },
    orderBy: [{ effectiveAt: "asc" }, { type: "asc" }],
  });
}

export async function listCustomerOpportunitiesWithContext(
  context: AuthContext,
  customerId: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:view",
  );
  return prisma.opportunity.findMany({
    where: { organizationId: context.organizationId, customerId },
    include: {
      customer: { select: { id: true, name: true, status: true } },
      journeyEvent: {
        select: {
          type: true,
          effectiveAt: true,
          status: true,
          pregnancy: { select: { expectedDueDate: true } },
          child: { select: { name: true, birthDate: true } },
        },
      },
      responsibleMembership: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { score: "desc" }, { recommendedAt: "asc" }],
    take: 50,
  });
}

export async function getNextCustomerOpportunityWithContext(
  context: AuthContext,
  customerId: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:view",
  );
  return prisma.opportunity.findFirst({
    where: { organizationId: context.organizationId, customerId, status: "OPEN" },
    include: {
      journeyEvent: {
        select: { type: true, child: { select: { name: true } }, pregnancy: { select: { id: true } } },
      },
    },
    orderBy: [{ priority: "desc" }, { score: "desc" }, { recommendedAt: "asc" }],
  });
}

export async function snoozeOpportunityWithContext(
  context: AuthContext,
  opportunityId: string,
  days = 7,
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:manage",
  );
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: context.organizationId },
  });
  if (!opportunity) throw new AppError(404, "OPPORTUNITY_NOT_FOUND", "Oportunidade não encontrada.");
  if (opportunity.status === "DISMISSED" || opportunity.status === "RESOLVED") {
    throw new AppError(409, "OPPORTUNITY_CLOSED", "Esta oportunidade já foi encerrada.");
  }
  const until = new Date(asOfDate(instant));
  until.setUTCDate(until.getUTCDate() + Math.max(1, Math.min(days, 90)));
  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opportunity.id },
      data: { status: "SNOOZED", snoozedUntil: until },
    });
    await writeAudit(tx, context, {
      action: "opportunity.snoozed",
      entityType: "Opportunity",
      entityId: updated.id,
      customerId: updated.customerId,
      metadata: { snoozedUntil: until.toISOString().slice(0, 10) },
    });
    return updated;
  });
}

export async function snoozeOpportunity(opportunityId: string, days = 7) {
  return snoozeOpportunityWithContext(await requireAuthContext(), opportunityId, days);
}

export async function dismissOpportunityWithContext(context: AuthContext, opportunityId: string) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "opportunity:manage",
  );
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, organizationId: context.organizationId },
  });
  if (!opportunity) throw new AppError(404, "OPPORTUNITY_NOT_FOUND", "Oportunidade não encontrada.");
  if (opportunity.status === "RESOLVED") {
    throw new AppError(409, "OPPORTUNITY_CLOSED", "Esta oportunidade já foi encerrada.");
  }
  if (opportunity.status === "DISMISSED") return opportunity;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.opportunity.update({
      where: { id: opportunity.id },
      data: { status: "DISMISSED", snoozedUntil: null },
    });
    await writeAudit(tx, context, {
      action: "opportunity.dismissed",
      entityType: "Opportunity",
      entityId: updated.id,
      customerId: updated.customerId,
    });
    return updated;
  });
}

export async function dismissOpportunity(opportunityId: string) {
  return dismissOpportunityWithContext(await requireAuthContext(), opportunityId);
}
