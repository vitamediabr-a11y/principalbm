import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";
import { dateOnlyFromInstant } from "@/domain/shared/date-only";
import {
  CONTACT_DECISION_POLICY_VERSION,
  RELATIONSHIP_CONTACT_PURPOSE,
  evaluateContactDecisionSet,
  type ContactDecisionInput,
  type ContactDecisionResult,
  type WhatsAppConsentState,
} from "@/domain/contact-decision/contact-decision";
import { requireAuthContext, type AuthContext } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function asOfDate(instant: Date) {
  return dateOnlyFromInstant(instant, env.APP_TIME_ZONE);
}

function consentState(record: { status: "GRANTED" | "REVOKED" } | null): WhatsAppConsentState {
  if (!record) return "MISSING";
  return record.status;
}

async function latestRelationshipWhatsAppConsent(
  db: Prisma.TransactionClient,
  customerId: string,
) {
  return db.consent.findFirst({
    where: {
      customerId,
      channel: "WHATSAPP",
      purpose: RELATIONSHIP_CONTACT_PURPOSE,
    },
    orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, capturedAt: true, createdAt: true },
  });
}

function decisionJson(result: ContactDecisionResult): Prisma.InputJsonValue {
  return {
    facts: result.facts,
    reasons: result.reasons,
  };
}

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function meaningfulDecisionChanged(
  existing: {
    status: string;
    eligibleAt: Date | null;
    primaryReasonCode: string;
    suppressedByOpportunityId: string | null;
    policyVersion: number;
  },
  next: ContactDecisionResult,
) {
  return existing.status !== next.status
    || dateKey(existing.eligibleAt) !== dateKey(next.eligibleAt)
    || existing.primaryReasonCode !== next.primaryReasonCode
    || existing.suppressedByOpportunityId !== next.suppressedByOpportunityId
    || existing.policyVersion !== CONTACT_DECISION_POLICY_VERSION;
}

export async function evaluateContactDecisionsForCustomerWithContext(
  context: AuthContext,
  customerId: string,
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:evaluate",
  );
  const asOf = asOfDate(instant);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, organizationId: context.organizationId },
      select: {
        id: true,
        status: true,
        whatsappNormalized: true,
      },
    });
    if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");

    const [opportunities, latestConsent] = await Promise.all([
      tx.opportunity.findMany({
        where: { organizationId: context.organizationId, customerId: customer.id },
        select: {
          id: true,
          status: true,
          priority: true,
          score: true,
          recommendedAt: true,
          snoozedUntil: true,
        },
        orderBy: { id: "asc" },
      }),
      latestRelationshipWhatsAppConsent(tx, customer.id),
    ]);

    const currentConsentState = consentState(latestConsent);
    const inputs: ContactDecisionInput[] = opportunities.map((opportunity) => ({
      opportunityId: opportunity.id,
      opportunityStatus: opportunity.status,
      priority: opportunity.priority,
      score: opportunity.score,
      recommendedAt: opportunity.recommendedAt,
      snoozedUntil: opportunity.snoozedUntil,
      customerStatus: customer.status,
      whatsappNormalized: customer.whatsappNormalized,
      consentState: currentConsentState,
      asOf,
    }));
    const evaluated = evaluateContactDecisionSet(inputs);
    const persisted = [];

    for (const next of evaluated) {
      const data = {
        organizationId: context.organizationId,
        customerId: customer.id,
        opportunityId: next.opportunityId,
        status: next.status,
        channel: "WHATSAPP" as const,
        evaluatedAt: instant,
        eligibleAt: next.eligibleAt,
        primaryReasonCode: next.primaryReasonCode,
        reasonsJson: decisionJson(next),
        suppressedByOpportunityId: next.suppressedByOpportunityId,
        policyVersion: CONTACT_DECISION_POLICY_VERSION,
      } satisfies Prisma.ContactDecisionCreateManyInput;

      const inserted = await tx.contactDecision.createMany({ data: [data], skipDuplicates: true });
      const existing = await tx.contactDecision.findUniqueOrThrow({ where: { opportunityId: next.opportunityId } });

      if (inserted.count === 1) {
        await writeAudit(tx, context, {
          action: "contact_decision.created",
          entityType: "ContactDecision",
          entityId: existing.id,
          customerId: customer.id,
          metadata: {
            toStatus: next.status,
            primaryReasonCode: next.primaryReasonCode,
            opportunityId: next.opportunityId,
            channel: "WHATSAPP",
            suppressedByOpportunityId: next.suppressedByOpportunityId,
            policyVersion: CONTACT_DECISION_POLICY_VERSION,
          },
        });
        persisted.push(existing);
        continue;
      }

      const changed = meaningfulDecisionChanged(existing, next);
      const updated = await tx.contactDecision.update({
        where: { id: existing.id },
        data: {
          status: next.status,
          evaluatedAt: instant,
          eligibleAt: next.eligibleAt,
          primaryReasonCode: next.primaryReasonCode,
          reasonsJson: decisionJson(next),
          suppressedByOpportunityId: next.suppressedByOpportunityId,
          policyVersion: CONTACT_DECISION_POLICY_VERSION,
        },
      });

      if (changed) {
        await writeAudit(tx, context, {
          action: "contact_decision.changed",
          entityType: "ContactDecision",
          entityId: updated.id,
          customerId: customer.id,
          metadata: {
            fromStatus: existing.status,
            toStatus: updated.status,
            primaryReasonCode: updated.primaryReasonCode,
            opportunityId: updated.opportunityId,
            channel: updated.channel,
            suppressedByOpportunityId: updated.suppressedByOpportunityId,
            policyVersion: updated.policyVersion,
          },
        });
      }
      persisted.push(updated);
    }

    return persisted;
  });
}

