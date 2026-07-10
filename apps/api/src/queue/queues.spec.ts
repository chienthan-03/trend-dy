import { describe, expect, it } from "vitest";
import { QUEUE_NAMES } from "./queues";

describe("QUEUE_NAMES", () => {
  it("includes import, understand, generate, asset, discovery", () => {
    expect(QUEUE_NAMES).toEqual(
      expect.arrayContaining([
        "import",
        "understand",
        "generate",
        "asset",
        "discovery",
      ]),
    );
    expect(QUEUE_NAMES).toHaveLength(5);
  });
});
