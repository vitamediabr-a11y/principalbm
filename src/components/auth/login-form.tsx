"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "Informe sua senha."),
});

type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await authClient.signIn.email(values);
    if (result.error) {
      setServerError(result.error.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente novamente." : "E-mail ou senha inválidos.");
      return;
    }
    router.replace("/clientes");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" autoComplete="username" inputMode="email" {...register("email")} />
        {errors.email && <p className="mt-1 text-sm text-red-700">{errors.email.message}</p>}
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
        {errors.password && <p className="mt-1 text-sm text-red-700">{errors.password.message}</p>}
      </div>
      {serverError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Entrando..." : "Entrar"}</Button>
    </form>
  );
}
