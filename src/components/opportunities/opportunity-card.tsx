import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { CalendarClock, ChevronRight } from "lucide-react";
import { dateOnlyFromInstant, diffCalendarDays, formatDatePtBr } from "@/domain/shared/date-only";
import { env } from "@/lib/env";
import { journeyEventLabels, opportunityPriorityLabels, opportunityStatusLabels } from "@/lib/labels";
import { dismissOpportunityAction, snoozeOpportunityAction } from "@/app/actions/opportunity-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type OpportunityCardItem = Prisma.OpportunityGetPayload<{
  include: {
    customer: { select: { id: true; name: true; status: true } };
    journeyEvent: {
      select: {
        type: true;
        effectiveAt: true;
        status: true;
        pregnancy: { select: { expectedDueDate: true } };
        child: { select: { name: true; birthDate: true } };
      };
    };
    responsibleMembership: { select: { id: true; user: { select: { name: true } } } };
  };
}>;

function explanationFactors(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  const factors = (value as Record<string, Prisma.JsonValue>).factors;
  if (!Array.isArray(factors)) return [];
  return factors.flatMap((factor) => {
    if (!factor || Array.isArray(factor) || typeof factor !== "object") return [];
    const item = factor as Record<string, Prisma.JsonValue>;
    return typeof item.label === "string" && typeof item.points === "number"
      ? [{ label: item.label, points: item.points }]
      : [];
  });
}

function timingLabel(date: Date) {
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  const days = diffCalendarDays(date, today);
  if (days === 0) return `Hoje · ${formatDatePtBr(date)}`;
  if (days > 0) return `Em ${days} ${days === 1 ? "dia" : "dias"} · ${formatDatePtBr(date)}`;
  const overdue = Math.abs(days);
  return `Há ${overdue} ${overdue === 1 ? "dia" : "dias"} · ${formatDatePtBr(date)}`;
}

function sourceLabel(item: OpportunityCardItem) {
  const child = item.journeyEvent.child;
  if (child) return `${child.name ?? "Criança"} — ${journeyEventLabels[item.journeyEvent.type]}`;
  return `Gestação — ${journeyEventLabels[item.journeyEvent.type]}`;
}

export function OpportunityCard({ opportunity, canManage }: { opportunity: OpportunityCardItem; canManage: boolean }) {
  const factors = explanationFactors(opportunity.scoreExplanation);
  const actionable = opportunity.status === "OPEN" || opportunity.status === "SNOOZED";

  return <Card className="min-w-0 p-4 sm:p-5" data-qa-opportunity-card>
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{opportunityPriorityLabels[opportunity.priority]}</Badge>
          <Badge>{opportunityStatusLabels[opportunity.status]}</Badge>
          <span className="text-sm font-bold text-slate-700">Pontuação {opportunity.score}</span>
        </div>
        <h2 className="mt-3 break-words text-lg font-bold text-slate-950">{opportunity.customer.name}</h2>
        <p className="mt-1 break-words text-sm font-semibold text-slate-600">{sourceLabel(opportunity)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Por que agora?</p><p className="mt-1 text-sm text-slate-800">{opportunity.reasonLabel}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Momento recomendado</p><p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarClock className="size-4 shrink-0 text-slate-400" />{timingLabel(opportunity.recommendedAt)}</p></div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ação sugerida</p><p className="mt-1 text-sm text-slate-800">{opportunity.suggestedAction}</p><p className="mt-2 text-xs text-slate-500">Canal de contato ainda não foi validado nesta etapa.</p></div>

        {factors.length > 0 && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700">Por que esta pontuação?</summary><ul className="space-y-1 text-sm text-slate-600">{factors.map((factor) => <li key={factor.label} className="flex justify-between gap-4"><span>{factor.label}</span><span className="font-semibold">+{factor.points}</span></li>)}</ul></details>}

        <p className="mt-3 text-xs text-slate-500">Responsável: {opportunity.responsibleMembership?.user.name ?? "Não definido"}</p>
        {opportunity.status === "SNOOZED" && opportunity.snoozedUntil && <p className="mt-1 text-xs font-semibold text-slate-600">Adiada até {formatDatePtBr(opportunity.snoozedUntil)}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 lg:max-w-52 lg:justify-end">
        <Link href={`/clientes/${opportunity.customer.id}`} data-qa-hit-target="primary" className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">Ver cliente <ChevronRight className="size-4" /></Link>
        {canManage && actionable && <><form action={snoozeOpportunityAction}><input type="hidden" name="opportunityId" value={opportunity.id} /><button type="submit" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Adiar 7 dias</button></form><form action={dismissOpportunityAction}><input type="hidden" name="opportunityId" value={opportunity.id} /><button type="submit" className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Ignorar</button></form></>}
      </div>
    </div>
  </Card>;
}
