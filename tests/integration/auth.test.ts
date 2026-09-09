import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveAuthContextForUser } from "@/services/auth-context";
import { bootstrapFirstOwner } from "@/services/bootstrap-owner";
import { cleanDatabase, createFreshRuntimePrisma } from "./helpers";

const strongPassword = "Integration-only-Passphrase-2026!";

async function createCredentialUser(email: string, name = "Funcionário Teste") {
  await auth.api.createUser({ body: { email, password: strongPassword, name, role: "user" } });
  return prisma.user.findUniqueOrThrow({ where: { email } });
}

function authRequest(path: string, body: Record<string, unknown>, ip = "203.0.113.25") {
  return auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "principalbm-integration-test",
    },
    body: JSON.stringify(body),
  }));
}

beforeEach(async () => {
  await cleanDatabase();
});

describe("Better Auth database behavior", () => {
  it("keeps public email/password signup disabled", async () => {
    const email = "signup-disabled@example.test";
    const response = await authRequest("/sign-up/email", { email, password: strongPassword, name: "Não deve criar" });
    expect(response.ok).toBe(false);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("persists a real session in PostgreSQL after credential sign-in", async () => {
    const email = "session@example.test";
    const user = await createCredentialUser(email);
    const response = await authRequest("/sign-in/email", { email, password: strongPassword });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token");

    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const fresh = createFreshRuntimePrisma();
    try {
      expect(await fresh.session.count({ where: { userId: user.id } })).toBe(1);
    } finally {
      await fresh.$disconnect();
    }
  });

  it("rejects a banned employee during credential sign-in", async () => {
    const email = "banned@example.test";
    const user = await createCredentialUser(email);
    await prisma.user.update({ where: { id: user.id }, data: { banned: true, banReason: "Teste de bloqueio" } });

    const response = await authRequest("/sign-in/email", { email, password: strongPassword });
    expect(response.ok).toBe(false);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("reloads active membership and role from the database on each authorization resolution", async () => {
    const user = await createCredentialUser("role-refresh@example.test");
    const organization = await prisma.organization.create({ data: { name: "Organização Auth" } });
    const membership = await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role: "SELLER", active: true } });

    expect((await resolveAuthContextForUser(user.id)).role).toBe("SELLER");
    await prisma.membership.update({ where: { id: membership.id }, data: { role: "MARKETING" } });
    expect((await resolveAuthContextForUser(user.id)).role).toBe("MARKETING");

    await prisma.membership.update({ where: { id: membership.id }, data: { active: false } });
    await expect(resolveAuthContextForUser(user.id)).rejects.toMatchObject({ status: 403, code: "NO_ACTIVE_MEMBERSHIP" });
  });

  it("applies database-backed login rate limiting to client-initiated requests", async () => {
    const email = "rate-limit@example.test";
    await createCredentialUser(email);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await authRequest("/sign-in/email", { email, password: "Wrong-passphrase-2026!" }, "203.0.113.77");
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(await prisma.rateLimit.count()).toBeGreaterThan(0);
  });
});

describe("first owner bootstrap", () => {
  it("creates exactly one Organization and OWNER explicitly and is idempotent for the same identity", async () => {
    const input = {
      email: "owner@example.test",
      name: "Proprietário Inicial",
      password: strongPassword,
      organizationName: "Loja Principal",
    };

    const first = await bootstrapFirstOwner(input);
    expect(first.status).toBe("created");
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.membership.count({ where: { role: "OWNER", active: true } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "organization.owner_bootstrapped" } })).toBe(1);

    const second = await bootstrapFirstOwner(input);
    expect(second.status).toBe("already_bootstrapped");
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.membership.count({ where: { role: "OWNER" } })).toBe(1);

    await expect(bootstrapFirstOwner({ ...input, email: "other-owner@example.test" })).rejects.toMatchObject({ status: 409, code: "OWNER_ALREADY_EXISTS" });
    expect(await prisma.membership.count({ where: { role: "OWNER" } })).toBe(1);
  });
});
