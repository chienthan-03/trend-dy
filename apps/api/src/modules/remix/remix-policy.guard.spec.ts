import { describe, expect, it } from "vitest";
import { RemixPolicyGuard } from "./remix-policy.guard";

describe("RemixPolicyGuard.canExport", () => {
  const guard = new RemixPolicyGuard();

  it("returns false when usagePolicy is not approved_for_export", () => {
    expect(guard.canExport({ usagePolicy: "remix_draft" })).toBe(false);
  });

  it("returns true when usagePolicy is approved_for_export", () => {
    expect(guard.canExport({ usagePolicy: "approved_for_export" })).toBe(true);
  });
});
