import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createCustomerWithContext, getCustomer360WithContext, listCustomersWithContext, updateCustomerWithContext } from "@/services/customer-service";
import { createPregnancyWithContext } from "@/services/pregnancy-service";
import { createChildWithContext } from "@/services/child-service";
import { confirmBirthWithContext } from "@/services/birth-service";
import { cleanDatabase, createActor, createFreshRuntimePrisma, customerInput } from "./helpers";

beforeEach(async () => {
  await cleanDatabase();
});

describe("PostgreSQL foundation", () => {
  it("creates, reads, updates, searches and persists a Customer across a fresh Prisma connection", async () => {
    const actor = await createActor("SELLER", "customer");
    const created = await createCustomerWithContext(actor, customerInput({ name: "Ana Persistente" }));

    const opened = await getCustomer360WithContext(actor, created.id);
    expect(opened.customer.name).toBe("Ana Persistente");

    await updateCustomerWithContext(actor, created.id, customerInput({ name: "Ana Atualizada", status: "RECURRING" }));
    const listed = await listCustomersWithContext(actor, { search: "Ana Atualizada" });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.status).toBe("RECURRING");

    const auditActions = await prisma.auditLog.findMany({ where: { customerId: created.id }, orderBy: { createdAt: "asc" }, select: { action: true } });
    expect(auditActions.map((item) => item.action)).toEqual(["customer.created", "customer.updated"]);

    const fresh = createFreshRuntimePrisma();
    try {
      const persisted = await fresh.customer.findUnique({ where: { id: created.id } });
      expect(persisted?.name).toBe("Ana Atualizada");
      expect(persisted?.status).toBe("RECURRING");
    } finally {
      await fresh.$disconnect();
    }
  });

  it("enforces one active pregnancy while preserving historical pregnancies", async () => {
    const actor = await createActor("SELLER", "pregnancy");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11981234567" }));

    const active = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-12-01" });
    await expect(createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2027-01-15" })).rejects.toMatchObject({ status: 409, code: "ACTIVE_PREGNANCY_EXISTS" });

    await prisma.pregnancy.update({ where: { id: active.id }, data: { status: "ARCHIVED" } });
    const next = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2027-01-15" });
    const all = await prisma.pregnancy.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2);
    expect(all[0]?.status).toBe("ARCHIVED");
    expect(next.status).toBe("ACTIVE");
  });

  it("supports direct child creation, multiple children and an active pregnancy simultaneously", async () => {
    const actor = await createActor("SELLER", "journeys");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11982345678" }));
    const first = await createChildWithContext(actor, customer.id, { name: "Pedro", birthDate: "2023-09-01" });
    const second = await createChildWithContext(actor, customer.id, { name: "Laura", birthDate: "2026-01-01" });
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2027-02-10" });

    const state = await getCustomer360WithContext(actor, customer.id);
    expect(state.customer.children.map((child) => child.id).sort()).toEqual([first.id, second.id].sort());
    expect(state.customer.pregnancies.some((item) => item.id === pregnancy.id && item.status === "ACTIVE")).toBe(true);
  });

  it("confirms birth atomically, creates factual Child data and persists event and audit", async () => {
    const actor = await createActor("SELLER", "birth-new");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11983456789" }));
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-08-15" });

    const result = await confirmBirthWithContext(actor, {
      pregnancyId: pregnancy.id,
      actualBirthDate: "2026-08-10",
      childName: "",
      commercialNote: "",
    });

    const [persistedPregnancy, child, birthEvent, birthAudit] = await Promise.all([
      prisma.pregnancy.findUniqueOrThrow({ where: { id: pregnancy.id } }),
      prisma.child.findUniqueOrThrow({ where: { id: result.childId } }),
      prisma.lifecycleEvent.findFirst({ where: { pregnancyId: pregnancy.id, type: "BIRTH_CONFIRMED" } }),
      prisma.auditLog.findFirst({ where: { entityId: pregnancy.id, action: "pregnancy.birth_confirmed" } }),
    ]);

    expect(persistedPregnancy.status).toBe("COMPLETED");
    expect(persistedPregnancy.confirmedChildId).toBe(result.childId);
    expect(persistedPregnancy.confirmedBirthDate?.toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(child.name).toBeNull();
    expect(child.currentSize).toBeNull();
    expect(child.birthDate.toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(birthEvent?.childId).toBe(result.childId);
    expect(birthAudit).not.toBeNull();
  });

  it("links an existing Child without creating another one", async () => {
    const actor = await createActor("SELLER", "birth-link");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11984567890" }));
    const existingChild = await createChildWithContext(actor, customer.id, { name: "Clara", birthDate: "2026-07-20" });
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-07-22" });
    const before = await prisma.child.count({ where: { customerId: customer.id } });

    const result = await confirmBirthWithContext(actor, {
      pregnancyId: pregnancy.id,
      actualBirthDate: "2026-07-20",
      existingChildId: existingChild.id,
    });

    expect(result.childId).toBe(existingChild.id);
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(before);
    expect((await prisma.pregnancy.findUniqueOrThrow({ where: { id: pregnancy.id } })).confirmedChildId).toBe(existingChild.id);
  });

  it("is idempotent on retry and does not create a second Child", async () => {
    const actor = await createActor("SELLER", "birth-retry");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11985678901" }));
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-08-05" });
    const input = { pregnancyId: pregnancy.id, actualBirthDate: "2026-08-01" };

    await confirmBirthWithContext(actor, input);
    const countAfterFirst = await prisma.child.count({ where: { customerId: customer.id } });
    await expect(confirmBirthWithContext(actor, input)).rejects.toMatchObject({ status: 409, code: "BIRTH_ALREADY_CONFIRMED" });
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(countAfterFirst);
  });

  it("protects concurrent confirmation from duplicate Child creation", async () => {
    const actor = await createActor("SELLER", "birth-concurrent");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11986789012" }));
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-08-05" });
    const input = { pregnancyId: pregnancy.id, actualBirthDate: "2026-08-01" };

    const results = await Promise.allSettled([
      confirmBirthWithContext(actor, input),
      confirmBirthWithContext(actor, input),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(1);
    expect(await prisma.lifecycleEvent.count({ where: { pregnancyId: pregnancy.id, type: "BIRTH_CONFIRMED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: pregnancy.id, action: "pregnancy.birth_confirmed" } })).toBe(1);
  });

  it("rolls back every birth mutation when a failure occurs before commit", async () => {
    const actor = await createActor("SELLER", "birth-rollback");
    const customer = await createCustomerWithContext(actor, customerInput({ whatsapp: "11987890123" }));
    const pregnancy = await createPregnancyWithContext(actor, customer.id, { expectedDueDate: "2026-08-05" });
    const baseline = {
      children: await prisma.child.count({ where: { customerId: customer.id } }),
      events: await prisma.lifecycleEvent.count({ where: { pregnancyId: pregnancy.id } }),
      audits: await prisma.auditLog.count({ where: { entityId: pregnancy.id } }),
    };

    await expect(confirmBirthWithContext(
      actor,
      { pregnancyId: pregnancy.id, actualBirthDate: "2026-08-01" },
      { beforeCommit: () => { throw new Error("forced transaction failure"); } },
    )).rejects.toThrow("forced transaction failure");

    const persisted = await prisma.pregnancy.findUniqueOrThrow({ where: { id: pregnancy.id } });
    expect(persisted.status).toBe("ACTIVE");
    expect(persisted.confirmedBirthDate).toBeNull();
    expect(persisted.confirmedChildId).toBeNull();
    expect(await prisma.child.count({ where: { customerId: customer.id } })).toBe(baseline.children);
    expect(await prisma.lifecycleEvent.count({ where: { pregnancyId: pregnancy.id } })).toBe(baseline.events);
    expect(await prisma.auditLog.count({ where: { entityId: pregnancy.id } })).toBe(baseline.audits);
  });

  it("enforces tenant isolation through application services", async () => {
    const actorA = await createActor("SELLER", "tenant-a");
    const actorB = await createActor("SELLER", "tenant-b");
    const customerB = await createCustomerWithContext(actorB, customerInput({ name: "Cliente B", whatsapp: "11988901234" }));

    await expect(getCustomer360WithContext(actorA, customerB.id)).rejects.toMatchObject({ status: 404, code: "CUSTOMER_NOT_FOUND" });
    await expect(updateCustomerWithContext(actorA, customerB.id, customerInput({ name: "Tentativa A", whatsapp: "11988901234" }))).rejects.toMatchObject({ status: 404, code: "CUSTOMER_NOT_FOUND" });
    const listA = await listCustomersWithContext(actorA, { search: "Cliente B" });
    expect(listA.total).toBe(0);

    const directRuntimeRead = await prisma.customer.findUnique({ where: { id: customerB.id } });
    expect(directRuntimeRead?.organizationId).toBe(actorB.organizationId);
  });
});
