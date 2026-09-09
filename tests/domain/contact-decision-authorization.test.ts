import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/permissions";

describe("contact decision RBAC", () => {
  it("allows operational roles to evaluate contact decisions", () => {
    expect(hasPermission("OWNER", "contact-decision:evaluate")).toBe(true);
    expect(hasPermission("MANAGER", "contact-decision:evaluate")).toBe(true);
    expect(hasPermission("SELLER", "contact-decision:evaluate")).toBe(true);
  });

  it("keeps Marketing read-only", () => {
    expect(hasPermission("MARKETING", "contact-decision:view")).toBe(true);
    expect(hasPermission("MARKETING", "contact-decision:evaluate")).toBe(false);
  });
});