export async function evaluateContactDecisionsForCustomer(customerId: string, instant = new Date()) {
  return evaluateContactDecisionsForCustomerWithContext(await requireAuthContext(), customerId, instant);
}

export async function refreshContactDecisionsForOrganizationWithContext(
  context: AuthContext,
  instant = new Date(),
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:evaluate",
  );
  const customers = await prisma.opportunity.findMany({
    where: { organizationId: context.organizationId },
    select: { customerId: true },
    distinct: ["customerId"],
    orderBy: { customerId: "asc" },
  });
  for (const customer of customers) {
    await evaluateContactDecisionsForCustomerWithContext(context, customer.customerId, instant);
  }
  return { evaluatedCustomers: customers.length };
}

export async function refreshContactDecisionsForOrganization(instant = new Date()) {
  return refreshContactDecisionsForOrganizationWithContext(await requireAuthContext(), instant);
}

const decisionStatuses = ["PROCEED", "WAIT", "BLOCKED", "SUPPRESSED"] as const;

export async function listContactDecisionsWithContext(
  context: AuthContext,
  status?: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:view",
  );
  const validStatus = decisionStatuses.includes(status as (typeof decisionStatuses)[number])
    ? status as (typeof decisionStatuses)[number]
    : undefined;
  return prisma.contactDecision.findMany({
    where: {
      organizationId: context.organizationId,
      ...(validStatus ? { status: validStatus } : {}),
    },
    orderBy: [{ evaluatedAt: "desc" }, { id: "asc" }],
  });
}

export async function listContactDecisions(status?: string) {
  return listContactDecisionsWithContext(await requireAuthContext(), status);
}

export async function listContactDecisionsForOpportunitiesWithContext(
  context: AuthContext,
  opportunityIds: string[],
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:view",
  );
  if (!opportunityIds.length) return [];
  return prisma.contactDecision.findMany({
    where: {
      organizationId: context.organizationId,
      opportunityId: { in: opportunityIds },
    },
  });
}

export async function getContactDecisionWithContext(
  context: AuthContext,
  opportunityId: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:view",
  );
  return prisma.contactDecision.findFirst({
    where: { organizationId: context.organizationId, opportunityId },
  });
}

export async function getContactReadinessSnapshotWithContext(
  context: AuthContext,
  customerId: string,
) {
  assertAuthorized(
    { role: context.role, active: true, organizationId: context.organizationId },
    "contact-decision:view",
  );
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
    select: { id: true, whatsappNormalized: true },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");
  const latestConsent = await prisma.consent.findFirst({
    where: {
      customerId: customer.id,
      channel: "WHATSAPP",
      purpose: RELATIONSHIP_CONTACT_PURPOSE,
    },
    orderBy: [{ capturedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { status: true, capturedAt: true },
  });
  return {
    whatsappAvailable: Boolean(customer.whatsappNormalized),
    consentState: consentState(latestConsent),
    consentCapturedAt: latestConsent?.capturedAt ?? null,
    purpose: RELATIONSHIP_CONTACT_PURPOSE,
  };
}
