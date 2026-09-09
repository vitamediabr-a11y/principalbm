import Link from "next/link";
import { UsersRound } from "lucide-react";
import type { AuthContext } from "@/services/auth-context";
import { roleLabels } from "@/lib/labels";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AppShell({ context, children }: { context: AuthContext; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="min-w-0">
            <Link href="/clientes" className="text-sm font-black tracking-tight text-slate-950">PRINCIPAL BM</Link>
            <p className="truncate text-xs text-slate-500">{context.organizationName}</p>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
            <Link href="/clientes" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Clientes</Link>
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
      <main className="mx-auto max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-7 md:pb-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-3 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden" aria-label="Navegação móvel">
        <Link href="/clientes" className="mx-auto flex min-h-12 max-w-48 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-semibold text-slate-900"><UsersRound className="size-5" />Clientes</Link>
      </nav>
    </div>
  );
}
