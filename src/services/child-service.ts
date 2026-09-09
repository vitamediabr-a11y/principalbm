import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";
import { childInputSchema, type ChildInput } from "@/domain/child/schemas";
import { dateOnlyFromInstant, parseDateOnly } from "@/domain/shared/date-only";
import { getChildStage, formatChildAge } from "@/domain/child/child";
import { requireAuthContext, type AuthContext } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function blankToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function validateBirthDate(value: string) {
  const birthDate = parseDateOnly(value);
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  if (birthDate.getTime() > today.getTime()) {
    throw new AppError(422, "FUTURE_BIRTH_DATE", "A data de nascimento não pode estar no futuro.");
  }
  return birthDate;
}

export async function createChildWithContext(context: AuthContext, customerId: string, rawInput: ChildInput) {
  assertAuthorized({ role: context.role, active: true, organizationId: context.organizationId }, "child:edit");
  const input = childInputSchema.parse(rawInput);
  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: context.organizationId }, select: { id: true } });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");
  const birthDate = validateBirthDate(input.birthDate);

  return prisma.$transaction(async (tx) => {
    const child = await tx.child.create({
      data: {
        customerId,
        name: blankToNull(input.name),
        birthDate,
        gender: input.gender,
        currentSize: blankToNull(input.currentSize),
        preferences: blankToNull(input.preferences),
        notes: blankToNull(input.notes),
      },
    });
    await tx.lifecycleEvent.create({
      data: { organizationId: context.organizationId, customerId, childId: child.id, type: "CHILD_ADDED" },
    });
    await writeAudit(tx, context, { action: "child.created", entityType: "Child", entityId: child.id, customerId });
    return child;
  });
}

export async function createChild(customerId: string, rawInput: ChildInput) {
  return createChildWithContext(await requireAuthContext(), customerId, rawInput);
}

export async function updateChildWithContext(context: AuthContext, childId: string, rawInput: ChildInput) {
  assertAuthorized({ role: context.role, active: true, organizationId: context.organizationId }, "child:edit");
  const input = childInputSchema.parse(rawInput);
  const existing = await prisma.child.findFirst({
    where: { id: childId, customer: { organizationId: context.organizationId } },
    select: { id: true, customerId: true },
  });
  if (!existing) throw new AppError(404, "CHILD_NOT_FOUND", "Criança não encontrada.");
  const birthDate = validateBirthDate(input.birthDate);

  return prisma.$transaction(async (tx) => {
    const child = await tx.child.update({
      where: { id: childId },
      data: {
        name: blankToNull(input.name),
        birthDate,
        gender: input.gender,
        currentSize: blankToNull(input.currentSize),
        preferences: blankToNull(input.preferences),
        notes: blankToNull(input.notes),
      },
    });
    await tx.lifecycleEvent.create({
      data: { organizationId: context.organizationId, customerId: existing.customerId, childId, type: "CHILD_UPDATED" },
    });
    await writeAudit(tx, context, { action: "child.updated", entityType: "Child", entityId: child.id, customerId: existing.customerId });
    return child;
  });
}

export async function updateChild(childId: string, rawInput: ChildInput) {
  return updateChildWithContext(await requireAuthContext(), childId, rawInput);
}

export function describeChildJourney(birthDate: Date) {
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  return { age: formatChildAge(birthDate, today), stage: getChildStage(birthDate, today) };
}
