import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/app-error";
import { assertAuthorized } from "@/lib/authorization";

describe("authorization policy", () => {
  const org = "11111111-1111-1111-1111-111111111111";
  it("returns 401 for unauthenticated access", () => {
    try { assertAuthorized(null, "customer:edit"); throw new Error("expected failure"); } catch (error) { expect((error as AppError).status).toBe(401); }
  });
  it("rejects inactive employees", () => {
    try { assertAuthorized({ role: "SELLER", active: false, organizationId: org }, "customer:edit"); throw new Error("expected failure"); } catch (error) { expect((error as AppError).status).toBe(403); }
  });
  it("rejects marketing writes", () => {
    for (const permission of ["lifecycle:edit", "child:edit", "birth:confirm"] as const) {
      try { assertAuthorized({ role: "MARKETING", active: true, organizationId: org }, permission); throw new Error("expected failure"); } catch (error) { expect((error as AppError).status).toBe(403); }
    }
  });
  it("allows an authorized seller", () => {
    expect(() => assertAuthorized({ role: "SELLER", active: true, organizationId: org }, "birth:confirm")).not.toThrow();
  });
  it("hides another organization as 404", () => {
    try { assertAuthorized({ role: "SELLER", active: true, organizationId: org }, "customer:view", "22222222-2222-2222-2222-222222222222"); throw new Error("expected failure"); } catch (error) { expect((error as AppError).status).toBe(404); }
  });
});
