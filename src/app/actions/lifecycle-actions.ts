"use server";

import { revalidatePath } from "next/cache";
import { pregnancyInputSchema, birthConfirmationSchema } from "@/domain/pregnancy/schemas";
import { childInputSchema } from "@/domain/child/schemas";
import { createPregnancy, updatePregnancy } from "@/services/pregnancy-service";
import { createChild, updateChild } from "@/services/child-service";
import { confirmBirth } from "@/services/birth-service";
import { publicErrorMessage } from "@/lib/app-error";
import type { ActionResult } from "@/app/actions/action-result";

function revalidateCustomer(customerId: string) {
  revalidatePath(`/clientes/${customerId}`);
  revalidatePath(`/clientes/${customerId}/jornada`);
  revalidatePath(`/clientes/${customerId}/criancas`);
}

export async function createPregnancyAction(customerId: string, rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const pregnancy = await createPregnancy(customerId, pregnancyInputSchema.parse(rawInput));
    revalidateCustomer(customerId);
    return { ok: true, data: { id: pregnancy.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function updatePregnancyAction(customerId: string, pregnancyId: string, rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const pregnancy = await updatePregnancy(pregnancyId, pregnancyInputSchema.parse(rawInput));
    revalidateCustomer(customerId);
    return { ok: true, data: { id: pregnancy.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function createChildAction(customerId: string, rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const child = await createChild(customerId, childInputSchema.parse(rawInput));
    revalidateCustomer(customerId);
    return { ok: true, data: { id: child.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function updateChildAction(customerId: string, childId: string, rawInput: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const child = await updateChild(childId, childInputSchema.parse(rawInput));
    revalidateCustomer(customerId);
    return { ok: true, data: { id: child.id } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}

export async function confirmBirthAction(customerId: string, rawInput: unknown): Promise<ActionResult<{ childId: string }>> {
  try {
    const result = await confirmBirth(birthConfirmationSchema.parse(rawInput));
    revalidateCustomer(customerId);
    return { ok: true, data: { childId: result.childId } };
  } catch (error) {
    return { ok: false, error: publicErrorMessage(error) };
  }
}
