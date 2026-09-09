import Link from "next/link";
import { RefreshCw, Target } from "lucide-react";
import { listOpportunities } from "@/services/journey-opportunity-service";
import { hasPermission } from "@/lib/permissions";
import { opportunityPriorityLabels, opportunityStatusLabels } from "@/lib/labels";
import { refreshOpportunitiesAction } from "@/app/actions/opportunity-actions";
import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Oportunidades" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const result = await listOpportunities({
    status: first(params.status),
    priority: first(params.priority),
    responsibleMembershipId: first(params.responsible),
    source: first(params.source),
    timing: first(params.timing),
    customer: first(params.customer),
  });
  const canManage = hasPermission(result.context.role, "opportunity:manage");

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-xl bg-slate-950 p-2 text-white"><Target className="size-5" /></div>
        <div className="min-w-0"><h1 className="text-2xl font-black tracking-tight">Oportunidades</h1><p className="mt-1 text-sm text-slate-600">Quem merece atenção agora, por qual motivo e em qual momento.</p></div>
      </div>
      {canManage && <form action={refreshOpportunitiesAction}><button type="submit" data-qa-refresh-opportunities className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white sm:w-auto"><RefreshCw className="size-4" />Atualizar oportunidades</button></form>}
    </div>

    <Card className="p-4">
      <form role="search" aria-label="Filtrar oportunidades" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <label className="text-sm font-semibold text-slate-700 xl:col-span-2">Cliente<input name="customer" type="search" defaultValue={result.applied.customer} placeholder="Buscar cliente" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400" /></label>
        <label className="text-sm font-semibold text-slate-700">Status<select name="status" defaultValue={result.applied.status} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="OPEN">Abertas</option><option value="SNOOZED">Adiadas</option><option value="DISMISSED">Ignoradas</option><option value="RESOLVED">Resolvidas</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Prioridade<select name="priority" defaultValue={result.applied.priority ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Todas</option>{Object.entries(opportunityPriorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Jornada<select name="source" defaultValue={result.applied.source ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Todas</option><option value="PREGNANCY">Gestação</option><option value="CHILD">Criança</option></select></label>
        <label className="text-sm font-semibold text-slate-700">Momento<select name="timing" defaultValue={result.applied.timing ?? ""} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Todos</option><option value="OVERDUE">Atrasadas</option><option value="TODAY">Hoje</option><option value="UPCOMING">Próximas</option></select></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2 xl:col-span-3">Responsável<select name="responsible" defaultValue={result.applied.responsibleMembershipId} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Todos</option>{result.members.map((member) => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select></label>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-3"><button type="submit" className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Aplicar filtros</button><Link href="/oportunidades" data-qa-hit-target="primary" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Limpar</Link></div>
      </form>
    </Card>

    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-600">{result.items.length} {result.items.length === 1 ? "oportunidade" : "oportunidades"}</p><p className="hidden text-xs text-slate-400 sm:block">Ordenadas por prioridade, pontuação e momento recomendado.</p></div>

    {result.items.length === 0 ? <Card className="p-6 text-center"><h2 className="font-bold">Nenhuma oportunidade no momento</h2><p className="mt-2 text-sm text-slate-500">Os filtros atuais não retornaram nenhuma oportunidade real.</p>{canManage && <p className="mt-2 text-xs text-slate-400">Use “Atualizar oportunidades” para detectar novos marcos de jornada.</p>}</Card> : <div className="space-y-3">{result.items.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} canManage={canManage} />)}</div>}

    {!canManage && <p className="text-xs text-slate-500">Seu perfil possui acesso de leitura. Alterações operacionais de oportunidades estão desabilitadas.</p>}
    <span className="sr-only">{opportunityStatusLabels[result.applied.status ?? "OPEN"]}</span>
  </div>;
}
