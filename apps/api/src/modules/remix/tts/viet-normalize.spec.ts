import { describe, expect, it } from "vitest";
import { normalizeVietnameseForTts } from "./viet-normalize";

describe("normalizeVietnameseForTts", () => {
  it("expands integers and percents", () => {
    expect(normalizeVietnameseForTts("Giảm 50% còn 3 ngày")).toMatch(/phần trăm/);
    expect(normalizeVietnameseForTts("năm 2024")).toMatch(/hai nghìn|không|2024/);
  });

  it("phoneticizes common Latin tokens", () => {
    const out = normalizeVietnameseForTts("algorithm và iPhone");
    expect(out.toLowerCase()).not.toContain("algorithm");
  });

  it("returns trimmed empty for blank input", () => {
    expect(normalizeVietnameseForTts("   ")).toBe("");
  });
});
