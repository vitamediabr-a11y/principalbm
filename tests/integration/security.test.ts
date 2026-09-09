import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createCustomerWithContext } from "@/services/customer-service";
import { adminPool, cleanDatabase, createActor, customerInput } from "./helpers";

async function expectRoleDenied(role: "anon" | "authenticated" | "crm_runtime", sql: string) {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    await expect(client.query(sql)).rejects.toThrow();
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("least-privilege runtime and RLS", () => {
  it("uses crm_app login inheriting crm_runtime without privileged role flags", async () => {
    const result = await adminPool.query<{
      rolname: string;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
      rolcanlogin: boolean;
    }>(`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('crm_app','crm_runtime') ORDER BY rolname`);

    const app = result.rows.find((row) => row.rolname === "crm_app");
    const runtime = result.rows.find((row) => row.rolname === "crm_runtime");
    expect(app).toMatchObject({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolcanlogin: true });
    expect(runtime).toMatchObject({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rolcanlogin: false });

    const membership = await adminPool.query<{ is_member: boolean }>(`SELECT pg_has_role('crm_app', 'crm_runtime', 'member') AS is_member`);
    expect(membership.rows[0]?.is_member).toBe(true);

    const identity = await prisma.$queryRaw<Array<{ current_user: string; current_schema: string | null }>>`SELECT current_user, current_schema()`;
    expect(identity[0]).toEqual({ current_user: "crm_app", current_schema: "principal" });
  });

  it("denies private CRM reads to anon and authenticated", async () => {
    await expectRoleDenied("anon", "SELECT id FROM principal.customers LIMIT 1");
    await expectRoleDenied("authenticated", "SELECT id FROM principal.customers LIMIT 1");
  });

  it("grants crm_runtime only the intended table operations", async () => {
    const privileges = await adminPool.query<{
      customers_select: boolean;
      customers_insert: boolean;
      customers_update: boolean;
      customers_delete: boolean;
      org_delete: boolean;
      audit_select: boolean;
      audit_insert: boolean;
      audit_update: boolean;
      audit_delete: boolean;
    }>(`
      SELECT
        has_table_privilege('crm_runtime','principal.customers','SELECT') AS customers_select,
        has_table_privilege('crm_runtime','principal.customers','INSERT') AS customers_insert,
        has_table_privilege('crm_runtime','principal.customers','UPDATE') AS customers_update,
        has_table_privilege('crm_runtime','principal.customers','DELETE') AS customers_delete,
        has_table_privilege('crm_runtime','principal.organizations','DELETE') AS org_delete,
        has_table_privilege('crm_runtime','principal.audit_logs','SELECT') AS audit_select,
        has_table_privilege('crm_runtime','principal.audit_logs','INSERT') AS audit_insert,
        has_table_privilege('crm_runtime','principal.audit_logs','UPDATE') AS audit_update,
        has_table_privilege('crm_runtime','principal.audit_logs','DELETE') AS audit_delete
    `);
    expect(privileges.rows[0]).toEqual({
      customers_select: true,
      customers_insert: true,
      customers_update: true,
      customers_delete: true,
      org_delete: false,
      audit_select: true,
      audit_insert: true,
      audit_update: false,
      audit_delete: false,
    });

    await expectRoleDenied("crm_runtime", "UPDATE principal.audit_logs SET action = action");
    await expectRoleDenied("crm_runtime", "DELETE FROM principal.audit_logs");
    await expectRoleDenied("crm_runtime", "CREATE ROLE should_never_exist");
  });

  it("enables RLS on private tables while keeping backend tenant isolation explicitly application-scoped", async () => {
    const expectedTables = ["user", "session", "account", "verification", "rate_limit", "organizations", "memberships", "customers", "pregnancies", "children", "lifecycle_events", "audit_logs", "consents"].sort();
    const tables = await adminPool.query<{ relname: string; relrowsecurity: boolean; owner: string }>(`
      SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'principal' AND c.relkind = 'r'
      ORDER BY c.relname
    `);
    expect(tables.rows.map((row) => row.relname).sort()).toEqual(expectedTables);
    expect(tables.rows.every((row) => row.relrowsecurity)).toBe(true);
    expect(tables.rows.every((row) => row.owner !== "crm_app" && row.owner !== "crm_runtime")).toBe(true);

    const policies = await adminPool.query<{ tablename: string; roles: string[]; cmd: string }>(`
      SELECT tablename, roles, cmd FROM pg_policies WHERE schemaname = 'principal' AND policyname = 'crm_runtime_server_access'
    `);
    expect(policies.rows).toHaveLength(expectedTables.length);
    expect(policies.rows.every((row) => row.roles.includes("crm_runtime") && row.cmd === "ALL")).toBe(true);

    const actorA = await createActor("SELLER", "rls-a");
    const actorB = await createActor("SELLER", "rls-b");
    const customerB = await createCustomerWithContext(actorB, customerInput({ name: "Backend visível", whatsapp: "11989012345" }));
    const direct = await prisma.customer.findUnique({ where: { id: customerB.id } });
    expect(direct?.organizationId).toBe(actorB.organizationId);
    expect(actorA.organizationId).not.toBe(actorB.organizationId);
  });

  it("enforces cross-organization and cross-customer relationship integrity in PostgreSQL", async () => {
    const actorA = await createActor("SELLER", "fk-a");
    const actorB = await createActor("SELLER", "fk-b");
    const customerA = await createCustomerWithContext(actorA, customerInput({ whatsapp: "11980123456" }));
    const customerB = await createCustomerWithContext(actorB, customerInput({ whatsapp: "11980123457" }));

    await expect(prisma.customer.update({
      where: { id: customerA.id },
      data: { responsibleMembershipId: actorB.membershipId },
    })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(prisma.lifecycleEvent.create({
      data: { organizationId: actorA.organizationId, customerId: customerB.id, type: "CHILD_ADDED" },
    })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    await expect(prisma.auditLog.create({
      data: { organizationId: actorA.organizationId, customerId: customerB.id, actorUserId: actorA.userId, action: "test.invalid", entityType: "Customer", entityId: customerB.id },
    })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);

    const childB = await prisma.child.create({ data: { customerId: customerB.id, birthDate: new Date("2026-01-01T00:00:00.000Z") } });
    const pregnancyA = await prisma.pregnancy.create({ data: { customerId: customerA.id, expectedDueDate: new Date("2026-12-01T00:00:00.000Z") } });
    await expect(prisma.pregnancy.update({ where: { id: pregnancyA.id }, data: { confirmedChildId: childB.id } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
