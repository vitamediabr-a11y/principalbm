import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/app-error";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { BusinessRole } from "@/generated/prisma/client";

export type AuthContext = {
  userId: string;
  userName: string;
  organizationId: string;
  organizationName: string;
  membershipId: string;
  role: BusinessRole;
};

export async function resolveAuthContextForUser(userId: string): Promise<AuthContext> {
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, banned: true } }),
    prisma.membership.findMany({
      where: { userId, active: true },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
      take: 2,
    }),
  ]);

  if (!user || user.banned) {
    throw new AppError(403, "INACTIVE_USER", "Seu acesso está inativo.");
  }
  if (memberships.length === 0) {
    throw new AppError(403, "NO_ACTIVE_MEMBERSHIP", "Seu usuário não possui vínculo ativo com uma organização.");
  }
  if (memberships.length > 1) {
    throw new AppError(409, "ORGANIZATION_SELECTION_REQUIRED", "Há mais de uma organização ativa para este usuário. A seleção de organização precisa ser configurada.");
  }

  const membership = memberships[0];
  return {
    userId: user.id,
    userName: user.name,
    organizationId: membership.organization.id,
    organizationName: membership.organization.name,
    membershipId: membership.id,
    role: membership.role,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError(401, "UNAUTHENTICATED", "Faça login para continuar.");
  return resolveAuthContextForUser(session.user.id);
}

export async function requirePermission(permission: Permission) {
  const context = await requireAuthContext();
  if (!hasPermission(context.role, permission)) {
    throw new AppError(403, "FORBIDDEN", "Você não tem permissão para realizar esta ação.");
  }
  return context;
}
