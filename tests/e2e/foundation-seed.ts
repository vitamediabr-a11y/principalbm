import { prisma } from "../../src/lib/prisma";

async function main() {
  const owner = await prisma.membership.findFirstOrThrow({ where: { role: "OWNER", active: true } });
  const customer = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Maria da Conceição Albuquerque de Souza — Cliente com nome propositalmente longo",
    whatsapp: "(11) 99876-5432",
    whatsappNormalized: "11998765432",
    email: "maria.qa@example.invalid",
    city: "Belém",
    source: "PHYSICAL_STORE",
    status: "RECURRING",
    notes: "Cadastro descartável usado somente para inspeção visual em CI."
  }});

  const child = await prisma.child.create({ data: {
    customerId: customer.id,
    name: "Ana Clara",
    birthDate: new Date("2024-02-10T12:00:00Z"),
    currentSize: "M",
    preferences: "Algodão e cores neutras"
  }});

  await prisma.child.create({ data: {
    customerId: customer.id,
    name: "João Miguel com um nome infantil também bastante comprido",
    birthDate: new Date("2022-05-18T12:00:00Z"),
    currentSize: "4"
  }});

  await prisma.pregnancy.create({ data: {
    customerId: customer.id,
    expectedDueDate: new Date("2024-02-15T12:00:00Z"),
    babyName: "Ana Clara",
    status: "COMPLETED",
    confirmedBirthDate: new Date("2024-02-10T12:00:00Z"),
    confirmedChildId: child.id
  }});

  await prisma.pregnancy.create({ data: {
    customerId: customer.id,
    expectedDueDate: new Date("2026-09-01T12:00:00Z"),
    babyName: "Bebê em acompanhamento",
    status: "ACTIVE",
    reportedPregnancyMonth: 9
  }});

  console.log(`CUSTOMER_ID=${customer.id}`);
}

main().finally(() => prisma.$disconnect());
