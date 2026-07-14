import { describe, expect, it } from "vitest";
import {
  defaultRemixPolicyChecklist,
  type RemixPolicyChecklist,
} from "@factory/shared";
import { RemixPolicyGuard } from "./remix-policy.guard";

const completeChecklist = (): RemixPolicyChecklist => ({
  scriptRewritten: true,
  hookIsNew: true,
  hasStudioBrand: true,
  voiceWillBeRerecorded: true,
  noFullReupload: true,
  leadApproved: true,
});

describe("RemixPolicyGuard.canExport", () => {
  const guard = new RemixPolicyGuard();

  it("returns false when usagePolicy is not approved_for_export", () => {
    expect(
      guard.canExport({
        usagePolicy: "remix_draft",
        policyChecklist: completeChecklist(),
      }),
    ).toBe(false);
  });

  it("returns false when checklist is incomplete", () => {
    expect(
      guard.canExport({
        usagePolicy: "approved_for_export",
        policyChecklist: defaultRemixPolicyChecklist(),
      }),
    ).toBe(false);
  });

  it("returns true when approved and checklist is complete", () => {
    expect(
      guard.canExport({
        usagePolicy: "approved_for_export",
        policyChecklist: completeChecklist(),
      }),
    ).toBe(true);
  });
});
