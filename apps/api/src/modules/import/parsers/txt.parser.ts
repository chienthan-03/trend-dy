import type { ParsedChapter } from "./types";

const HEADING_RE = /^(Chương|Chapter)\s+\d+/im;

/**
 * Split plain text into chapters on Vietnamese/English heading markers.
 * MVP: replace-all import later; parser only returns ordered chapters.
 */
export const parseTxt = (raw: string): ParsedChapter[] => {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");

  const headingIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i] ?? "")) {
      headingIndexes.push(i);
    }
  }

  if (headingIndexes.length === 0) {
    const body = text.trim();
    if (!body) {
      return [];
    }
    return [{ number: 1, title: "Chapter 1", text: body }];
  }

  const chapters: ParsedChapter[] = [];
  for (let i = 0; i < headingIndexes.length; i++) {
    const start = headingIndexes[i]!;
    const end = headingIndexes[i + 1] ?? lines.length;
    const title = (lines[start] ?? "").trim();
    const body = lines
      .slice(start + 1, end)
      .join("\n")
      .trim();
    const numberMatch = title.match(/\d+/);
    chapters.push({
      number: numberMatch ? Number(numberMatch[0]) : i + 1,
      title,
      text: body,
    });
  }

  return chapters;
};
