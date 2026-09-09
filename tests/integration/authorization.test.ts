import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCustomerWithContext } from "@/services/customer-service";
import { createPregnancyWithContext } from "@/services/pregnancy-service";
import { createChildWithContext } from "@/services/child-service";
import { confirmBirthWithContext } from "@/services/birth-service";
import type { AuthContext } from "@/services/auth-context";
import { cleanDatabase, createActor, customerInput } from "./helpers";

beforeEach(async () => {
  await cleanDatabase();
});

describe("operational RBAC", () => {
  it("allows Seller lifecycle mutations and rejects Marketing mutations on the same tenant", async () => {
    const seller = await createActor("SELLER", "rbac-seller");
    const marketingUser = await prisma.user.create({ data: { name: "Marketing", email: "marketing-rbac@example.test", emailVerified: true } });
    const marketingMembership = await prisma.membership.create({
      data: { organizationId: seller.organizationId, userId: marketingUser.id, role: "MARKETING", active: true },
    });
    const marketing: AuthContext = {
      userId: marketingUser.id,
      userName: marketingUser.name,
      organizationId: seller.organizationId,
      organizationName: seller.organizationName,
      membershipId: marketingMembership.id,
      role: "MARKETING",
    };

    const customer = await createCustomerWithContext(seller, customerInput({ whatsapp: "11981239876" }));
    const pregnancy = await createPregnancyWithContext(seller, customer.id, { expectedDueDate: "2026-12-20" });
    const child = await createChildWithContext(seller, customer.id, { birthDate: "2024-03-01", name: "Filho" });
    expect(pregnancy.customerId).toBe(customer.id);
    expect(child.customerId).toBe(customer.id);

    await expect(createPregnancyWithContext(marketing, customer.id, { expectedDueDate: "2027-01-01" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(createChildWithContext(marketing, customer.id, { birthDate: "2025-01-01" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(confirmBirthWithContext(marketing, { pregnancyId: pregnancy.id, actualBirthDate: "2026-09-01" })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});
