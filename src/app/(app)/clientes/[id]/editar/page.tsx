import { notFound } from "next/navigation";
import { CustomerForm } from "@/components/customers/customer-form";
import { Card } from "@/components/ui/card";
import { getAssignableMembers, getCustomer360 } from "@/services/customer-service";
import { requirePermission } from "@/services/auth-context";
import { AppError } from "@/lib/app-error";

export const metadata = { title: "Editar cliente" };

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("customer:edit");
  try {
    const [{ customer }, members] = await Promise.all([getCustomer360(id), getAssignableMembers()]);
    return <div className="mx-auto max-w-3xl"><div className="mb-5"><p className="text-sm font-semibold text-slate-500">Cliente</p><h1 className="break-words text-2xl font-black tracking-tight">Editar {customer.name}</h1></div><Card className="p-4 sm:p-6"><CustomerForm mode="edit" customerId={customer.id} members={members} defaults={{ name: customer.name, whatsapp: customer.whatsapp ?? "", phone: customer.phone ?? "", email: customer.email ?? "", city: customer.city ?? "", source: customer.source, responsibleMembershipId: customer.responsibleMembershipId ?? "", status: customer.status, notes: customer.notes ?? "" }} /></Card></div>;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
