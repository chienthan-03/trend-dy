import { describe, expect, it } from "vitest";
import {
  parseInspireFromViralOptions,
  shouldIncludeViralInspire,
} from "./inspire-from-viral";

describe("inspire-from-viral", () => {
  it("parses inspireFromViral from generate options", () => {
    expect(
      parseInspireFromViralOptions({
        inspireFromViral: { inspireGenre: "cultivation" },
      }),
    ).toEqual({ inspireGenre: "cultivation" });

    expect(
      parseInspireFromViralOptions({
        inspireFromViral: {
          inspireGenre: "fantasy",
          includeScriptNarration: true,
        },
      }),
    ).toEqual({
      inspireGenre: "fantasy",
      includeScriptNarration: true,
    });
  });

  it("returns undefined for invalid inspireFromViral options", () => {
    expect(parseInspireFromViralOptions(undefined)).toBeUndefined();
    expect(parseInspireFromViralOptions({})).toBeUndefined();
    expect(
      parseInspireFromViralOptions({ inspireFromViral: { inspireGenre: "" } }),
    ).toBeUndefined();
  });

  it("applies viral inspire to packaging types only by default", () => {
    const options = { inspireGenre: "cultivation" };

    expect(shouldIncludeViralInspire("pack.title", options)).toBe(true);
    expect(shouldIncludeViralInspire("summary.chapter", options)).toBe(false);
    expect(shouldIncludeViralInspire("script.narration", options)).toBe(false);
    expect(
      shouldIncludeViralInspire("script.narration", {
        ...options,
        includeScriptNarration: true,
      }),
    ).toBe(true);
  });
});
