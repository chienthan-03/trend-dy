import type { RemixPackageV1, RemixTranscriptV1 } from "@factory/shared";
import { z } from "zod";
import { remixPackageV1Schema } from "./remix.package.v1";

export const REMIX_PACKAGE_V2_KEY = "remix.package.v2";

const subtitleCueSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  text: z.string().min(1),
});

const subtitlesV2Schema = z.object({
  format: z.literal("srt"),
  timing_source: z.enum(["estimated", "stt"]),
  cues: z.array(subtitleCueSchema).min(1),
});

const transformNotesV2Schema = z.object({
  source_language: z.string().min(1),
  rewrite_strategy: z.string().min(1),
  risks: z.array(z.string()).default([]),
  input_mode: z.literal("transcript_full"),
  source_duration_sec: z.number().positive(),
});

export const remixPackageV2Schema = remixPackageV1Schema
  .omit({ subtitles: true, transform_notes: true })
  .extend({
    subtitles: subtitlesV2Schema,
    transform_notes: transformNotesV2Schema,
  });

export type RemixPackageV2 = z.infer<typeof remixPackageV2Schema>;

export const REMIX_PACKAGE_V2_OUTPUT_SCHEMA = {
  locale: "vi",
  banners: { top: "string", bottom: "string", watermark: "string" },
  packaging: {
    titles: ["string"],
    description: "string",
    hashtags: ["string"],
  },
  subtitles: {
    format: "srt",
    timing_source: "estimated | stt",
    cues: [{ start: "HH:MM:SS,mmm", end: "HH:MM:SS,mmm", text: "string" }],
  },
  transform_notes: {
    input_mode: "transcript_full",
    source_duration_sec: "number",
    source_language: "string",
    rewrite_strategy: "string",
    risks: ["string"],
  },
} as const;

export const REMIX_PACKAGE_V2_SYSTEM_RULES = [
  "Bạn là chuyên gia đóng gói video recap tiếng Việt cho Douyin/TikTok.",
  "",
  "Quy tắc bắt buộc:",
  "- Toàn bộ output phải bằng tiếng Việt.",
  "- Bạn nhận TRANSCRIPT đầy đủ của video (có timestamp từng đoạn).",
  "- Tạo banners (top, bottom, watermark) tiếng Việt phù hợp thể loại và nội dung transcript.",
  "- Tạo packaging: titles (3 biến thể), description, hashtags tiếng Việt.",
  "- Tạo subtitles SRT tiếng Việt từ transcript; subtitles.cues phải bám timing STT (start/end giữ nguyên hoặc chỉnh nhẹ ≤500ms).",
  "- subtitles.timing_source phải là \"stt\".",
  "- Viết lại theo phong cách recap; KHÔNG dịch word-by-word hay sentence-by-sentence.",
  "- Nguồn chỉ để lấy cảm hứng; output phải đứng độc lập, không phụ thuộc nguyên bản.",
  "- Tránh sao chép nguyên văn tên riêng có bản quyền; dùng tương đương tiếng Việt khi tự nhiên.",
  "- Trả về JSON đúng schema remix.package.v2, không kèm markdown.",
  "",
  "Schema JSON:",
  JSON.stringify(REMIX_PACKAGE_V2_OUTPUT_SCHEMA, null, 2),
].join("\n");

export const REMIX_PACKAGE_V2_SEED = {
  key: REMIX_PACKAGE_V2_KEY,
  version: 2,
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
  const segmentCount = input.transcript.segments.length;

  const user = [
    `Locale output: ${input.locale}`,
    `Thể loại: ${input.genre}`,
    `Tiêu đề gốc: ${input.title}`,
    "Caption/mô tả nguồn (tham khảo, tạo banners và packaging tiếng Việt):",
    input.caption,
    "",
    `Transcript segments (${segmentCount}) — tạo phụ đề tiếng Việt bám timing STT:`,
    JSON.stringify(input.transcript.segments, null, 2),
    "",
    "Full text:",
    input.transcript.fullText,
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
  return remixPackageV2Schema.parse(JSON.parse(jsonText));
};

/** Parsed v2 package is compatible with RemixPackageV1 plus v2-only fields. */
export type RemixPackageV2Compatible = RemixPackageV1 & {
  subtitles: RemixPackageV1["subtitles"] & {
    timing_source: "estimated" | "stt";
  };
  transform_notes: RemixPackageV1["transform_notes"] & {
    input_mode: "transcript_full";
    source_duration_sec: number;
  };
};
