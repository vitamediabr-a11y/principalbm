import { prisma } from "../../src/lib/prisma";
import { env } from "../../src/lib/env";
import { dateOnlyFromInstant } from "../../src/domain/shared/date-only";
import { addCalendarDays, addCalendarMonthsClamped } from "../../src/domain/journey-event/rules";
import { RELATIONSHIP_CONTACT_PURPOSE } from "../../src/domain/contact-decision/contact-decision";
import { refreshJourneyEventsForCustomerWithContext } from "../../src/services/journey-opportunity-service";
import type { AuthContext } from "../../src/services/auth-context";

async function createConsent(customerId: string, capturedAt: Date) {
  await prisma.consent.create({
    data: {
      customerId,
      channel: "WHATSAPP",
      purpose: RELATIONSHIP_CONTACT_PURPOSE,
      status: "GRANTED",
      capturedAt,
      source: "browser-qa",
      version: "1",
    },
  });
}

async function main() {
  const owner = await prisma.membership.findFirstOrThrow({
    where: { role: "OWNER", active: true },
    include: { user: true, organization: true },
  });
  const context: AuthContext = {
    userId: owner.userId,
    userName: owner.user.name,
    organizationId: owner.organizationId,
    organizationName: owner.organization.name,
    membershipId: owner.id,
    role: "OWNER",
  };
  const today = dateOnlyFromInstant(new Date(), env.APP_TIME_ZONE);

  const primary = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Helena Rodrigues de Albuquerque — Cliente QA com múltiplas oportunidades e nome longo",
    whatsapp: "(91) 99991-1001",
    whatsappNormalized: "5591999911001",
    source: "WHATSAPP",
    status: "RECURRING",
  }});
  await prisma.pregnancy.create({ data: {
    customerId: primary.id,
    expectedDueDate: addCalendarDays(today, 30),
    informationUpdatedAt: today,
    status: "ACTIVE",
  }});
  await prisma.child.create({ data: {
    customerId: primary.id,
    name: "Laura Beatriz — Jornada independente de contato",
    birthDate: addCalendarMonthsClamped(today, -3),
  }});
  await prisma.child.create({ data: {
    customerId: primary.id,
    name: "Pedro — Jornada independente",
    birthDate: addCalendarMonthsClamped(today, -24),
  }});
  await createConsent(primary.id, today);
  await refreshJourneyEventsForCustomerWithContext(context, primary.id, new Date());

  const future = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Cliente QA — Aguardar momento recomendado",
    whatsapp: "(91) 99991-1002",
    whatsappNormalized: "5591999911002",
    source: "WHATSAPP",
    status: "CUSTOMER",
  }});
  const futureMilestone = addCalendarDays(today, 10);
  await prisma.child.create({ data: {
    customerId: future.id,
    name: "Criança futura QA",
    birthDate: addCalendarMonthsClamped(futureMilestone, -6),
  }});
  await createConsent(future.id, today);
  await refreshJourneyEventsForCustomerWithContext(context, future.id, new Date());

  const missingConsent = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Cliente QA — Consentimento WhatsApp ausente",
    whatsapp: "(91) 99991-1003",
    whatsappNormalized: "5591999911003",
    source: "WHATSAPP",
    status: "CUSTOMER",
  }});
  await prisma.child.create({ data: {
    customerId: missingConsent.id,
    name: "Criança sem consentimento QA",
    birthDate: addCalendarMonthsClamped(today, -3),
  }});
  await refreshJourneyEventsForCustomerWithContext(context, missingConsent.id, new Date());

  const doNotContact = await prisma.customer.create({ data: {
    organizationId: owner.organizationId,
    responsibleMembershipId: owner.id,
    name: "Cliente QA — Não contatar",
    whatsapp: "(91) 99991-1004",
    whatsappNormalized: "5591999911004",
    source: "WHATSAPP",
    status: "CUSTOMER",
  }});
  await prisma.child.create({ data: {
    customerId: doNotContact.id,
    name: "Criança DNC QA",
    birthDate: addCalendarMonthsClamped(today, -3),
  }});
  await createConsent(doNotContact.id, today);
  await refreshJourneyEventsForCustomerWithContext(context, doNotContact.id, new Date());
  await prisma.customer.update({ where: { id: doNotContact.id }, data: { status: "DO_NOT_CONTACT" } });

  console.log(`CONTACT_DECISION_PRIMARY_CUSTOMER_ID=${primary.id}`);
  console.log(`CONTACT_DECISION_FUTURE_CUSTOMER_ID=${future.id}`);
  console.log(`CONTACT_DECISION_MISSING_CONSENT_CUSTOMER_ID=${missingConsent.id}`);
  console.log(`CONTACT_DECISION_DNC_CUSTOMER_ID=${doNotContact.id}`);
  console.log(`CONTACT_DECISION_OWNER_MEMBERSHIP_ID=${owner.id}`);
}

main().finally(() => prisma.$disconnect());
