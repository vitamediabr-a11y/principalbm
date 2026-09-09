import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";
import { normalizeBrazilianPhone } from "@/domain/contact/phone";
import { customerInputSchema, type CustomerInput } from "@/domain/customer/schemas";
import { requirePermission } from "@/services/auth-context";
import { writeAudit } from "@/services/audit-service";

function blankToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function validateResponsibleMembership(organizationId: string, membershipId?: string) {
  if (!membershipId) return null;
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId, active: true },
    select: { id: true },
  });
  if (!membership) throw new AppError(422, "INVALID_RESPONSIBLE", "O responsável informado não pertence a esta organização ou está inativo.");
  return membership.id;
}

function mapUniqueContactError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "DUPLICATE_CONTACT", "Já existe um cliente com este telefone ou WhatsApp.");
  }
  throw error;
}

export async function listCustomers(input: {
  search?: string;
  status?: string;
  source?: string;
  responsibleMembershipId?: string;
  page?: number;
}) {
  const context = await requirePermission("customer:view");
  const page = Math.max(1, input.page ?? 1);
  const pageSize = 20;
  const search = input.search?.trim();
  const digits = search?.replace(/\D/g, "") ?? "";
  const normalizedSearch = digits.length >= 10 ? normalizeBrazilianPhone(search) : null;

  const where: Prisma.CustomerWhereInput = {
    organizationId: context.organizationId,
    ...(input.status ? { status: input.status as Prisma.CustomerWhereInput["status"] } : {}),
    ...(input.source ? { source: input.source as Prisma.CustomerWhereInput["source"] } : {}),
    ...(input.responsibleMembershipId ? { responsibleMembershipId: input.responsibleMembershipId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            ...(normalizedSearch ? [{ whatsappNormalized: normalizedSearch }, { phoneNormalized: normalizedSearch }] : []),
            { children: { some: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        phone: true,
        city: true,
        source: true,
        status: true,
        updatedAt: true,
        responsibleMembership: { select: { user: { select: { name: true } } } },
        _count: { select: { children: true, pregnancies: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize, context };
}

export async function getCustomer360(customerId: string) {
  const context = await requirePermission("customer:view");
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
    include: {
      responsibleMembership: { include: { user: { select: { name: true } } } },
      pregnancies: { orderBy: { createdAt: "desc" } },
      children: { orderBy: { birthDate: "desc" } },
      lifecycleEvents: { orderBy: { occurredAt: "desc" }, take: 30 },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 20, include: { actorUser: { select: { name: true } } } },
      consents: { orderBy: { capturedAt: "desc" } },
    },
  });
  if (!customer) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");
  return { customer, context };
}

export async function getAssignableMembers() {
  const context = await requirePermission("customer:view");
  return prisma.membership.findMany({
    where: { organizationId: context.organizationId, active: true },
    orderBy: { user: { name: "asc" } },
    select: { id: true, role: true, user: { select: { name: true } } },
  });
}

export async function createCustomer(rawInput: CustomerInput) {
  const context = await requirePermission("customer:edit");
  const input = customerInputSchema.parse(rawInput);
  const responsibleMembershipId = await validateResponsibleMembership(context.organizationId, input.responsibleMembershipId || undefined);
  const whatsappNormalized = normalizeBrazilianPhone(input.whatsapp);
  const phoneNormalized = normalizeBrazilianPhone(input.phone);

  try {
    return await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          organizationId: context.organizationId,
          name: input.name.trim(),
          whatsapp: blankToNull(input.whatsapp),
          whatsappNormalized,
          phone: blankToNull(input.phone),
          phoneNormalized,
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          city: blankToNull(input.city),
          source: input.source,
          status: input.status,
          responsibleMembershipId,
          notes: blankToNull(input.notes),
        },
      });
      await writeAudit(tx, context, {
        action: "customer.created",
        entityType: "Customer",
        entityId: customer.id,
        customerId: customer.id,
        metadata: { source: customer.source, status: customer.status },
      });
      return customer;
    });
  } catch (error) {
    mapUniqueContactError(error);
  }
}

export async function updateCustomer(customerId: string, rawInput: CustomerInput) {
  const context = await requirePermission("customer:edit");
  const input = customerInputSchema.parse(rawInput);
  const responsibleMembershipId = await validateResponsibleMembership(context.organizationId, input.responsibleMembershipId || undefined);
  const existing = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: context.organizationId },
    select: { id: true, status: true, source: true, responsibleMembershipId: true },
  });
  if (!existing) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Cliente não encontrado.");

  try {
    return await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.update({
        where: { id: customerId },
        data: {
          name: input.name.trim(),
          whatsapp: blankToNull(input.whatsapp),
          whatsappNormalized: normalizeBrazilianPhone(input.whatsapp),
          phone: blankToNull(input.phone),
          phoneNormalized: normalizeBrazilianPhone(input.phone),
          email: blankToNull(input.email)?.toLowerCase() ?? null,
          city: blankToNull(input.city),
          source: input.source,
          status: input.status,
          responsibleMembershipId,
          notes: blankToNull(input.notes),
        },
      });
      await writeAudit(tx, context, {
        action: "customer.updated",
        entityType: "Customer",
        entityId: customer.id,
        customerId: customer.id,
        metadata: {
          before: { status: existing.status, source: existing.source, responsibleMembershipId: existing.responsibleMembershipId },
          after: { status: customer.status, source: customer.source, responsibleMembershipId: customer.responsibleMembershipId },
        },
      });
      return customer;
    });
  } catch (error) {
    mapUniqueContactError(error);
  }
}
