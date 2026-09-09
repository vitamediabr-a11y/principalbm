import { z } from "zod";
import { genderValues } from "@/domain/pregnancy/schemas";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const childInputSchema = z.object({
  name: optionalText(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento."),
  gender: z.enum(genderValues).optional(),
  currentSize: optionalText(20),
  preferences: optionalText(3000),
  notes: optionalText(3000),
});

export type ChildInput = z.infer<typeof childInputSchema>;
