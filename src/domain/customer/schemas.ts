import { z } from "zod";

export const customerSources = ["PHYSICAL_STORE", "WHATSAPP", "INSTAGRAM", "WEBSITE", "REFERRAL", "EVENT", "OTHER"] as const;
export const customerStatuses = ["CUSTOMER", "RECURRING", "VIP", "INACTIVE", "DO_NOT_CONTACT", "ARCHIVED"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const customerInputSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome.").max(180),
  whatsapp: optionalText(32),
  phone: optionalText(32),
  email: z.string().trim().email("E-mail inválido.").max(320).optional().or(z.literal("")),
  city: optionalText(120),
  source: z.enum(customerSources),
  responsibleMembershipId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(customerStatuses).default("CUSTOMER"),
  notes: optionalText(3000),
}).superRefine((value, ctx) => {
  if (!value.whatsapp?.trim() && !value.phone?.trim()) {
    ctx.addIssue({ code: "custom", path: ["whatsapp"], message: "Informe WhatsApp ou telefone com DDD." });
  }
});

export type CustomerInput = z.infer<typeof customerInputSchema>;
