import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
export const genderValues = ["FEMALE", "MALE", "OTHER", "NOT_INFORMED"] as const;

export const pregnancyInputSchema = z.object({
  expectedDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a DPP."),
  reportedPregnancyWeek: z.number().int().min(1).max(40).optional(),
  reportedPregnancyMonth: z.number().int().min(1).max(9).optional(),
  babyName: optionalText(120),
  gender: z.enum(genderValues).optional(),
  commercialNotes: optionalText(3000),
});

export const birthConfirmationSchema = z.object({
  pregnancyId: z.string().uuid(),
  actualBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data real de nascimento."),
  existingChildId: z.string().uuid().optional().or(z.literal("")),
  childName: optionalText(120),
  gender: z.enum(genderValues).optional(),
  commercialNote: optionalText(3000),
});

export type PregnancyInput = z.infer<typeof pregnancyInputSchema>;
export type BirthConfirmationInput = z.infer<typeof birthConfirmationSchema>;
