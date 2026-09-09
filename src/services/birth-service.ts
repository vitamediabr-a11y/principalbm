import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";
import { birthConfirmationSchema, type BirthConfirmationInput } from "@/domain/pregnancy/schemas";
import { dateOnlyFromInstant, parseDateOnly } from "@/domain/shared/date-only";
import { requireAuthContext, type AuthContext } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function blankToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type BirthConfirmationVerificationHooks = {
  beforeCommit?: () => void | Promise<void>;
};

async function runSerializableConfirmation(
  context: AuthContext,
  input: BirthConfirmationInput,
  hooks?: BirthConfirmationVerificationHooks,
) {
  const actualBirthDate = parseDateOnly(input.actualBirthDate);
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  if (actualBirthDate.getTime() > today.getTime()) throw new AppError(422, "FUTURE_BIRTH_DATE", "A data de nascimento não pode estar no futuro.");

  return prisma.$transaction(async (tx) => {
    const pregnancy = await tx.pregnancy.findFirst({
      where: { id: input.pregnancyId, customer: { organizationId: context.organizationId } },
      select: { id: true, customerId: true, status: true, confirmedBirthDate: true, confirmedChildId: true },
    });
    if (!pregnancy) throw new AppError(404, "PREGNANCY_NOT_FOUND", "Gestação não encontrada.");
    if (pregnancy.status !== "ACTIVE" || pregnancy.confirmedBirthDate || pregnancy.confirmedChildId) throw new AppError(409, "BIRTH_ALREADY_CONFIRMED", "O nascimento desta gestação já foi confirmado.");

    let childId: string;
    if (input.existingChildId) {
      const child = await tx.child.findFirst({
        where: { id: input.existingChildId, customerId: pregnancy.customerId, customer: { organizationId: context.organizationId } },
        select: { id: true, birthDate: true },
      });
      if (!child) throw new AppError(422, "INVALID_CHILD_LINK", "A criança selecionada não pertence a esta cliente.");
      if (child.birthDate.getTime() !== actualBirthDate.getTime()) throw new AppError(422, "BIRTH_DATE_CONFLICT", "A data informada é diferente da data de nascimento cadastrada para a criança.");
      childId = child.id;
    } else {
      const child = await tx.child.create({ data: { customerId: pregnancy.customerId, name: blankToNull(input.childName), birthDate: actualBirthDate, gender: input.gender, notes: blankToNull(input.commercialNote) } });
      childId = child.id;
    }

    const updated = await tx.pregnancy.updateMany({
      where: { id: pregnancy.id, status: "ACTIVE", confirmedBirthDate: null, confirmedChildId: null },
      data: { status: "COMPLETED", confirmedBirthDate: actualBirthDate, confirmedChildId: childId, informationUpdatedAt: new Date() },
    });
    if (updated.count !== 1) throw new AppError(409, "BIRTH_ALREADY_CONFIRMED", "O nascimento desta gestação já foi confirmado.");

    await tx.lifecycleEvent.create({ data: { organizationId: context.organizationId, customerId: pregnancy.customerId, pregnancyId: pregnancy.id, childId, type: "BIRTH_CONFIRMED", metadata: { actualBirthDate: input.actualBirthDate } } });
    await writeAudit(tx, context, { action: "pregnancy.birth_confirmed", entityType: "Pregnancy", entityId: pregnancy.id, customerId: pregnancy.customerId, metadata: { childId, linkedExistingChild: Boolean(input.existingChildId) } });
    await hooks?.beforeCommit?.();
    return { childId, pregnancyId: pregnancy.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function confirmBirthWithContext(
  context: AuthContext,
  rawInput: BirthConfirmationInput,
  hooks?: BirthConfirmationVerificationHooks,
) {
  assertAuthorized({ role: context.role, active: true, organizationId: context.organizationId }, "birth:confirm");
  const input = birthConfirmationSchema.parse(rawInput);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await runSerializableConfirmation(context, input, hooks);
    } catch (error) {
      lastError = error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw lastError;
}

export async function confirmBirth(rawInput: BirthConfirmationInput) {
  const context = await requireAuthContext();
  return confirmBirthWithContext(context, rawInput);
}
