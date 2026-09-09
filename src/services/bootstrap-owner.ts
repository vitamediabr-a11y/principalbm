import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";

export type FirstOwnerBootstrapInput = {
  email: string;
  name: string;
  password: string;
  organizationName: string;
};

export async function bootstrapFirstOwner(input: FirstOwnerBootstrapInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const organizationName = input.organizationName.trim();
  if (!email || !email.includes("@")) throw new AppError(422, "INVALID_EMAIL", "Informe um e-mail válido para o proprietário.");
  if (name.length < 2) throw new AppError(422, "INVALID_NAME", "Informe o nome do proprietário.");
  if (organizationName.length < 2) throw new AppError(422, "INVALID_ORGANIZATION", "Informe o nome da organização.");
  if (input.password.length < 12) throw new AppError(422, "WEAK_PASSWORD", "A senha deve ter pelo menos 12 caracteres.");

  const existingOwner = await prisma.membership.findFirst({
    where: { role: "OWNER" },
    include: { user: { select: { id: true, email: true } }, organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (existingOwner) {
    if (existingOwner.user.email === email && existingOwner.organization.name === organizationName) {
      return { status: "already_bootstrapped" as const, userId: existingOwner.user.id, organizationId: existingOwner.organization.id };
    }
    throw new AppError(409, "OWNER_ALREADY_EXISTS", "O primeiro proprietário já foi configurado.");
  }

  const [existingUser, organizationCount] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.organization.count(),
  ]);
  if (existingUser) throw new AppError(409, "USER_ALREADY_EXISTS", "Já existe um usuário com este e-mail.");
  if (organizationCount > 0) {
    throw new AppError(409, "ORGANIZATION_ALREADY_EXISTS", "Já existe uma organização sem proprietário inicial. Corrija esse estado administrativamente antes de executar o bootstrap.");
  }

  await auth.api.createUser({ body: { email, password: input.password, name, role: "user" } });
  const createdUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!createdUser) throw new AppError(500, "BOOTSTRAP_USER_MISSING", "Não foi possível concluir a criação do proprietário.");

  try {
    return await prisma.$transaction(async (tx) => {
      const [ownerCount, orgCount] = await Promise.all([
        tx.membership.count({ where: { role: "OWNER" } }),
        tx.organization.count(),
      ]);
      if (ownerCount > 0 || orgCount > 0) {
        throw new AppError(409, "BOOTSTRAP_ALREADY_COMPLETED", "O bootstrap inicial já foi concluído por outra execução.");
      }

      const organization = await tx.organization.create({ data: { name: organizationName } });
      await tx.membership.create({ data: { organizationId: organization.id, userId: createdUser.id, role: "OWNER", active: true } });
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: createdUser.id,
          action: "organization.owner_bootstrapped",
          entityType: "Organization",
          entityId: organization.id,
          metadata: { method: "explicit_admin_cli" },
        },
      });
      return { status: "created" as const, userId: createdUser.id, organizationId: organization.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await prisma.user.delete({ where: { id: createdUser.id } }).catch(() => undefined);
    throw error;
  }
}
