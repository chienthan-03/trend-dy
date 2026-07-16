import type { RemixPackageV1 } from "@factory/shared";
import { z } from "zod";

export const REMIX_PACKAGE_V1_KEY = "remix.package.v1";

const bannersSchema = z.object({
  top: z.string().min(1),
  bottom: z.string().min(1),
  watermark: z.string().min(1),
});

const packagingSchema = z.object({
  titles: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1),
});

const subtitleCueSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  text: z.string().min(1),
});

const subtitlesSchema = z.object({
  format: z.literal("srt"),
  cues: z.array(subtitleCueSchema).min(1),
});

const transformNotesSchema = z.object({
  source_language: z.string().min(1),
  rewrite_strategy: z.string().min(1),
  risks: z.array(z.string()).default([]),
});

export const remixPackageV1Schema = z.object({
  locale: z.literal("vi"),
  banners: bannersSchema,
  packaging: packagingSchema,
  subtitles: subtitlesSchema,
  transform_notes: transformNotesSchema,
});

export const REMIX_PACKAGE_V1_OUTPUT_SCHEMA = {
  locale: "vi",
  banners: { top: "string", bottom: "string", watermark: "string" },
  packaging: {
    titles: ["string"],
    description: "string",
    hashtags: ["string"],
  },
  subtitles: {
    format: "srt",
    cues: [{ start: "HH:MM:SS,mmm", end: "HH:MM:SS,mmm", text: "string" }],
  },
  transform_notes: {
    source_language: "string",
    rewrite_strategy: "string",
    risks: ["string"],
  },
} as const;

export const REMIX_PACKAGE_V1_SYSTEM_RULES = [
  "Bạn là chuyên gia đóng gói video recap tiếng Việt cho Douyin/TikTok.",
  "",
  "Quy tắc bắt buộc:",
  "- Toàn bộ output phải bằng tiếng Việt.",
  "- Tạo banners (top, bottom, watermark) tiếng Việt phù hợp thể loại và nội dung caption.",
  "- Tạo packaging: titles (3 biến thể), description, hashtags tiếng Việt.",
  "- Tạo subtitles SRT tiếng Việt từ caption; timing ước lượng (estimated) theo độ dài nội dung.",
  "- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.",
  "- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.",
  "- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.",
  "- Trả về JSON đúng schema remix.package.v1, không kèm markdown.",
  "",
  "Schema JSON:",
  JSON.stringify(REMIX_PACKAGE_V1_OUTPUT_SCHEMA, null, 2),
].join("\n");

export const REMIX_PACKAGE_V1_SEED = {
  key: REMIX_PACKAGE_V1_KEY,
  version: 2,
  locale: "vi",
  body: REMIX_PACKAGE_V1_SYSTEM_RULES,
  modelHint: "strong",
  outputSchema: REMIX_PACKAGE_V1_OUTPUT_SCHEMA,
} as const;

export type RemixPromptInput = {
  caption: string;
  title: string;
  genre: string;
  locale: string;
};

export const buildRemixPrompt = (
  input: RemixPromptInput,
): { system: string; user: string } => {
  const user = [
    `Locale output: ${input.locale}`,
    `Thể loại: ${input.genre}`,
    `Tiêu đề gốc: ${input.title}`,
    "Caption/mô tả nguồn (tạo banners, packaging và phụ đề tiếng Việt):",
    input.caption,
  ].join("\n");

  return {
    system: REMIX_PACKAGE_V1_SYSTEM_RULES,
    user,
  };
};

const extractJsonPayload = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
};

export const parseRemixPackageJson = (raw: string): RemixPackageV1 => {
  const jsonText = extractJsonPayload(raw);
  return remixPackageV1Schema.parse(JSON.parse(jsonText));
};
