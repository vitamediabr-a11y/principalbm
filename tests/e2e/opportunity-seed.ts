import { prisma } from "../../src/lib/prisma";
import { env } from "../../src/lib/env";
import { dateOnlyFromInstant } from "../../src/domain/shared/date-only";
import { addCalendarDays, addCalendarMonthsClamped } from "../../src/domain/journey-event/rules";

async function main() {
  const owner = await prisma.membership.findFirstOrThrow({ where: { role: "OWNER", active: true } });
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);
  const customer = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Mariana de Almeida Vasconcelos — Cliente de oportunidade com nome propositalmente muito longo",
    whatsapp: "(91) 99999-1111",
    whatsappNormalized: "91999991111",
    city: "Belém",
    source: "INSTAGRAM",
    status: "RECURRING",
    notes: "Fixture descartável exclusiva do browser QA de oportunidades."
  }});

  await prisma.pregnancy.create({ data: {
    customerId: customer.id,
    expectedDueDate: addCalendarDays(today, 30),
    babyName: "Bebê em acompanhamento",
    status: "ACTIVE",
    informationUpdatedAt: today
  }});

  await prisma.child.create({ data: {
    customerId: customer.id,
    name: "Laura Beatriz com nome infantil comprido para testar quebra de linha",
    birthDate: addCalendarMonthsClamped(today, -3),
    currentSize: "M"
  }});

  await prisma.child.create({ data: {
    customerId: customer.id,
    name: "Pedro",
    birthDate: addCalendarMonthsClamped(today, -24),
    currentSize: "4"
  }});

  const suppressed = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Cliente Não Contatar QA",
    source: "PHYSICAL_STORE",
    status: "DO_NOT_CONTACT"
  }});
  await prisma.pregnancy.create({ data: {
    customerId: suppressed.id,
    expectedDueDate: addCalendarDays(today, -8),
    status: "ACTIVE",
    informationUpdatedAt: today
  }});

  console.log(`OPPORTUNITY_CUSTOMER_ID=${customer.id}`);
  console.log(`OPPORTUNITY_OWNER_MEMBERSHIP_ID=${owner.id}`);
}

main().finally(() => prisma.$disconnect());
