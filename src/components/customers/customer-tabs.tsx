import Link from "next/link";
import { cn } from "@/lib/cn";

const implemented = [
  ["overview", "Visão geral", ""],
  ["journey", "Jornada", "/jornada"],
  ["children", "Crianças", "/criancas"],
] as const;
const future = ["Compras", "Interações", "Oportunidades", "Preferências", "Tarefas", "Notas", "Consentimentos"];

export function CustomerTabs({ customerId, active }: { customerId: string; active: "overview" | "journey" | "children" }) {
  return <div className="border-b border-slate-200"><div className="flex flex-wrap gap-1 pb-2">{implemented.map(([key, label, suffix]) => <Link key={key} href={`/clientes/${customerId}${suffix}`} data-qa-hit-target="primary" className={cn("inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold", active === key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}>{label}</Link>)}{future.map((label) => <span key={label} aria-disabled="true" className="min-h-10 cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium text-slate-300" title="Módulo ainda não implementado">{label}</span>)}</div></div>;
}
