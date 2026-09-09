import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/clientes");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10">
      <section className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="login-title">
        <div className="mb-7 flex size-11 items-center justify-center rounded-xl bg-slate-950 text-white"><LockKeyhole className="size-5" /></div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Acesso interno</p>
        <h1 id="login-title" className="mt-2 text-2xl font-black tracking-tight">Principal BM</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Entre com o e-mail corporativo cadastrado pela equipe responsável.</p>
        <div className="mt-7"><LoginForm /></div>
      </section>
    </main>
  );
}
