"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  return <Button variant="ghost" size="sm" className="min-w-11" onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }} aria-label="Sair"><LogOut className="size-4" /><span className="hidden sm:inline">Sair</span></Button>;
}
