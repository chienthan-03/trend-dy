import type { GenerationType } from "./generation.types";

export type GenerationContext = {
  storyTitle: string;
  language: string;
  characters: Array<{
    name: string;
    role: string | null;
    summary: string | null;
  }>;
  events: Array<{
    summary: string;
    importance: number;
    chapterId: string;
  }>;
  arcs: Array<{
    name: string;
    summary: string | null;
  }>;
  chunks: Array<{
    chapterId: string;
    ordinal: number;
    text: string;
  }>;
};

const renderContextBlock = (context: GenerationContext): string => {
  const characters = context.characters
    .map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}: ${c.summary ?? ""}`)
    .join("\n");
  const events = context.events
    .map((e) => `- [${e.importance}] ${e.summary}`)
    .join("\n");
  const arcs = context.arcs
    .map((a) => `- ${a.name}: ${a.summary ?? ""}`)
    .join("\n");
  const chunks = context.chunks
    .map((c) => `[chunk ${c.ordinal}] ${c.text}`)
    .join("\n\n");

  return [
    `Truyện: ${context.storyTitle}`,
    "",
    "Nhân vật:",
    characters || "(không có)",
    "",
    "Sự kiện:",
    events || "(không có)",
    "",
    "Cung truyện:",
    arcs || "(không có)",
    "",
    "Đoạn trích (top-k chunks):",
    chunks || "(không có)",
  ].join("\n");
};

export const buildGenerationPrompt = (input: {
  templateBody: string;
  type: GenerationType;
  context: GenerationContext;
}): string => {
  const contextBlock = renderContextBlock(input.context);

  return input.templateBody
    .replace(/\{\{context\}\}/g, contextBlock)
    .replace(/\{\{type\}\}/g, input.type)
    .replace(/\{\{story_title\}\}/g, input.context.storyTitle);
};

export const PROMPT_TEMPLATE_SEEDS: Array<{
  key: GenerationType;
  version: number;
  locale: string;
  body: string;
  modelHint?: string;
}> = [
  {
    key: "summary.chapter",
    version: 1,
    locale: "vi",
    body: "Viết tóm tắt chương bằng tiếng Việt, 150–300 từ, dựa trên ngữ cảnh sau.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "summary.arc",
    version: 1,
    locale: "vi",
    body: "Viết tóm tắt cung truyện bằng tiếng Việt, 200–400 từ.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "script.narration",
    version: 1,
    locale: "vi",
    body: "Viết kịch bản thuyết minh tiếng Việt cho video recap, giọng kể hấp dẫn.\n\n{{context}}",
    modelHint: "strong",
  },
  {
    key: "outline.video",
    version: 1,
    locale: "vi",
    body: "Lập dàn ý video recap (beats có thứ tự) bằng tiếng Việt.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "pack.title",
    version: 1,
    locale: "vi",
    body: "Đề xuất 3 tiêu đề video Douyin/TikTok bằng tiếng Việt cho \"{{story_title}}\".\n\n{{context}}",
    modelHint: "strong",
  },
  {
    key: "pack.thumbnail_text",
    version: 1,
    locale: "vi",
    body: "Viết 3 dòng text thumbnail ngắn, gây tò mò, tiếng Việt.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "pack.description",
    version: 1,
    locale: "vi",
    body: "Viết mô tả video 1–2 câu tiếng Việt kèm CTA.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "pack.tags",
    version: 1,
    locale: "vi",
    body: "Đề xuất 8–12 hashtag tiếng Việt dạng JSON array chuỗi.\n\n{{context}}",
    modelHint: "mid",
  },
  {
    key: "pack.hook_3s",
    version: 1,
    locale: "vi",
    body: "Viết hook mở đầu 3 giây đầu video, 1–2 câu tiếng Việt.\n\n{{context}}",
    modelHint: "strong",
  },
];
