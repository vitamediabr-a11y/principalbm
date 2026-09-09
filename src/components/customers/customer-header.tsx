import Link from "next/link";
import { Phone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { statusLabels } from "@/lib/labels";

export function CustomerHeader({ customer }: { customer: { id: string; name: string; whatsapp: string | null; phone: string | null; status: string; responsibleMembership: { user: { name: string } } | null } }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="break-words text-2xl font-black tracking-tight sm:text-3xl">{customer.name}</h1><Badge>{statusLabels[customer.status]}</Badge></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span className="inline-flex items-center gap-1.5"><Phone className="size-4" />{customer.whatsapp || customer.phone || "Não informado"}</span><span>Responsável: {customer.responsibleMembership?.user.name ?? "Sem responsável"}</span></div></div><Button asChild variant="outline" className="w-full sm:w-auto"><Link href={`/clientes/${customer.id}/editar`}><Pencil className="size-4" />Editar cliente</Link></Button></div>;
}
