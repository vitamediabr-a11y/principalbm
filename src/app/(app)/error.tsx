"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-xl font-bold">Não foi possível carregar esta área</h1><p className="mt-2 text-sm text-slate-600">Tente novamente. Se o problema continuar, verifique a conexão com o banco de dados.</p><Button className="mt-5" onClick={reset}>Tentar novamente</Button></div>;
}
