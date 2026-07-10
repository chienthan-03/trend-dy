import { describe, expect, it } from "vitest";
import { voiceScriptToSrt } from "./srt";

describe("voiceScriptToSrt", () => {
  it("splits sentences with at least ~3s per short cue", () => {
    const script = "Xin chào. Đây là thử nghiệm.";
    const srt = voiceScriptToSrt(script);

    expect(srt).toContain("Xin chào.");
    expect(srt).toContain("Đây là thử nghiệm.");
    expect(srt).toMatch(/00:00:00,000 --> 00:00:03,000/);
    expect(srt).toMatch(/00:00:03,000 --> 00:00:06,000/);
  });

  it("uses ~2.5 words/sec for longer sentences", () => {
    const longSentence =
      "một hai ba bốn năm sáu bảy tám chín mười một mười hai";
    const srt = voiceScriptToSrt(longSentence);
    const words = longSentence.split(/\s+/).length;
    const expectedSec = Math.max(3, words / 2.5);
    const endMs = Math.round(expectedSec * 1000);

    expect(srt).toMatch(
      new RegExp(`00:00:00,000 --> 00:00:${String(Math.floor(endMs / 1000)).padStart(2, "0")},${String(endMs % 1000).padStart(3, "0")}`),
    );
  });

  it("returns empty string for blank input", () => {
    expect(voiceScriptToSrt("   ")).toBe("");
  });
});
