import type { BusinessRole } from "@/generated/prisma/client";
import { AppError } from "@/lib/app-error";
import { hasPermission, type Permission } from "@/lib/permissions";

export type AuthorizationSubject = {
  role: BusinessRole;
  active: boolean;
  organizationId: string;
} | null;

export function assertAuthorized(subject: AuthorizationSubject, permission: Permission, entityOrganizationId?: string) {
  if (!subject) throw new AppError(401, "UNAUTHENTICATED", "Faça login para continuar.");
  if (!subject.active) throw new AppError(403, "INACTIVE_USER", "Seu acesso está inativo.");
  if (entityOrganizationId && entityOrganizationId !== subject.organizationId) throw new AppError(404, "ENTITY_NOT_FOUND", "Registro não encontrado.");
  if (!hasPermission(subject.role, permission)) throw new AppError(403, "FORBIDDEN", "Você não tem permissão para realizar esta ação.");
  return subject;
}
