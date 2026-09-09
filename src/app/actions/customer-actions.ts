"use server";

import { revalidatePath } from "next/cache";
import { customerInputSchema } from "@/domain/customer/schemas";
import { createCustomer, updateCustomer } from "@/services/customer-service";
import { publicErrorMessage } from "@/lib/app-error";
import type { ActionResult } from "@/app/actions/action-result";

export async function createCustomerAction(rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const customer = await createCustomer(customerInputSchema.parse(rawInput));
    revalidatePath("/clientes");
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function updateCustomerAction(customerId: string, rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const customer = await updateCustomer(customerId, customerInputSchema.parse(rawInput));
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);
    return { ok: true, data: { id: customer.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}
