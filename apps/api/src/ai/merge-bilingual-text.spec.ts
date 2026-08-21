import { describe, expect, it } from "vitest";
import {
  hasLatinDialogueText,
  mergeBilingualTextPasses,
} from "./merge-bilingual-text";

describe("hasLatinDialogueText", () => {
  it("detects ordinary English words and single-letter speech", () => {
    expect(hasLatinDialogueText("You are under arrest.")).toBe(true);
    expect(hasLatinDialogueText("I am ready.")).toBe(true);
    expect(hasLatinDialogueText("这是一句中文。")).toBe(false);
  });
});

describe("mergeBilingualTextPasses", () => {
  it("adds English-only text after the primary pass with explicit source roles", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "他走进酒馆。",
      englishText: "You are under arrest.",
      primaryLanguage: "zh",
      durationSec: 20,
      timeOffsetSec: 10,
    });

    expect(result.fullText).toBe("他走进酒馆。 You are under arrest.");
    expect(result.language).toBe("mixed");
    expect(result.addedEnglish).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({
      startSec: 10,
      text: "他走进酒馆。",
      role: "narration",
      roleSource: "auto",
    });
    expect(result.segments[1]).toMatchObject({
      text: "You are under arrest.",
      role: "source",
      roleSource: "auto",
    });
    expect(result.segments[1]!.startSec).toBeGreaterThanOrEqual(
      result.segments[0]!.endSec,
    );
    expect(result.segments.at(-1)!.endSec).toBe(30);
  });

  it("does not duplicate English already returned by the primary pass", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "He said Run!",
      englishText: "He said, run!",
      primaryLanguage: "en",
      durationSec: 8,
    });

    expect(result.addedEnglish).toBe(false);
    expect(result.fullText).toBe("He said Run!");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.role).toBe("source");
  });

  it("keeps only Latin dialogue from a noisy English pass", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "旁白继续。",
      englishText: "旁白 You should leave 现在。",
      primaryLanguage: "zh",
      durationSec: 5,
    });

    expect(result.fullText).toBe("旁白继续。 You should leave");
    expect(result.segments.at(-1)?.text).toContain("You should leave");
  });

  it("uses the complete window when the primary pass is empty", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "",
      englishText: "Stop right there.",
      primaryLanguage: "unknown",
      durationSec: 4,
      timeOffsetSec: 6,
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      startSec: 6,
      endSec: 10,
      role: "source",
    });
    expect(result.language).toBe("mixed");
  });

  it("places recovered English inside its source windows and leaves narration gaps", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "旁白一。旁白二。旁白三。",
      primaryLanguage: "zh",
      durationSec: 30,
      englishPasses: [
        {
          text: "Where is he?",
          timeOffsetSec: 10,
          durationSec: 5,
        },
      ],
    });

    const sourceSegment = result.segments.find(
      (segment) => segment.role === "source",
    );
    const sourceDurationSec =
      (sourceSegment?.endSec ?? 0) - (sourceSegment?.startSec ?? 0);

    expect(sourceSegment).toMatchObject({
      text: "Where is he?",
      roleSource: "auto",
    });
    expect(sourceSegment!.startSec).toBeGreaterThan(10);
    expect(sourceSegment!.endSec).toBeLessThan(15);
    expect(sourceDurationSec).toBeGreaterThan(0.5);
    expect(sourceDurationSec).toBeLessThan(5);
    expect(
      result.segments.some(
        (segment) =>
          segment.role === "narration" &&
          segment.startSec < 10 &&
          segment.startSec < segment.endSec,
      ),
    ).toBe(true);
    expect(
      result.segments.some(
        (segment) =>
          segment.role === "narration" &&
          segment.startSec >= sourceSegment!.endSec &&
          segment.endSec > segment.startSec,
      ),
    ).toBe(true);
    expect(
      result.segments.every(
        (segment, index, segments) =>
          index === 0 || segment.startSec >= segments[index - 1]!.endSec,
      ),
    ).toBe(true);
  });

  it("sizes recovered English long enough for a Vietnamese dub of the line", () => {
    const english = "Tell me, you know where I can find him?";
    const result = mergeBilingualTextPasses({
      primaryText: "旁白继续讲述。",
      primaryLanguage: "zh",
      durationSec: 30,
      englishPasses: [
        {
          text: english,
          timeOffsetSec: 0,
          durationSec: 30,
        },
      ],
    });

    const sourceDurationSec = result.segments
      .filter((segment) => segment.role === "source")
      .reduce((sum, segment) => sum + segment.endSec - segment.startSec, 0);

    expect(sourceDurationSec).toBeGreaterThan(english.length / 13);
    expect(sourceDurationSec).toBeLessThan(12);
  });

  it("places recovered English after review narration instead of jumping it to the front", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "他为了撑气场，在大雨中点燃了一根烟。",
      primaryLanguage: "zh",
      durationSec: 30,
      englishPasses: [
        {
          text: "Tell me, you know where I can find him?",
          timeOffsetSec: 0,
          durationSec: 30,
        },
      ],
    });

    const source = result.segments.find((segment) => segment.role === "source");
    const firstNarration = result.segments.find(
      (segment) => segment.role === "narration",
    );

    expect(firstNarration?.startSec).toBe(0);
    expect(firstNarration?.text).toContain("撑气场");
    expect(source?.text).toContain("Tell me");
    expect(source!.startSec).toBeGreaterThan(firstNarration!.startSec);
    expect(source!.endSec).toBeLessThan(28);
  });

  it("centers recovered English so review can continue after the clip", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "旁白一。旁白二。旁白三。",
      primaryLanguage: "zh",
      durationSec: 30,
      englishPasses: [
        {
          text: "Where is he?",
          timeOffsetSec: 0,
          durationSec: 30,
        },
      ],
    });

    const source = result.segments.find((segment) => segment.role === "source");
    const narration = result.segments.filter(
      (segment) => segment.role === "narration",
    );

    expect(source!.startSec).toBeGreaterThan(8);
    expect(source!.endSec).toBeLessThan(22);
    expect(narration[0]?.startSec).toBe(0);
    expect(narration.at(-1)?.endSec).toBeCloseTo(30, 0);
    expect(
      narration.some((segment) => segment.startSec >= source!.endSec - 0.05),
    ).toBe(true);
  });

  it("does not let English mixed into the primary transcript jump to the front", () => {
    const result = mergeBilingualTextPasses({
      primaryText:
        "Tell me, you know where I can find him?他为了撑气场，在大雨中点燃了一根烟。",
      primaryLanguage: "zh",
      durationSec: 30,
      englishPasses: [
        {
          text: "Tell me, you know where I can find him?",
          timeOffsetSec: 0,
          durationSec: 30,
        },
      ],
    });

    expect(result.segments[0]?.role).toBe("narration");
    expect(result.segments[0]?.text).toContain("撑气场");
    expect(result.segments.some((segment) => segment.role === "source")).toBe(
      true,
    );
    expect(result.segments.find((segment) => segment.role === "source")!.startSec).toBeGreaterThan(
      result.segments[0]!.startSec,
    );
    expect(result.fullText.startsWith("Tell me")).toBe(false);
    expect(result.fullText).toContain("撑气场");
  });

  it("does not let a long English search window starve movie-review narration", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "旁白一。旁白二。旁白三。旁白四。旁白五。",
      primaryLanguage: "zh",
      durationSec: 60,
      englishPasses: [
        {
          text: "Where is he?",
          timeOffsetSec: 0,
          durationSec: 30,
        },
      ],
    });

    const sourceDurationSec = result.segments
      .filter((segment) => segment.role === "source")
      .reduce((sum, segment) => sum + segment.endSec - segment.startSec, 0);
    const narrationDurationSec = result.segments
      .filter((segment) => segment.role === "narration")
      .reduce((sum, segment) => sum + segment.endSec - segment.startSec, 0);
    const narrationText = result.segments
      .filter((segment) => segment.role === "narration")
      .map((segment) => segment.text)
      .join("");

    expect(sourceDurationSec).toBeLessThan(5);
    expect(narrationDurationSec).toBeGreaterThan(50);
    expect(narrationText).toContain("旁白一");
    expect(narrationText).toContain("旁白五");
    expect(
      result.segments.some(
        (segment) =>
          segment.role === "narration" &&
          segment.startSec < 30 &&
          segment.endSec > segment.startSec,
      ),
    ).toBe(true);
  });

  it("keeps Chinese review when every search window returns a short English line", () => {
    const result = mergeBilingualTextPasses({
      primaryText: "这是电影解说旁白，讲述主角走进酒馆的经过。",
      primaryLanguage: "zh",
      durationSec: 60,
      englishPasses: [
        { text: "Stop.", timeOffsetSec: 0, durationSec: 30 },
        { text: "Let's go.", timeOffsetSec: 30, durationSec: 30 },
      ],
    });

    const narrationText = result.segments
      .filter((segment) => segment.role === "narration")
      .map((segment) => segment.text)
      .join("");
    const sourceDurationSec = result.segments
      .filter((segment) => segment.role === "source")
      .reduce((sum, segment) => sum + segment.endSec - segment.startSec, 0);

    expect(narrationText).toContain("电影解说");
    expect(narrationText).toContain("走进酒馆");
    expect(sourceDurationSec).toBeLessThan(8);
    expect(
      result.segments.some(
        (segment) =>
          segment.role === "narration" && segment.startSec < segment.endSec,
      ),
    ).toBe(true);
  });
});
