import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireAuthContext } from "@/services/auth-context";
import { AppError } from "@/lib/app-error";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  try {
    const context = await requireAuthContext();
    return <AppShell context={context}>{children}</AppShell>;
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/login");
    throw error;
  }
}
