import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Baby, CalendarDays, History, Target } from "lucide-react";
import { getCustomer360 } from "@/services/customer-service";
import { getNextCustomerOpportunityWithContext } from "@/services/journey-opportunity-service";
import { getContactDecisionWithContext } from "@/services/contact-decision-service";
import { estimatePregnancy } from "@/services/pregnancy-service";
import { describeChildJourney } from "@/services/child-service";
import { AppError } from "@/lib/app-error";
import { auditActionLabels, journeyEventLabels, opportunityPriorityLabels, sourceLabels } from "@/lib/labels";
import { formatDatePtBr } from "@/domain/shared/date-only";
import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { ContactDecisionPanel } from "@/components/opportunities/contact-decision-panel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Cliente 360" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { customer, context } = await getCustomer360(id);
    const nextOpportunity = await getNextCustomerOpportunityWithContext(context, id);
    const nextContactDecision = nextOpportunity ? await getContactDecisionWithContext(context, nextOpportunity.id) : null;
    const activePregnancy = customer.pregnancies.find((pregnancy) => pregnancy.status === "ACTIVE");
    const pregnancyEstimate = activePregnancy ? estimatePregnancy(activePregnancy.expectedDueDate) : null;
    const activeJourneyCount = (activePregnancy ? 1 : 0) + customer.children.length;

    return <div className="space-y-5">
      <CustomerHeader customer={customer} />
      <CustomerTabs customerId={customer.id} active="overview" />

      {activeJourneyCount > 1 && <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">Esta cliente possui múltiplas jornadas independentes ativas.</div>}

      <section aria-labelledby="opportunity-summary-title">
        <Card className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Relacionamento</p><h2 id="opportunity-summary-title" className="mt-1 font-bold">Próxima oportunidade</h2></div><Target className="size-5 text-slate-400" /></div>
          {!nextOpportunity ? <p className="mt-3 text-sm text-slate-500">Nenhuma oportunidade no momento.</p> : <div className="mt-3"><div className="flex flex-wrap items-center gap-2"><Badge>{opportunityPriorityLabels[nextOpportunity.priority]}</Badge><span className="text-sm font-bold">Pontuação {nextOpportunity.score}</span></div><p className="mt-2 text-sm font-semibold text-slate-900">{nextOpportunity.reasonLabel}</p><p className="mt-1 text-sm text-slate-600">{nextOpportunity.journeyEvent.child ? `${nextOpportunity.journeyEvent.child.name ?? "Criança"} — ` : "Gestação — "}{journeyEventLabels[nextOpportunity.journeyEvent.type]}</p><p className="mt-2 text-xs text-slate-500">Momento recomendado: {formatDatePtBr(nextOpportunity.recommendedAt)}</p><div className="mt-4"><ContactDecisionPanel decision={nextContactDecision} showEvidence /></div><Link href={`/clientes/${customer.id}/oportunidades`} data-qa-hit-target="primary" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-slate-700 hover:underline">Ver oportunidades <ArrowRight className="size-4" /></Link></div>}
        </Card>
      </section>

      <section aria-labelledby="journeys-title" className="space-y-3">
        <div className="flex items-center justify-between"><h2 id="journeys-title" className="text-lg font-bold">Jornadas</h2><Link href={`/clientes/${customer.id}/jornada`} data-qa-hit-target="primary" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-slate-700 hover:underline">Ver jornada <ArrowRight className="size-4" /></Link></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {activePregnancy ? <Card className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gestação</p><h3 className="mt-1 font-bold">{pregnancyEstimate!.stage}</h3></div><CalendarDays className="size-5 text-slate-400" /></div><p className="mt-3 text-sm text-slate-600">DPP: {formatDatePtBr(activePregnancy.expectedDueDate)}</p>{pregnancyEstimate!.dueDatePassed && <p className="mt-2 text-sm font-semibold text-amber-800">Data prevista ultrapassada — aguardando atualização da cliente.</p>}</Card> : <Card className="p-4"><p className="font-semibold">Nenhuma gestação ativa</p><p className="mt-1 text-sm text-slate-500">A cliente pode ter crianças cadastradas sem ter entrado pelo período de gestação.</p></Card>}
          {customer.children.length === 0 ? <Card className="p-4"><p className="font-semibold">Nenhuma criança cadastrada</p><p className="mt-1 text-sm text-slate-500">Adicione uma criança quando houver informação factual.</p></Card> : customer.children.map((child) => { const journey = describeChildJourney(child.birthDate); return <Card key={child.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Criança</p><h3 className="mt-1 font-bold">{child.name ?? "Nome não informado"}</h3></div><Baby className="size-5 text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><Badge>{journey.age}</Badge><Badge>{journey.stage}</Badge></div><p className="mt-3 text-sm text-slate-600">Tamanho atual: {child.currentSize ?? "Não informado"}</p></Card>; })}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4"><h2 className="font-bold">Dados do relacionamento</h2><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm"><dt className="text-slate-500">Origem</dt><dd className="font-medium">{sourceLabels[customer.source]}</dd><dt className="text-slate-500">Cidade</dt><dd className="font-medium">{customer.city ?? "Não informada"}</dd><dt className="text-slate-500">E-mail</dt><dd className="min-w-0 break-all font-medium">{customer.email ?? "Não informado"}</dd><dt className="text-slate-500">Cadastro</dt><dd className="font-medium">{formatDatePtBr(customer.registeredAt)}</dd></dl>{customer.notes && <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{customer.notes}</p></div>}</Card>
        <Card className="p-4"><div className="flex items-center gap-2"><History className="size-5 text-slate-400" /><h2 className="font-bold">Auditoria recente</h2></div>{customer.auditLogs.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum evento de auditoria registrado.</p> : <ol className="mt-4 space-y-3">{customer.auditLogs.slice(0, 8).map((log) => <li key={log.id} className="border-l-2 border-slate-200 pl-3"><p className="text-sm font-semibold">{auditActionLabels[log.action] ?? log.action}</p><p className="text-xs text-slate-500">{log.actorUser?.name ?? "Sistema"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(log.createdAt)}</p></li>)}</ol>}</Card>
      </section>
    </div>;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
