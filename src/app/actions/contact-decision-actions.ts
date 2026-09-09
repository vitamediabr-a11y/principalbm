"use server";

import { revalidatePath } from "next/cache";
import { refreshContactDecisionsForOrganization } from "@/services/contact-decision-service";

export async function evaluateContactDecisionsAction(formData: FormData) {
  void formData;
  await refreshContactDecisionsForOrganization();
  revalidatePath("/oportunidades");
  revalidatePath("/clientes");
}
