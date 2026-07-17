import { z } from "zod";
import type { RemixBannerJson } from "@factory/shared";

export const REMIX_BANNERS_V1_KEY = "remix.banners.v1";

/** Letterbox bars are short; keep each line readable at small font sizes. */
export const REMIX_BANNERS_MAX_CHARS = 40;

/** Max transcript chars sent to LLM for banner hook context. */
export const REMIX_BANNERS_V1_CONTEXT_CHARS = 800;

const bannerFieldSchema = z.string().trim().max(REMIX_BANNERS_MAX_CHARS);

export const remixBannersV1ResponseSchema = z.object({
  header: bannerFieldSchema,
  bottom: bannerFieldSchema,
});

export type RemixBannersV1Response = z.infer<typeof remixBannersV1ResponseSchema>;

export const REMIX_BANNERS_V1_OUTPUT_SCHEMA = {
  header: `string (tối đa ${REMIX_BANNERS_MAX_CHARS} ký tự)`,
  bottom: `string (tối đa ${REMIX_BANNERS_MAX_CHARS} ký tự)`,
} as const;

export const REMIX_BANNERS_V1_SYSTEM = [
  "Bạn là biên tập viên tạo banner letterbox giật tít cho video recap Douyin/TikTok tiếng Việt.",
  "",
  "Nhiệm vụ: dựa trên đoạn transcript đã dịch, viết 2 dòng banner:",
  "- header: dòng banner phía trên video, giật tít/hấp dẫn để giữ chân người xem.",
  "- bottom: dòng banner phía dưới video, thúc đẩy theo dõi/xem tiếp.",
  "",
  "Quy tắc bắt buộc:",
  `- Mỗi dòng tối đa ${REMIX_BANNERS_MAX_CHARS} ký tự (kể cả khoảng trắng).`,
  "- Toàn bộ output bằng tiếng Việt, phong cách recap viral, sensational.",
  "- Ngắn gọn, súc tích, không giải thích, không bọc markdown.",
  "- Trả về đúng JSON theo schema, không thêm field thừa.",
  "",
  "Schema JSON:",
  JSON.stringify(REMIX_BANNERS_V1_OUTPUT_SCHEMA, null, 2),
].join("\n");

export const REMIX_BANNERS_V1_SEED = {
  key: REMIX_BANNERS_V1_KEY,
  version: 1,
  locale: "vi",
  body: REMIX_BANNERS_V1_SYSTEM,
  modelHint: "strong",
  outputSchema: REMIX_BANNERS_V1_OUTPUT_SCHEMA,
} as const;

export type RemixBannersPromptInput = {
  transcriptExcerpt: string;
  title?: string;
  genre?: string;
};

export const buildRemixBannersPrompt = (
  input: RemixBannersPromptInput,
): { system: string; user: string } => {
  const trimmedExcerpt = input.transcriptExcerpt.trim();
  const excerpt =
    trimmedExcerpt.length > REMIX_BANNERS_V1_CONTEXT_CHARS
      ? `${trimmedExcerpt.slice(0, REMIX_BANNERS_V1_CONTEXT_CHARS)}…`
      : trimmedExcerpt;

  const user = [
    // Marker lets the fake gateway recognize this prompt without a DB-backed template lookup.
    `[${REMIX_BANNERS_V1_KEY}]`,
    input.genre ? `Thể loại: ${input.genre}` : undefined,
    input.title ? `Tiêu đề gốc: ${input.title}` : undefined,
    "Transcript excerpt (tiếng Việt, đã dịch):",
    excerpt,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return { system: REMIX_BANNERS_V1_SYSTEM, user };
};

export const toRemixBannerJson = (
  response: RemixBannersV1Response,
): RemixBannerJson => ({
  header: response.header.trim().slice(0, REMIX_BANNERS_MAX_CHARS),
  bottom: response.bottom.trim().slice(0, REMIX_BANNERS_MAX_CHARS),
});
