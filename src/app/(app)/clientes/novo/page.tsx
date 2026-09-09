import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { getAssignableMembers } from "@/services/customer-service";
import { requirePermission } from "@/services/auth-context";

export const metadata = { title: "Novo cliente" };

export default async function NewCustomerPage() {
  await requirePermission("customer:edit");
  const members = await getAssignableMembers();
  return <div className="mx-auto max-w-3xl"><div className="mb-5"><p className="text-sm font-semibold text-slate-500">Cadastro rápido</p><h1 className="text-2xl font-black tracking-tight">Novo cliente</h1><p className="mt-1 text-sm text-slate-600">Cadastre apenas o necessário agora. Gestação e crianças podem ser adicionadas depois.</p></div><Card className="p-4 sm:p-6"><CustomerForm mode="create" members={members} /></Card></div>;
}
