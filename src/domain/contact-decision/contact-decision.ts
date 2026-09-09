import { diffCalendarDays } from "@/domain/shared/date-only";

export const CONTACT_DECISION_POLICY_VERSION = 1;
export const RELATIONSHIP_CONTACT_PURPOSE = "RELATIONSHIP_OUTREACH";

export type ContactDecisionStatusCode = "PROCEED" | "WAIT" | "BLOCKED" | "SUPPRESSED";
export type WhatsAppConsentState = "GRANTED" | "REVOKED" | "MISSING";
export type OpportunityStatusCode = "OPEN" | "SNOOZED" | "DISMISSED" | "RESOLVED";
export type OpportunityPriorityCode = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CustomerStatusCode = "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED";

export type ContactDecisionReasonCode =
  | "CONTACT_PREPARATION_ALLOWED"
  | "CUSTOMER_DO_NOT_CONTACT"
  | "CUSTOMER_ARCHIVED"
  | "WHATSAPP_MISSING"
  | "WHATSAPP_CONSENT_MISSING"
  | "WHATSAPP_CONSENT_REVOKED"
  | "OPPORTUNITY_SNOOZED"
  | "OPPORTUNITY_DISMISSED"
  | "OPPORTUNITY_RESOLVED"
  | "OPPORTUNITY_NOT_READY"
  | "HIGHER_PRIORITY_OPPORTUNITY";

export type ContactDecisionFactCode =
  | "WHATSAPP_AVAILABLE"
  | "WHATSAPP_UNAVAILABLE"
  | "WHATSAPP_CONSENT_GRANTED"
  | "WHATSAPP_CONSENT_REVOKED"
  | "WHATSAPP_CONSENT_MISSING"
  | "CUSTOMER_STATUS"
  | "OPPORTUNITY_STATUS"
  | "OPPORTUNITY_TIMING";

export const contactDecisionReasonLabels: Record<ContactDecisionReasonCode, string> = {
  CONTACT_PREPARATION_ALLOWED: "Pode avançar para preparação do contato.",
  CUSTOMER_DO_NOT_CONTACT: "Cliente marcou não contatar.",
  CUSTOMER_ARCHIVED: "Cliente arquivada não pode avançar para contato.",
  WHATSAPP_MISSING: "WhatsApp não cadastrado.",
  WHATSAPP_CONSENT_MISSING: "Consentimento de WhatsApp não encontrado.",
  WHATSAPP_CONSENT_REVOKED: "Consentimento de WhatsApp foi revogado.",
  OPPORTUNITY_SNOOZED: "Oportunidade está adiada.",
  OPPORTUNITY_DISMISSED: "Oportunidade foi ignorada e não está mais acionável.",
  OPPORTUNITY_RESOLVED: "Oportunidade já foi resolvida e não está mais acionável.",
  OPPORTUNITY_NOT_READY: "Momento recomendado ainda não chegou.",
  HIGHER_PRIORITY_OPPORTUNITY: "Outra oportunidade mais prioritária está conduzindo o contato atual.",
};

export type ContactDecisionInput = {
  opportunityId: string;
  opportunityStatus: OpportunityStatusCode;
  priority: OpportunityPriorityCode;
  score: number;
  recommendedAt: Date;
  snoozedUntil: Date | null;
  customerStatus: CustomerStatusCode;
  whatsappNormalized: string | null;
  consentState: WhatsAppConsentState;
  asOf: Date;
};

export type ContactDecisionResult = {
  opportunityId: string;
  status: ContactDecisionStatusCode;
  eligibleAt: Date | null;
  primaryReasonCode: ContactDecisionReasonCode;
  suppressedByOpportunityId: string | null;
  reasons: Array<{ code: ContactDecisionReasonCode | ContactDecisionFactCode; label: string }>;
  facts: {
    customerStatus: CustomerStatusCode;
    whatsappAvailable: boolean;
    whatsappConsentState: WhatsAppConsentState;
    opportunityStatus: OpportunityStatusCode;
    recommendedAt: string;
    snoozedUntil: string | null;
  };
};

