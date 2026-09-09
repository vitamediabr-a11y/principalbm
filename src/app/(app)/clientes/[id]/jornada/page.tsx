import { notFound } from "next/navigation";
import { AlertTriangle, Baby, CalendarDays, CheckCircle2 } from "lucide-react";
import { getCustomer360 } from "@/services/customer-service";
import { estimatePregnancy } from "@/services/pregnancy-service";
import { describeChildJourney } from "@/services/child-service";
import { hasPermission } from "@/lib/permissions";
import { AppError } from "@/lib/app-error";
import { lifecycleEventLabels } from "@/lib/labels";
import { formatDatePtBr } from "@/domain/shared/date-only";
import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { PregnancyForm } from "@/components/journey/pregnancy-form";
import { BirthConfirmationForm } from "@/components/journey/birth-confirmation-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Jornada" };

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { customer, context } = await getCustomer360(id);
    const canEdit = hasPermission(context.role, "lifecycle:edit");
    const canConfirmBirth = hasPermission(context.role, "birth:confirm");
    const activePregnancy = customer.pregnancies.find((pregnancy) => pregnancy.status === "ACTIVE");
    const history = customer.pregnancies.filter((pregnancy) => pregnancy.status !== "ACTIVE");
    const estimate = activePregnancy ? estimatePregnancy(activePregnancy.expectedDueDate) : null;

    return <div className="space-y-5">
      <CustomerHeader customer={customer} />
      <CustomerTabs customerId={customer.id} active="journey" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="space-y-4">
          <section aria-labelledby="pregnancy-title">
            <div className="mb-3 flex items-center justify-between"><h2 id="pregnancy-title" className="text-lg font-bold">Gestação</h2>{activePregnancy && <Badge>{estimate!.stage}</Badge>}</div>
            {activePregnancy ? <Card className="p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">DPP</p><p className="mt-1 font-semibold">{formatDatePtBr(activePregnancy.expectedDueDate)}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Semana estimada</p><p className="mt-1 font-semibold">{estimate!.estimatedWeek}ª semana</p><p className="text-xs text-slate-400">Estimativa comercial</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mês estimado</p><p className="mt-1 font-semibold">{estimate!.estimatedMonth}º mês</p><p className="text-xs text-slate-400">Estimativa comercial</p></div></div>
              {estimate!.dueDatePassed && <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">Aguardando atualização</p><p>Data prevista ultrapassada — aguardando atualização da cliente.</p><p className="mt-1 text-xs">Nenhum nascimento foi inferido a partir da DPP.</p></div></div>}
              {activePregnancy.babyName && <p className="mt-4 text-sm text-slate-600">Nome informado: <span className="font-semibold text-slate-900">{activePregnancy.babyName}</span></p>}
              {canEdit && <details className="mt-5 border-t border-slate-100 pt-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Editar dados da gestação</summary><div className="mt-3"><PregnancyForm customerId={customer.id} pregnancyId={activePregnancy.id} defaults={{ expectedDueDate: activePregnancy.expectedDueDate.toISOString().slice(0, 10), reportedPregnancyWeek: activePregnancy.reportedPregnancyWeek ?? undefined, reportedPregnancyMonth: activePregnancy.reportedPregnancyMonth ?? undefined, babyName: activePregnancy.babyName ?? "", gender: activePregnancy.gender ?? undefined, commercialNotes: activePregnancy.commercialNotes ?? "" }} /></div></details>}
              {canConfirmBirth && <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Confirmar nascimento</summary><p className="mb-4 text-sm text-slate-600">Use apenas quando a cliente informar a data real de nascimento.</p><BirthConfirmationForm customerId={customer.id} pregnancyId={activePregnancy.id} children={customer.children.map((child) => ({ id: child.id, name: child.name, birthDate: child.birthDate.toISOString().slice(0, 10) }))} /></details>}
            </Card> : <Card className="p-4 sm:p-5"><p className="font-semibold">Nenhuma gestação ativa</p><p className="mt-1 text-sm text-slate-500">Gestação é um dado progressivo e não é obrigatória para cadastrar a cliente.</p>{canEdit && <details className="mt-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Adicionar gestação</summary><div className="mt-3"><PregnancyForm customerId={customer.id} /></div></details>}</Card>}
          </section>

          <section aria-labelledby="children-journey-title"><h2 id="children-journey-title" className="mb-3 text-lg font-bold">Jornadas das crianças</h2>{customer.children.length === 0 ? <Card className="p-4 text-sm text-slate-500">Nenhuma criança cadastrada.</Card> : <div className="grid gap-3 sm:grid-cols-2">{customer.children.map((child) => { const journey = describeChildJourney(child.birthDate); return <Card key={child.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">{child.name ?? "Nome não informado"}</h3><p className="mt-1 text-sm text-slate-500">Nascimento: {formatDatePtBr(child.birthDate)}</p></div><Baby className="size-5 text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><Badge>{journey.age}</Badge><Badge>{journey.stage}</Badge></div></Card>; })}</div>}</section>

          {history.length > 0 && <section><h2 className="mb-3 text-lg font-bold">Histórico de gestações</h2><div className="space-y-3">{history.map((pregnancy) => <Card key={pregnancy.id} className="p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">DPP: {formatDatePtBr(pregnancy.expectedDueDate)}</p><p className="mt-1 text-sm text-slate-500">{pregnancy.status === "COMPLETED" ? "Nascimento confirmado" : "Gestação arquivada"}{pregnancy.confirmedBirthDate ? ` em ${formatDatePtBr(pregnancy.confirmedBirthDate)}` : ""}</p></div>{pregnancy.status === "COMPLETED" ? <CheckCircle2 className="size-5 text-emerald-700" /> : <CalendarDays className="size-5 text-slate-400" />}</div></Card>)}</div></section>}
        </div>

        <aside><Card className="p-4 sm:p-5"><h2 className="font-bold">Linha do tempo</h2>{customer.lifecycleEvents.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhum evento de jornada registrado.</p> : <ol className="mt-4 space-y-4">{customer.lifecycleEvents.map((event) => <li key={event.id} className="relative border-l-2 border-slate-200 pl-4"><span className="absolute -left-[5px] top-1 size-2 rounded-full bg-slate-500" /><p className="text-sm font-semibold">{lifecycleEventLabels[event.type]}</p><p className="text-xs text-slate-500">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(event.occurredAt)}</p></li>)}</ol>}</Card></aside>
      </div>
    </div>;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
