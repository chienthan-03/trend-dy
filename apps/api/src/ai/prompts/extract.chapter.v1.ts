import { z } from "zod";

export const EXTRACT_CHAPTER_V1_KEY = "extract.chapter.v1";

const characterExtractSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).optional().default([]),
  role: z.string().optional(),
  summary: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const relationshipExtractSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
});

const eventCharacterExtractSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional().default("actor"),
});

const eventExtractSchema = z.object({
  type: z.string().optional(),
  summary: z.string().min(1),
  importance: z.number().int().optional().default(0),
  characters: z.array(eventCharacterExtractSchema).optional().default([]),
});

const locationExtractSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
});

const abilityExtractSchema = z.object({
  name: z.string().min(1),
  character: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  power_level: z.number().optional(),
});

const itemExtractSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  owner: z.string().optional(),
});

const plotSignalExtractSchema = z.object({
  kind: z.string().min(1),
  text: z.string().min(1),
  strength: z.number().int().optional().default(0),
});

export const extractChapterV1Schema = z.object({
  characters: z.array(characterExtractSchema).default([]),
  relationships: z.array(relationshipExtractSchema).default([]),
  events: z.array(eventExtractSchema).default([]),
  locations: z.array(locationExtractSchema).default([]),
  abilities: z.array(abilityExtractSchema).default([]),
  items: z.array(itemExtractSchema).default([]),
  plot_signals: z.array(plotSignalExtractSchema).default([]),
  chapter_summary: z.string().min(1),
});

export type ExtractChapterV1 = z.infer<typeof extractChapterV1Schema>;
export type CharacterExtract = z.infer<typeof characterExtractSchema>;

export const buildExtractChapterPrompt = (input: {
  storyTitle: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  chapterText: string;
}): string => {
  const titleLine = input.chapterTitle
    ? `Tiêu đề: ${input.chapterTitle}`
    : `Chương ${input.chapterNumber}`;

  return [
    `Trích xuất đồ thị câu chuyện từ chương sau của "${input.storyTitle}".`,
    "Trả về JSON theo schema extract.chapter.v1.",
    "chapter_summary phải bằng tiếng Việt.",
    titleLine,
    "---",
    input.chapterText,
  ].join("\n");
};