function dateKey(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function factualReasons(input: ContactDecisionInput) {
  return [
    {
      code: "CUSTOMER_STATUS" as const,
      label: `Status atual da cliente: ${input.customerStatus}.`,
    },
    input.whatsappNormalized
      ? { code: "WHATSAPP_AVAILABLE" as const, label: "WhatsApp cadastrado." }
      : { code: "WHATSAPP_UNAVAILABLE" as const, label: "WhatsApp não cadastrado." },
    input.consentState === "GRANTED"
      ? { code: "WHATSAPP_CONSENT_GRANTED" as const, label: "Consentimento de WhatsApp concedido para relacionamento." }
      : input.consentState === "REVOKED"
        ? { code: "WHATSAPP_CONSENT_REVOKED" as const, label: "Consentimento de WhatsApp revogado para relacionamento." }
        : { code: "WHATSAPP_CONSENT_MISSING" as const, label: "Consentimento de WhatsApp não encontrado para relacionamento." },
    {
      code: "OPPORTUNITY_STATUS" as const,
      label: `Status atual da oportunidade: ${input.opportunityStatus}.`,
    },
    {
      code: "OPPORTUNITY_TIMING" as const,
      label: `Momento recomendado: ${dateKey(input.recommendedAt)}.`,
    },
  ];
}

function resultFor(
  input: ContactDecisionInput,
  status: ContactDecisionStatusCode,
  reason: ContactDecisionReasonCode,
  eligibleAt: Date | null = null,
): ContactDecisionResult {
  return {
    opportunityId: input.opportunityId,
    status,
    eligibleAt,
    primaryReasonCode: reason,
    suppressedByOpportunityId: null,
    reasons: [...factualReasons(input), { code: reason, label: contactDecisionReasonLabels[reason] }],
    facts: {
      customerStatus: input.customerStatus,
      whatsappAvailable: Boolean(input.whatsappNormalized),
      whatsappConsentState: input.consentState,
      opportunityStatus: input.opportunityStatus,
      recommendedAt: dateKey(input.recommendedAt)!,
      snoozedUntil: dateKey(input.snoozedUntil),
    },
  };
}

export function evaluateBaseContactDecision(input: ContactDecisionInput): ContactDecisionResult {
  if (input.opportunityStatus === "DISMISSED") return resultFor(input, "BLOCKED", "OPPORTUNITY_DISMISSED");
  if (input.opportunityStatus === "RESOLVED") return resultFor(input, "BLOCKED", "OPPORTUNITY_RESOLVED");
  if (input.customerStatus === "DO_NOT_CONTACT") return resultFor(input, "BLOCKED", "CUSTOMER_DO_NOT_CONTACT");
  if (input.customerStatus === "ARCHIVED") return resultFor(input, "BLOCKED", "CUSTOMER_ARCHIVED");
  if (!input.whatsappNormalized) return resultFor(input, "BLOCKED", "WHATSAPP_MISSING");
  if (input.consentState === "MISSING") return resultFor(input, "BLOCKED", "WHATSAPP_CONSENT_MISSING");
  if (input.consentState === "REVOKED") return resultFor(input, "BLOCKED", "WHATSAPP_CONSENT_REVOKED");
  if (input.opportunityStatus === "SNOOZED") return resultFor(input, "WAIT", "OPPORTUNITY_SNOOZED", input.snoozedUntil);
  if (diffCalendarDays(input.recommendedAt, input.asOf) > 0) return resultFor(input, "WAIT", "OPPORTUNITY_NOT_READY", input.recommendedAt);
  return resultFor(input, "PROCEED", "CONTACT_PREPARATION_ALLOWED");
}

const priorityWeight: Record<OpportunityPriorityCode, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

export function compareContactDecisionCandidates(left: ContactDecisionInput, right: ContactDecisionInput) {
  const priority = priorityWeight[right.priority] - priorityWeight[left.priority];
  if (priority) return priority;
  if (right.score !== left.score) return right.score - left.score;
  const timing = left.recommendedAt.getTime() - right.recommendedAt.getTime();
  if (timing) return timing;
  return left.opportunityId.localeCompare(right.opportunityId);
}

export function evaluateContactDecisionSet(inputs: ContactDecisionInput[]): ContactDecisionResult[] {
  const base = inputs.map((input) => evaluateBaseContactDecision(input));
  const proceeding = inputs
    .filter((input) => base.find((item) => item.opportunityId === input.opportunityId)?.status === "PROCEED")
    .sort(compareContactDecisionCandidates);
  const primaryOpportunityId = proceeding[0]?.opportunityId ?? null;
  if (!primaryOpportunityId) return base;

  return base.map((decision) => {
    if (decision.status !== "PROCEED" || decision.opportunityId === primaryOpportunityId) return decision;
    return {
      ...decision,
      status: "SUPPRESSED" as const,
      primaryReasonCode: "HIGHER_PRIORITY_OPPORTUNITY" as const,
      suppressedByOpportunityId: primaryOpportunityId,
      reasons: [
        ...decision.reasons.filter((reason) => reason.code !== "CONTACT_PREPARATION_ALLOWED"),
        {
          code: "HIGHER_PRIORITY_OPPORTUNITY" as const,
          label: contactDecisionReasonLabels.HIGHER_PRIORITY_OPPORTUNITY,
        },
      ],
    };
  });
}
