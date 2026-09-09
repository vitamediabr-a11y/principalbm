import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4"><div><p className="text-sm font-semibold text-slate-500">404</p><h1 className="mt-2 text-2xl font-black">Registro não encontrado</h1><p className="mt-2 text-slate-600">O conteúdo pode ter sido removido ou não pertence à sua organização.</p><Button asChild className="mt-5"><Link href="/clientes">Voltar para clientes</Link></Button></div></main>;
}
