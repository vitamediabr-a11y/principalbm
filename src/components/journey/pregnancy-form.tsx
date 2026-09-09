"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pregnancyInputSchema, genderValues, type PregnancyInput } from "@/domain/pregnancy/schemas";
import { createPregnancyAction, updatePregnancyAction } from "@/app/actions/lifecycle-actions";
import { genderLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PregnancyForm({ customerId, pregnancyId, defaults }: { customerId: string; pregnancyId?: string; defaults?: Partial<PregnancyInput> }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PregnancyInput>({
    resolver: zodResolver(pregnancyInputSchema),
    defaultValues: { expectedDueDate: "", babyName: "", commercialNotes: "", ...defaults },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = pregnancyId ? await updatePregnancyAction(customerId, pregnancyId, values) : await createPregnancyAction(customerId, values);
    if (!result.ok) return setServerError(result.error);
    if (!pregnancyId) reset({ expectedDueDate: "", babyName: "", commercialNotes: "" });
    router.refresh();
  });

  return <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
    <div><Label htmlFor={`dpp-${pregnancyId ?? "new"}`}>DPP</Label><Input id={`dpp-${pregnancyId ?? "new"}`} type="date" {...register("expectedDueDate")} />{errors.expectedDueDate && <p className="mt-1 text-sm text-red-700">{errors.expectedDueDate.message}</p>}</div>
    <div><Label htmlFor={`baby-${pregnancyId ?? "new"}`}>Nome do bebê <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`baby-${pregnancyId ?? "new"}`} {...register("babyName")} /></div>
    <div><Label htmlFor={`week-${pregnancyId ?? "new"}`}>Semana informada <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`week-${pregnancyId ?? "new"}`} type="number" min={1} max={40} inputMode="numeric" {...register("reportedPregnancyWeek", { setValueAs: (value) => value === "" ? undefined : Number(value) })} /></div>
    <div><Label htmlFor={`month-${pregnancyId ?? "new"}`}>Mês informado <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`month-${pregnancyId ?? "new"}`} type="number" min={1} max={9} inputMode="numeric" {...register("reportedPregnancyMonth", { setValueAs: (value) => value === "" ? undefined : Number(value) })} /></div>
    <div><Label htmlFor={`gender-${pregnancyId ?? "new"}`}>Sexo <span className="font-normal text-slate-400">(opcional)</span></Label><select id={`gender-${pregnancyId ?? "new"}`} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("gender", { setValueAs: (value) => value || undefined })}><option value="">Não informado</option>{genderValues.map((value) => <option key={value} value={value}>{genderLabels[value]}</option>)}</select></div>
    <div className="sm:col-span-2"><Label htmlFor={`pregnotes-${pregnancyId ?? "new"}`}>Observações comerciais</Label><Textarea id={`pregnotes-${pregnancyId ?? "new"}`} rows={3} {...register("commercialNotes")} /></div>
    {serverError && <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>}
    <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : pregnancyId ? "Salvar gestação" : "Adicionar gestação"}</Button></div>
  </form>;
}
