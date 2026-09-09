"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  dismissOpportunity,
  refreshJourneyEventsForOrganization,
  snoozeOpportunity,
} from "@/services/journey-opportunity-service";

const opportunityIdSchema = z.string().uuid();

function opportunityIdFrom(formData: FormData) {
  return opportunityIdSchema.parse(formData.get("opportunityId"));
}

export async function refreshOpportunitiesAction(formData: FormData) {
  void formData;
  await refreshJourneyEventsForOrganization();
  revalidatePath("/oportunidades");
  revalidatePath("/clientes");
}

export async function snoozeOpportunityAction(formData: FormData) {
  const opportunityId = opportunityIdFrom(formData);
  await snoozeOpportunity(opportunityId, 7);
  revalidatePath("/oportunidades");
  revalidatePath("/clientes");
}

export async function dismissOpportunityAction(formData: FormData) {
  const opportunityId = opportunityIdFrom(formData);
  await dismissOpportunity(opportunityId);
  revalidatePath("/oportunidades");
  revalidatePath("/clientes");
}
