import { describe, expect, it } from "vitest";
import { parseTxt } from "./txt.parser";

describe("parseTxt", () => {
  it("parses txt into chapters by heading markers", () => {
    const chapters = parseTxt("Chương 1\nA\nChương 2\nB");
    expect(chapters).toHaveLength(2);
  });

  it("captures title and body text per chapter", () => {
    const chapters = parseTxt("Chương 1: Opening\nHello world\n\nChương 2\nSecond body");
    expect(chapters[0]).toMatchObject({
      number: 1,
      title: "Chương 1: Opening",
      text: "Hello world",
    });
    expect(chapters[1]).toMatchObject({
      number: 2,
      title: "Chương 2",
      text: "Second body",
    });
  });

  it("also splits on English Chapter headings", () => {
    const chapters = parseTxt("Chapter 1\nAlpha\nChapter 2\nBeta");
    expect(chapters).toHaveLength(2);
    expect(chapters[0]?.number).toBe(1);
    expect(chapters[1]?.number).toBe(2);
  });

  it("returns a single chapter when no headings are present", () => {
    const chapters = parseTxt("Just plain prose without markers.");
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({
      number: 1,
      text: "Just plain prose without markers.",
    });
  });
});
