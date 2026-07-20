import { z } from "zod";
import type { RemixSegmentRole } from "@factory/shared";

export const REMIX_SEGMENT_ROLES_V1_KEY = "remix.segment-roles.v1";

const remixSegmentRoleSchema: z.ZodType<RemixSegmentRole> = z.enum(["narration", "source"]);

const remixSegmentRoleEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  role: remixSegmentRoleSchema,
});

export const remixSegmentRolesV1ResponseSchema = z.object({
  roles: z.array(remixSegmentRoleEntrySchema),
});

export type RemixSegmentRolesV1Response = z.infer<
  typeof remixSegmentRolesV1ResponseSchema
>;

export const REMIX_SEGMENT_ROLES_V1_OUTPUT_SCHEMA = {
  roles: [{ index: 0, role: "narration | source" }],
} as const;

export const REMIX_SEGMENT_ROLES_V1_SYSTEM = [
  "Bạn là biên tập viên phân loại từng dòng transcript video recap Douyin/TikTok.",
  "",
  "Nhiệm vụ: với mỗi dòng (đã ghép cặp bản gốc tiếng Trung + bản dịch tiếng Việt),",
  "phân loại thành đúng MỘT trong hai vai trò:",
  '- "narration": lời thuyết minh/bình luận của reviewer (người kể chuyện đứng ngoài phim).',
  '- "source": lời thoại/tiếng động trong phim gốc (nhân vật nói, SFX có tiếng nói).',
  "",
  "Quy tắc bắt buộc:",
  "- Trả đủ MỌI index được gửi, đúng số lượng, không thêm không thiếu.",
  "- Mỗi index chỉ xuất hiện đúng 1 lần với đúng 1 role.",
  '- Chỉ dùng giá trị role là "narration" hoặc "source".',
  "- Không giải thích, không bọc markdown.",
  "- Trả về đúng JSON theo schema.",
  "",
  "Schema JSON:",
  JSON.stringify(REMIX_SEGMENT_ROLES_V1_OUTPUT_SCHEMA, null, 2),
].join("\n");

export type RemixSegmentRolePair = {
  index: number;
  sourceText: string;
  translatedText: string;
};

export type RemixSegmentRolesPromptInput = {
  pairs: RemixSegmentRolePair[];
};

export const buildRemixSegmentRolesPrompt = (
  input: RemixSegmentRolesPromptInput,
): { system: string; user: string } => {
  const payload = {
    pairs: input.pairs.map((pair) => ({
      index: pair.index,
      source_zh: pair.sourceText,
      translated_vi: pair.translatedText,
    })),
    output_schema: REMIX_SEGMENT_ROLES_V1_OUTPUT_SCHEMA,
  };

  const user = [
    // Marker lets the fake gateway recognize this prompt without a DB-backed template lookup.
    `[${REMIX_SEGMENT_ROLES_V1_KEY}]`,
    "Phân loại role cho từng dòng sau. Giữ nguyên index; chỉ trả role đã phân loại.",
    "Không được bỏ sót index.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  return { system: REMIX_SEGMENT_ROLES_V1_SYSTEM, user };
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

/**
 * Parses the LLM's raw text response into a dense, index-ordered role list.
 * Throws (rather than partial-applying) when the response is malformed, has
 * the wrong number of roles, is missing an index, or uses an unknown role —
 * callers must treat any throw as "leave existing roles unchanged".
 */
export const parseSegmentRolesJson = (
  raw: string,
  expectedLength: number,
): Array<{ index: number; role: RemixSegmentRole }> => {
  const jsonText = extractJsonPayload(raw);
  const parsed = remixSegmentRolesV1ResponseSchema.parse(JSON.parse(jsonText));

  if (parsed.roles.length !== expectedLength) {
    throw new Error(
      `remix.segment-roles.v1: expected ${expectedLength} roles, got ${parsed.roles.length}`,
    );
  }

  const byIndex = new Map(parsed.roles.map((entry) => [entry.index, entry.role]));
  const result: Array<{ index: number; role: RemixSegmentRole }> = [];
  for (let index = 0; index < expectedLength; index += 1) {
    const role = byIndex.get(index);
    if (!role) {
      throw new Error(`remix.segment-roles.v1: missing role for index ${index}`);
    }
    result.push({ index, role });
  }

  return result;
};
