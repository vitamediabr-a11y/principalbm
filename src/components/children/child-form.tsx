"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { childInputSchema, type ChildInput } from "@/domain/child/schemas";
import { genderValues } from "@/domain/pregnancy/schemas";
import { createChildAction, updateChildAction } from "@/app/actions/lifecycle-actions";
import { genderLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ChildForm({ customerId, childId, defaults }: { customerId: string; childId?: string; defaults?: Partial<ChildInput> }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ChildInput>({
    resolver: zodResolver(childInputSchema),
    defaultValues: { name: "", birthDate: "", currentSize: "", preferences: "", notes: "", ...defaults },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = childId ? await updateChildAction(customerId, childId, values) : await createChildAction(customerId, values);
    if (!result.ok) return setServerError(result.error);
    if (!childId) reset({ name: "", birthDate: "", currentSize: "", preferences: "", notes: "" });
    router.refresh();
  });

  return <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
    <div><Label htmlFor={`child-name-${childId ?? "new"}`}>Nome <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`child-name-${childId ?? "new"}`} {...register("name")} /></div>
    <div><Label htmlFor={`child-birth-${childId ?? "new"}`}>Data de nascimento</Label><Input id={`child-birth-${childId ?? "new"}`} type="date" {...register("birthDate")} />{errors.birthDate && <p className="mt-1 text-sm text-red-700">{errors.birthDate.message}</p>}</div>
    <div><Label htmlFor={`child-gender-${childId ?? "new"}`}>Sexo <span className="font-normal text-slate-400">(opcional)</span></Label><select id={`child-gender-${childId ?? "new"}`} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" {...register("gender", { setValueAs: (value) => value || undefined })}><option value="">Não informado</option>{genderValues.map((value) => <option key={value} value={value}>{genderLabels[value]}</option>)}</select></div>
    <div><Label htmlFor={`child-size-${childId ?? "new"}`}>Tamanho atual <span className="font-normal text-slate-400">(opcional)</span></Label><Input id={`child-size-${childId ?? "new"}`} placeholder="Ex.: RN, P, M, 2" {...register("currentSize")} /></div>
    <div className="sm:col-span-2"><Label htmlFor={`child-pref-${childId ?? "new"}`}>Preferências</Label><Textarea id={`child-pref-${childId ?? "new"}`} rows={2} {...register("preferences")} /></div>
    <div className="sm:col-span-2"><Label htmlFor={`child-notes-${childId ?? "new"}`}>Observações</Label><Textarea id={`child-notes-${childId ?? "new"}`} rows={3} {...register("notes")} /></div>
    {serverError && <div role="alert" className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>}
    <div className="sm:col-span-2"><Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : childId ? "Salvar criança" : "Adicionar criança"}</Button></div>
  </form>;
}
