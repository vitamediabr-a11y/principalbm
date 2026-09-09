"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerInputSchema, customerSources, customerStatuses, type CustomerInput } from "@/domain/customer/schemas";
import { createCustomerAction, updateCustomerAction } from "@/app/actions/customer-actions";
import { sourceLabels, statusLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MemberOption = { id: string; role: string; user: { name: string } };

export function CustomerForm({ mode, customerId, members, defaults }: { mode: "create" | "edit"; customerId?: string; members: MemberOption[]; defaults?: Partial<CustomerInput> }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerInput>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: {
      name: "", whatsapp: "", phone: "", email: "", city: "", source: "PHYSICAL_STORE", responsibleMembershipId: "", status: "CUSTOMER", notes: "", ...defaults,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = mode === "create" ? await createCustomerAction(values) : await updateCustomerAction(customerId!, values);
    if (!result.ok) return setServerError(result.error);
    router.push(`/clientes/${result.data.id}`);
    router.refresh();
  });

  const fieldError = (message?: string) => message ? <p className="mt-1 text-sm text-red-700">{message}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="name">Nome</Label><Input id="name" autoComplete="name" {...register("name")} />{fieldError(errors.name?.message)}</div>
        <div><Label htmlFor="whatsapp">WhatsApp</Label><Input id="whatsapp" inputMode="tel" autoComplete="tel" placeholder="(94) 99999-9999" {...register("whatsapp")} />{fieldError(errors.whatsapp?.message)}</div>
        <div><Label htmlFor="phone">Telefone</Label><Input id="phone" inputMode="tel" autoComplete="tel" placeholder="(94) 3333-3333" {...register("phone")} />{fieldError(errors.phone?.message)}</div>
        <div><Label htmlFor="email">E-mail <span className="font-normal text-slate-400">(opcional)</span></Label><Input id="email" type="email" inputMode="email" autoComplete="email" {...register("email")} />{fieldError(errors.email?.message)}</div>
        <div><Label htmlFor="city">Cidade</Label><Input id="city" autoComplete="address-level2" {...register("city")} />{fieldError(errors.city?.message)}</div>
        <div><Label htmlFor="source">Origem / canal</Label><select id="source" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("source")}>{customerSources.map((value) => <option key={value} value={value}>{sourceLabels[value]}</option>)}</select></div>
        <div><Label htmlFor="responsibleMembershipId">Responsável</Label><select id="responsibleMembershipId" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("responsibleMembershipId")}><option value="">Sem responsável</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name}</option>)}</select></div>
        <div><Label htmlFor="status">Status</Label><select id="status" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("status")}>{customerStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></div>
        <div className="sm:col-span-2"><Label htmlFor="notes">Observações</Label><Textarea id="notes" rows={4} {...register("notes")} />{fieldError(errors.notes?.message)}</div>
      </div>
      {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>}
      <div className="sticky bottom-[4.25rem] -mx-4 flex gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 md:bottom-0">
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : mode === "create" ? "Criar cliente" : "Salvar alterações"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
