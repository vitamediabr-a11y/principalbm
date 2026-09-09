import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";
import { dateOnlyFromInstant, parseDateOnly } from "@/domain/shared/date-only";
import { pregnancyInputSchema, type PregnancyInput } from "@/domain/pregnancy/schemas";
import { calculatePregnancyEstimate } from "@/domain/pregnancy/pregnancy";
import { requireAuthContext, type AuthContext } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function blankToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapActivePregnancyConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "ACTIVE_PREGNANCY_EXISTS", "Já existe uma gestação ativa para esta cliente.");
  }
  throw error;
}

export async function createPregnancyWithContext(context: AuthContext, customerId: string, rawInput: PregnancyInput) {
  assertAuthorized({ role: context.role, active: true, organizationId: context.organizationId }, "lifecycle:edit");
  const input = pregnancyInputSchema.parse(rawInput);
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: context.organizationId }, select: { id: true } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");

  try {
    return await prisma.$transaction(async (tx) => {
      const pregnancy = await tx.pregnancy.create({
        data: {
          customerId,
          expectedDueDate: parseDateOnly(input.expectedDueDate),
          reportedPregnancyWeek: input.reportedPregnancyWeek,
          reportedPregnancyMonth: input.reportedPregnancyMonth,
          babyName: blankToNull(input.babyName),
          gender: input.gender,
          commercialNotes: blankToNull(input.commercialNotes),
        },
      });
      await tx.lifecycleEvent.create({
        data: {
          organizationId: context.organizationId,
          customerId,
          pregnancyId: pregnancy.id,
          type: "PREGNANCY_ADDED",
          metadata: { expectedDueDate: input.expectedDueDate },
        },
      });
      await writeAudit(tx, context, {
        action: "pregnancy.created",
        entityType: "Pregnancy",
        entityId: pregnancy.id,
        customerId,
        metadata: { expectedDueDate: input.expectedDueDate },
      });
      return pregnancy;
    });
  } catch (error) {
    mapActivePregnancyConflict(error);
  }
}

export async function createPregnancy(customerId: string, rawInput: PregnancyInput) {
  return createPregnancyWithContext(await requireAuthContext(), customerId, rawInput);
}

export async function updatePregnancyWithContext(context: AuthContext, pregnancyId: string, rawInput: PregnancyInput) {
  assertAuthorized({ role: context.role, active: true, organizationId: context.organizationId }, "lifecycle:edit");
  const input = pregnancyInputSchema.parse(rawInput);
  const pregnancy = await prisma.pregnancy.findFirst({
    where: { id: pregnancyId, customer: { organizationId: context.organizationId } },
    select: { id: true, customerId: true, expectedDueDate: true, status: true },
  });
  if (!pregnancy) throw new AppError(404, "PREGNANCY_NOT_FOUND", "Gestação não encontrada.");
  if (pregnancy.status !== "ACTIVE") throw new AppError(409, "PREGNANCY_NOT_ACTIVE", "Apenas gestações ativas podem ser alteradas.");
  const nextDueDate = parseDateOnly(input.expectedDueDate);
  const dueDateChanged = pregnancy.expectedDueDate.getTime() !== nextDueDate.getTime();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.pregnancy.update({
      where: { id: pregnancy.id },
      data: {
        expectedDueDate: nextDueDate,
        reportedPregnancyWeek: input.reportedPregnancyWeek,
        reportedPregnancyMonth: input.reportedPregnancyMonth,
        babyName: blankToNull(input.babyName),
        gender: input.gender,
        commercialNotes: blankToNull(input.commercialNotes),
        informationUpdatedAt: new Date(),
      },
    });
    if (dueDateChanged) {
      await tx.lifecycleEvent.create({
        data: {
          organizationId: context.organizationId,
          customerId: pregnancy.customerId,
          pregnancyId: pregnancy.id,
          type: "DUE_DATE_UPDATED",
          metadata: { expectedDueDate: input.expectedDueDate },
        },
      });
    }
    await writeAudit(tx, context, {
      action: "pregnancy.updated",
      entityType: "Pregnancy",
      entityId: pregnancy.id,
      customerId: pregnancy.customerId,
      metadata: { dueDateChanged },
    });
    return updated;
  });
}

export async function updatePregnancy(pregnancyId: string, rawInput: PregnancyInput) {
  return updatePregnancyWithContext(await requireAuthContext(), pregnancyId, rawInput);
}

export function estimatePregnancy(expectedDueDate: Date) {
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  return calculatePregnancyEstimate(expectedDueDate, today);
}
