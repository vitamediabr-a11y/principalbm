"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { birthConfirmationSchema, genderValues, type BirthConfirmationInput } from "@/domain/pregnancy/schemas";
import { confirmBirthAction } from "@/app/actions/lifecycle-actions";
import { genderLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ChildOption = { id: string; name: string | null; birthDate: Date };

export function BirthConfirmationForm({ customerId, pregnancyId, children }: { customerId: string; pregnancyId: string; children: ChildOption[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm<BirthConfirmationInput>({
    resolver: zodResolver(birthConfirmationSchema),
    defaultValues: { pregnancyId, actualBirthDate: "", existingChildId: "", childName: "", commercialNote: "" },
  });
  const existingChildId = watch("existingChildId");

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await confirmBirthAction(customerId, values);
    if (!result.ok) return setServerError(result.error);
    router.refresh();
  });

  return <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
    <input type="hidden" {...register("pregnancyId")} />
    <div><Label htmlFor={`birth-${pregnancyId}`}>Data real de nascimento</Label><Input id={`birth-${pregnancyId}`} type="date" {...register("actualBirthDate")} />{errors.actualBirthDate && <p className="mt-1 text-sm text-red-700">{errors.actualBirthDate.message}</p>}</div>
    <div><Label htmlFor={`existing-child-${pregnancyId}`}>Vincular criança já cadastrada <span className="font-normal text-slate-400">(opcional)</span></Label><select id={`existing-child-${pregnancyId}`} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("existingChildId")}><option value="">Criar nova criança</option>{children.map((child) => <option key={child.id} value={child.id}>{child.name ?? "Sem nome"} · {new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(child.birthDate)}</option>)}</select></div>
    {!existingChildId && <><div><Label htmlFor={`child-name-${pregnancyId}`}>Nome da criança <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`child-name-${pregnancyId}`} {...register("childName")} /></div><div><Label htmlFor={`birth-gender-${pregnancyId}`}>Sexo <span className="font-normal text-slate-400">(opcional)</span></Label><select id={`birth-gender-${pregnancyId}`} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("gender", { setValueAs: (value) => value || undefined })}><option value="">Não informado</option>{genderValues.map((value) => <option key={value} value={value}>{genderLabels[value]}</option>)}</select></div></>}
    <div className="sm:col-span-2"><Label htmlFor={`birth-note-${pregnancyId}`}>Observação comercial <span className="font-normal text-slate-400">(opcional)</span></Label><Textarea id={`birth-note-${pregnancyId}`} rows={3} {...register("commercialNote")} /></div>
    {serverError && <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>}
    <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Confirmando..." : "Confirmar nascimento"}</Button></div>
  </form>;
}
