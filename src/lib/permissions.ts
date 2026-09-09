import type { BusinessRole } from "@/generated/prisma/client";

export type Permission =
  | "customer:view"
  | "customer:edit"
  | "lifecycle:view"
  | "lifecycle:edit"
  | "child:edit"
  | "birth:confirm"
  | "report:view"
  | "team:manage"
  | "privacy:manage"
  | "integration:manage";

const allPermissions: Permission[] = [
  "customer:view",
  "customer:edit",
  "lifecycle:view",
  "lifecycle:edit",
  "child:edit",
  "birth:confirm",
  "report:view",
  "team:manage",
  "privacy:manage",
  "integration:manage",
];

export const permissionsByRole: Record<BusinessRole, readonly Permission[]> = {
  OWNER: allPermissions,
  MANAGER: [
    "customer:view",
    "customer:edit",
    "lifecycle:view",
    "lifecycle:edit",
    "child:edit",
    "birth:confirm",
    "report:view",
    "team:manage",
    "privacy:manage",
  ],
  SELLER: [
    "customer:view",
    "customer:edit",
    "lifecycle:view",
    "lifecycle:edit",
    "child:edit",
    "birth:confirm",
  ],
  MARKETING: ["customer:view", "lifecycle:view", "report:view"],
};

export function hasPermission(role: BusinessRole, permission: Permission) {
  return permissionsByRole[role].includes(permission);
}
