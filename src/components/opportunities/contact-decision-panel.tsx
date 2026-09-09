import type { ContactDecision, Prisma } from "@/generated/prisma/client";
import { formatDatePtBr } from "@/domain/shared/date-only";
import { env } from "@/lib/env";
import { contactDecisionStatusLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";

function parseDecisionJson(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") return { facts: null, reasons: [] as Array<{ code: string; label: string }> };
  const object = value as Record<string, Prisma.JsonValue>;
  const factsValue = object.facts;
  const reasonsValue = object.reasons;
  const facts = factsValue && !Array.isArray(factsValue) && typeof factsValue === "object"
    ? factsValue as Record<string, Prisma.JsonValue>
    : null;
  const reasons = Array.isArray(reasonsValue)
    ? reasonsValue.flatMap((item) => {
        if (!item || Array.isArray(item) || typeof item !== "object") return [];
        const reason = item as Record<string, Prisma.JsonValue>;
        return typeof reason.code === "string" && typeof reason.label === "string"
          ? [{ code: reason.code, label: reason.label }]
          : [];
      })
    : [];
  return { facts, reasons };
}

function consentLabel(value: Prisma.JsonValue | undefined) {
  if (value === "GRANTED") return "Concedido";
  if (value === "REVOKED") return "Revogado";
  if (value === "MISSING") return "Não encontrado";
  return "Não avaliado";
}

function evaluatedAtLabel(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: env.APP_TIME_ZONE,
  }).format(value);
}

export function ContactDecisionPanel({
  decision,
  showEvidence = false,
}: {
  decision: ContactDecision | null;
  showEvidence?: boolean;
}) {
  if (!decision) {
    return <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3" data-qa-contact-decision>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Decisão de contato</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">Decisão ainda não avaliada.</p>
      <p className="mt-2 text-xs text-slate-500">Nenhuma mensagem foi enviada nesta etapa.</p>
    </div>;
  }

  const parsed = parseDecisionJson(decision.reasonsJson);
  const primaryReason = parsed.reasons.find((reason) => reason.code === decision.primaryReasonCode)?.label
    ?? decision.primaryReasonCode;
  const whatsappAvailable = parsed.facts?.whatsappAvailable;
  const whatsappConsentState = parsed.facts?.whatsappConsentState;

  return <div className="rounded-xl border border-slate-200 bg-white p-3" data-qa-contact-decision>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Decisão de contato</p>
      <Badge>{contactDecisionStatusLabels[decision.status]}</Badge>
    </div>
    <p className="mt-2 text-sm font-semibold text-slate-800">{primaryReason}</p>
    {decision.status === "WAIT" && decision.eligibleAt && <p className="mt-1 text-xs text-slate-500">Pode ser reavaliada a partir de {formatDatePtBr(decision.eligibleAt)}.</p>}
    {showEvidence && <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
      <dt className="text-slate-500">Canal</dt><dd className="font-medium">{whatsappAvailable === true ? "WhatsApp cadastrado" : whatsappAvailable === false ? "WhatsApp não cadastrado" : "Não avaliado"}</dd>
      <dt className="text-slate-500">Consentimento WhatsApp</dt><dd className="font-medium">{consentLabel(whatsappConsentState)}</dd>
    </dl>}
    <p className="mt-2 text-xs text-slate-500">Avaliada em {evaluatedAtLabel(decision.evaluatedAt)}.</p>
    <p className="mt-2 text-xs font-medium text-slate-500">Nenhuma mensagem foi enviada nesta etapa.</p>
  </div>;
}
