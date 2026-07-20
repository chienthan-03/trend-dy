import { describe, expect, it } from "vitest";
import { buildDuckVolumeFilter } from "./duck-envelope";

describe("buildDuckVolumeFilter", () => {
  it("builds volume enable expressions for narration windows", () => {
    const filter = buildDuckVolumeFilter({
      intervals: [
        { startSec: 1, endSec: 2 },
        { startSec: 5, endSec: 6 },
      ],
      duckGain: 0.2,
    });

    expect(filter).toContain("0.2");
    expect(filter).toContain("between(t,1,2)");
    expect(filter).toContain("between(t,5,6)");
  });

  it("ORs multiple narration windows into a single volume expression", () => {
    const filter = buildDuckVolumeFilter({
      intervals: [
        { startSec: 1, endSec: 2 },
        { startSec: 5, endSec: 6 },
      ],
      duckGain: 0.2,
    });

    // Single `volume` filter with an `if(...)` expression, not one filter per window.
    expect(filter.match(/^volume=/g)?.length).toBe(1);
    expect(filter).toContain("if(");
  });

  it("falls back to full volume when there are no narration windows", () => {
    const filter = buildDuckVolumeFilter({ intervals: [], duckGain: 0.2 });

    expect(filter).toBe("volume=1");
  });
});
