import type { RemixPackageV1, RemixTranscriptV1 } from "@factory/shared";
import { z } from "zod";

export const REMIX_PACKAGE_V2_KEY = "remix.package.v2";

/** Max transcript chars sent to LLM for packaging context. */
export const REMIX_PACKAGE_V2_CONTEXT_CHARS = 2500;

const packagingSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(3),
  description: z.string().min(1),
  hashtags: z.array(z.string().min(1)).min(1),
});

const transformNotesV2Schema = z.object({
  source_language: z.string().min(1),
  rewrite_strategy: z.string().min(1),
  risks: z.array(z.string()).default([]),
  input_mode: z.literal("transcript_full"),
  source_duration_sec: z.number().positive(),
});

/** What the LLM returns — titles / description / hashtags only. */
export const remixPackageV2LlmSchema = z.object({
  locale: z.literal("vi"),
  packaging: packagingSchema,
  transform_notes: transformNotesV2Schema,
});

/** Stored package keeps empty banners/subtitles for RemixPackageV1 compat. */
export const remixPackageV2Schema = remixPackageV2LlmSchema.extend({
  banners: z.object({
    top: z.string(),
    bottom: z.string(),
    watermark: z.string(),
  }),
  subtitles: z.object({
    format: z.literal("srt"),
    timing_source: z.literal("stt"),
    cues: z.array(
      z.object({
        start: z.string().min(1),
        end: z.string().min(1),
        text: z.string().min(1),
      }),
    ),
  }),
});

export type RemixPackageV2 = z.infer<typeof remixPackageV2Schema>;

export const REMIX_PACKAGE_V2_OUTPUT_SCHEMA = {
  locale: "vi",
  packaging: {
    titles: ["string", "string", "string"],
    description: "string",
    hashtags: ["string"],
  },
  transform_notes: {
    input_mode: "transcript_full",
    source_duration_sec: "number",
    source_language: "string",
    rewrite_strategy: "packaging_only",
    risks: ["string"],
  },
} as const;

export const REMIX_PACKAGE_V2_SYSTEM_RULES = [
  "Bạn là chuyên gia đóng gói metadata video recap tiếng Việt cho Douyin/TikTok.",
  "",
  "Quy tắc bắt buộc:",
  "- Toàn bộ output phải bằng tiếng Việt.",
  "- Chỉ tạo packaging: titles (đúng 3 biến thể), description, hashtags.",
  "- KHÔNG tạo banners, watermark, subtitles, SRT, narration, hook.",
  "- Viết theo phong cách recap; KHÔNG dịch word-by-word.",
  "- Nguồn chỉ để lấy cảm hứng; output đứng độc lập.",
  "- Tránh sao chép nguyên văn tên riêng có bản quyền.",
  "- Trả về JSON đúng schema, không markdown, không field thừa.",
  "",
  "Schema JSON:",
  JSON.stringify(REMIX_PACKAGE_V2_OUTPUT_SCHEMA, null, 2),
].join("\n");

export const REMIX_PACKAGE_V2_SEED = {
  key: REMIX_PACKAGE_V2_KEY,
  version: 4,
  locale: "vi",
  body: REMIX_PACKAGE_V2_SYSTEM_RULES,
  modelHint: "strong",
  outputSchema: REMIX_PACKAGE_V2_OUTPUT_SCHEMA,
} as const;

export type RemixPromptV2Input = {
  caption: string;
  title: string;
  genre: string;
  locale: string;
  transcript: RemixTranscriptV1;
};

export const buildRemixPromptV2 = (
  input: RemixPromptV2Input,
): { system: string; user: string } => {
  const fullText = input.transcript.fullText.trim();
  const excerpt =
    fullText.length > REMIX_PACKAGE_V2_CONTEXT_CHARS
      ? `${fullText.slice(0, REMIX_PACKAGE_V2_CONTEXT_CHARS)}…`
      : fullText;

  const user = [
    `Locale output: ${input.locale}`,
    `Thể loại: ${input.genre}`,
    `Tiêu đề gốc: ${input.title}`,
    "Caption/mô tả nguồn (tham khảo):",
    input.caption,
    "",
    "Transcript excerpt (chỉ để viết titles + description + hashtags):",
    excerpt,
    "",
    `Duration: ${input.transcript.durationSec}s`,
    `Source duration (sec): ${input.transcript.durationSec}`,
  ].join("\n");

  return {
    system: REMIX_PACKAGE_V2_SYSTEM_RULES,
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

export const parseRemixPackageV2Json = (raw: string): RemixPackageV2 => {
  const jsonText = extractJsonPayload(raw);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const {
    banners: _banners,
    subtitles: _subtitles,
    ...packagingOnly
  } = parsed;
  const llm = remixPackageV2LlmSchema.parse(packagingOnly);

  // Pad/truncate to exactly 3 titles for the editor.
  const titles = [...llm.packaging.titles].slice(0, 3);
  while (titles.length < 3) {
    titles.push(titles[titles.length - 1] ?? "Untitled");
  }

  return {
    locale: "vi",
    banners: { top: "", bottom: "", watermark: "" },
    packaging: {
      ...llm.packaging,
      titles,
    },
    subtitles: {
      format: "srt",
      timing_source: "stt",
      cues: [],
    },
    transform_notes: llm.transform_notes,
  };
};

/** Parsed v2 package is compatible with RemixPackageV1 plus v2-only fields. */
export type RemixPackageV2Compatible = RemixPackageV1 & {
  subtitles: RemixPackageV1["subtitles"] & {
    timing_source: "stt";
  };
  transform_notes: RemixPackageV1["transform_notes"] & {
    input_mode: "transcript_full";
    source_duration_sec: number;
  };
};
