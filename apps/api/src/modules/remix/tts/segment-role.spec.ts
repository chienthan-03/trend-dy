import { describe, expect, it } from "vitest";
import { effectiveRole, mergeNarrationIntervals } from "./segment-role";

describe("effectiveRole", () => {
  it("effectiveRole defaults to narration", () => {
    expect(effectiveRole({})).toBe("narration");
    expect(effectiveRole({ role: "source" })).toBe("source");
  });
});

describe("mergeNarrationIntervals", () => {
  it("mergeNarrationIntervals merges overlap and drops zero-length", () => {
    expect(
      mergeNarrationIntervals([
        { startSec: 0, endSec: 1, role: "narration" },
        { startSec: 0.8, endSec: 2, role: "narration" },
        { startSec: 3, endSec: 3, role: "narration" },
        { startSec: 4, endSec: 5, role: "source" },
      ]),
    ).toEqual([{ startSec: 0, endSec: 2 }]);
  });
});
