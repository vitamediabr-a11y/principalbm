import { notFound } from "next/navigation";
import { Baby, Pencil } from "lucide-react";
import { getCustomer360 } from "@/services/customer-service";
import { describeChildJourney } from "@/services/child-service";
import { hasPermission } from "@/lib/permissions";
import { AppError } from "@/lib/app-error";
import { genderLabels } from "@/lib/labels";
import { formatDatePtBr } from "@/domain/shared/date-only";
import { CustomerHeader } from "@/components/customers/customer-header";
import { CustomerTabs } from "@/components/customers/customer-tabs";
import { ChildForm } from "@/components/children/child-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Crianças" };

export default async function ChildrenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { customer, context } = await getCustomer360(id);
    const canEdit = hasPermission(context.role, "child:edit");

    return <div className="space-y-5">
      <CustomerHeader customer={customer} />
      <CustomerTabs customerId={customer.id} active="children" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.55fr)]">
        <section aria-labelledby="children-title"><div className="mb-3"><h2 id="children-title" className="text-lg font-bold">Crianças cadastradas</h2><p className="text-sm text-slate-500">Cada criança possui sua própria jornada.</p></div>{customer.children.length === 0 ? <Card className="p-6 text-center"><Baby className="mx-auto size-6 text-slate-400" /><h3 className="mt-3 font-bold">Nenhuma criança cadastrada</h3><p className="mt-1 text-sm text-slate-500">Não invente nome, tamanho ou data. Cadastre somente informações confirmadas.</p></Card> : <div className="grid gap-3 sm:grid-cols-2">{customer.children.map((child) => { const journey = describeChildJourney(child.birthDate); return <Card key={child.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words font-bold">{child.name ?? "Nome não informado"}</h3><p className="mt-1 text-sm text-slate-500">Nascimento: {formatDatePtBr(child.birthDate)}</p></div><Baby className="size-5 shrink-0 text-slate-400" /></div><div className="mt-3 flex flex-wrap gap-2"><Badge>{journey.age}</Badge><Badge>{journey.stage}</Badge></div><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-slate-500">Tamanho</dt><dd className="font-medium">{child.currentSize ?? "Não informado"}</dd><dt className="text-slate-500">Sexo</dt><dd className="font-medium">{child.gender ? genderLabels[child.gender] : "Não informado"}</dd></dl>{canEdit && <details className="mt-4 border-t border-slate-100 pt-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-sm font-semibold"><Pencil className="size-4" />Editar</summary><div className="mt-3"><ChildForm customerId={customer.id} childId={child.id} defaults={{ name: child.name ?? "", birthDate: child.birthDate.toISOString().slice(0, 10), gender: child.gender ?? undefined, currentSize: child.currentSize ?? "", preferences: child.preferences ?? "", notes: child.notes ?? "" }} /></div></details>}</Card>; })}</div>}</section>
        <aside>{canEdit ? <Card className="p-4 sm:p-5"><h2 className="font-bold">Adicionar criança</h2><p className="mt-1 text-sm text-slate-500">Pode ser usada mesmo sem gestação cadastrada.</p><div className="mt-5"><ChildForm customerId={customer.id} /></div></Card> : <Card className="p-4"><h2 className="font-bold">Acesso somente leitura</h2><p className="mt-1 text-sm text-slate-500">Seu perfil pode consultar as jornadas, mas não alterar dados de crianças.</p></Card>}</aside>
      </div>
    </div>;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
