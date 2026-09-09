import type { Prisma } from "@/generated/prisma/client";
import type { AuthContext } from "@/services/auth-context";

export async function writeAudit(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    customerId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await tx.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      customerId: input.customerId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
