import Link from "next/link";
import { Target, UsersRound } from "lucide-react";
import type { AuthContext } from "@/services/auth-context";
import { roleLabels } from "@/lib/labels";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AppShell({ context, children }: { context: AuthContext; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="min-w-0">
            <Link href="/clientes" data-qa-hit-target="primary" className="inline-flex min-h-11 items-center text-sm font-black tracking-tight text-slate-950">PRINCIPAL BM</Link>
            <p className="truncate text-xs text-slate-500">{context.organizationName}</p>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            <Link href="/oportunidades" data-qa-hit-target="primary" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Oportunidades</Link>
            <Link href="/clientes" data-qa-hit-target="primary" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">Clientes</Link>
          </nav>
          <div className="flex min-w-0 items-center gap-2">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-40 truncate text-sm font-semibold">{context.userName}</p>
              <p className="text-xs text-slate-500">{roleLabels[context.role]}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 md:pb-8">{children}</main>
      <nav data-qa-mobile-nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden" aria-label="Navegação móvel">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
          <Link href="/oportunidades" data-qa-hit-target="primary" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-2 text-sm font-semibold text-white"><Target className="size-5" />Oportunidades</Link>
          <Link href="/clientes" data-qa-hit-target="primary" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-100 px-2 text-sm font-semibold text-slate-900"><UsersRound className="size-5" />Clientes</Link>
        </div>
      </nav>
    </div>
  );
}
