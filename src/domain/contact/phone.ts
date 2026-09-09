import { AppError } from "@/lib/app-error";

export function normalizeBrazilianPhone(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("55") ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) {
    throw new AppError(422, "INVALID_PHONE", "Informe telefone/WhatsApp com DDD.");
  }
  return `+55${national}`;
}
