import Link from "next/link";
import { Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { listCustomers, getAssignableMembers } from "@/services/customer-service";
import { customerSources, customerStatuses } from "@/domain/customer/schemas";
import { hasPermission } from "@/lib/permissions";
import { sourceLabels, statusLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Clientes" };

type SearchParams = Promise<{ q?: string; status?: string; source?: string; responsible?: string; page?: string }>;

function buildHref(params: Record<string, string | undefined>, page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  search.set("page", String(page));
  return `/clientes?${search.toString()}`;
}

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = { search: params.q, status: params.status, source: params.source, responsibleMembershipId: params.responsible, page: Number(params.page || 1) };
  const [{ items, total, page, pageSize, context }, members] = await Promise.all([listCustomers(filters), getAssignableMembers()]);
  const canEdit = hasPermission(context.role, "customer:edit");
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return <div className="space-y-5">
    <div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Relacionamento</p><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Clientes</h1><p className="mt-1 text-sm text-slate-600">{total} {total === 1 ? "cliente encontrado" : "clientes encontrados"}</p></div>{canEdit && <Button asChild><Link href="/clientes/novo"><Plus className="size-4" />Novo cliente</Link></Button>}</div>

    <Card className="p-4">
      <form method="get" className="grid gap-3 md:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-slate-400" /><Input name="q" defaultValue={params.q} placeholder="Nome, telefone ou criança" className="pl-9" aria-label="Buscar clientes" /></div>
        <select name="status" defaultValue={params.status ?? ""} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Filtrar por status"><option value="">Todos os status</option>{customerStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>
        <select name="source" defaultValue={params.source ?? ""} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Filtrar por origem"><option value="">Todas as origens</option>{customerSources.map((value) => <option key={value} value={value}>{sourceLabels[value]}</option>)}</select>
        <select name="responsible" defaultValue={params.responsible ?? ""} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select>
        <Button type="submit" variant="secondary">Filtrar</Button>
      </form>
    </Card>

    {items.length === 0 ? <Card className="p-8 text-center"><h2 className="font-bold">Nenhum cliente encontrado</h2><p className="mt-1 text-sm text-slate-600">Ajuste os filtros ou cadastre o primeiro cliente.</p></Card> : <>
      <div className="space-y-3 md:hidden">{items.map((customer) => <Link key={customer.id} href={`/clientes/${customer.id}`} className="block"><Card className="p-4 transition hover:border-slate-300"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold">{customer.name}</h2><p className="mt-1 text-sm text-slate-600">{customer.whatsapp || customer.phone || "Contato não informado"}</p></div><Badge>{statusLabels[customer.status]}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><span>{sourceLabels[customer.source]}</span><span className="text-right">{customer.responsibleMembership?.user.name ?? "Sem responsável"}</span><span>{customer._count.children} {customer._count.children === 1 ? "criança" : "crianças"}</span><span className="text-right">{customer.city ?? "Cidade não informada"}</span></div></Card></Link>)}</div>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Jornadas</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((customer) => <tr key={customer.id} className="hover:bg-slate-50"><td className="px-4 py-3"><Link href={`/clientes/${customer.id}`} className="font-semibold hover:underline">{customer.name}</Link><p className="text-xs text-slate-500">{customer.whatsapp || customer.phone || "Contato não informado"}</p></td><td className="px-4 py-3"><Badge>{statusLabels[customer.status]}</Badge></td><td className="px-4 py-3">{sourceLabels[customer.source]}</td><td className="px-4 py-3">{customer.responsibleMembership?.user.name ?? "Sem responsável"}</td><td className="px-4 py-3">{customer._count.pregnancies} gest. · {customer._count.children} cri.</td></tr>)}</tbody></table></div>
    </>}

    {pages > 1 && <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Página {page} de {pages}</p><div className="flex gap-2"><Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-40" : ""}><Link href={buildHref({ q: params.q, status: params.status, source: params.source, responsible: params.responsible }, Math.max(1, page - 1))}><ChevronLeft className="size-4" />Anterior</Link></Button><Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-40" : ""}><Link href={buildHref({ q: params.q, status: params.status, source: params.source, responsible: params.responsible }, Math.min(pages, page + 1))}>Próxima<ChevronRight className="size-4" /></Link></Button></div></div>}
  </div>;
}
