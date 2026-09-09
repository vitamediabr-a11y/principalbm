import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/permissions";

describe("opportunity RBAC", () => {
  it("allows operational roles to manage opportunities", () => {
    expect(hasPermission("OWNER", "opportunity:manage")).toBe(true);
    expect(hasPermission("MANAGER", "opportunity:manage")).toBe(true);
    expect(hasPermission("SELLER", "opportunity:manage")).toBe(true);
  });

  it("keeps marketing read-only", () => {
    expect(hasPermission("MARKETING", "opportunity:view")).toBe(true);
    expect(hasPermission("MARKETING", "opportunity:manage")).toBe(false);
  });
});
