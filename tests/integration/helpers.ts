import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type BusinessRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/services/auth-context";

function requiredEnv(name: "DATABASE_URL" | "ADMIN_DATABASE_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for integration tests.`);
  return value;
}

export const adminPool = new Pool({ connectionString: requiredEnv("ADMIN_DATABASE_URL"), max: 2 });

export function createFreshRuntimePrisma() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: requiredEnv("DATABASE_URL") }) });
}

export async function cleanDatabase() {
  await adminPool.query(`
    TRUNCATE TABLE
      principal.audit_logs,
      principal.contact_decisions,
      principal.opportunities,
      principal.journey_events,
      principal.lifecycle_events,
      principal.consents,
      principal.pregnancies,
      principal.children,
      principal.customers,
      principal.memberships,
      principal.organizations,
      principal.session,
      principal.account,
      principal.verification,
      principal.rate_limit,
      principal."user"
    CASCADE
  `);
}

export async function createActor(role: BusinessRole = "SELLER", label = randomUUID().slice(0, 8)): Promise<AuthContext> {
  const organization = await prisma.organization.create({ data: { name: `Organização ${label}` } });
  const user = await prisma.user.create({
    data: { name: `Usuário ${label}`, email: `${label}@example.test`, emailVerified: true, role: "user", banned: false },
  });
  const membership = await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role, active: true },
  });
  return {
    userId: user.id,
    userName: user.name,
    organizationId: organization.id,
    organizationName: organization.name,
    membershipId: membership.id,
    role,
  };
}

export function customerInput(overrides: Partial<{
  name: string;
  whatsapp: string;
  phone: string;
  email: string;
  city: string;
  source: "PHYSICAL_STORE" | "WHATSAPP" | "INSTAGRAM" | "WEBSITE" | "REFERRAL" | "EVENT" | "OTHER";
  responsibleMembershipId: string;
  status: "CUSTOMER" | "RECURRING" | "VIP" | "INACTIVE" | "DO_NOT_CONTACT" | "ARCHIVED";
  notes: string;
}> = {}) {
  return {
    name: "Cliente Integração",
    whatsapp: "(11) 99876-5432",
    phone: "",
    email: "",
    city: "São Paulo",
    source: "WHATSAPP" as const,
    responsibleMembershipId: "",
    status: "CUSTOMER" as const,
    notes: "",
    ...overrides,
  };
}
