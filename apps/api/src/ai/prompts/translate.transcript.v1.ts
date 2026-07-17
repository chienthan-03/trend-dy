import { z } from "zod";
import type { RemixTranscriptV1 } from "@factory/shared";

export const TRANSLATE_TRANSCRIPT_V1_KEY = "translate.transcript.v1";

const translatedSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string(),
});

export const translateTranscriptResponseSchema = z.object({
  segments: z.array(translatedSegmentSchema).min(1),
});

export type TranslateTranscriptResponse = z.infer<
  typeof translateTranscriptResponseSchema
>;

export const TRANSLATE_TRANSCRIPT_SYSTEM = [
  "Bạn là dịch giả chuyên nghiệp cho transcript video Douyin/TikTok.",
  "",
  "Nhiệm vụ: dịch CHÍNH XÁC sang tiếng Việt từng segment trong transcript STT.",
  "",
  "Quy tắc bắt buộc:",
  "- Dịch sát nghĩa, trung thành nội dung gốc; KHÔNG tóm tắt, KHÔNG viết lại kiểu recap.",
  "- Giữ đúng số lượng segment và đúng từng index — phải trả đủ MỌI index được gửi.",
  "- Segment tiếng Anh hoặc ngôn ngữ khác cũng dịch sang tiếng Việt.",
  "- CẤM để lại chữ Hán (汉字) trong bản dịch; mỗi `text` phải là tiếng Việt thuần.",
  "- Nếu rõ ràng là lỗi STT (từ vô nghĩa, nghe nhầm), có thể sửa nhẹ khi dịch dựa trên ngữ cảnh lân cận.",
  "- Tiếng Việt tự nhiên, dễ đọc, nhưng ưu tiên độ chính xác hơn văn phong hoa mỹ.",
  "- Không thêm giải thích, không bọc markdown.",
  "- Trả về JSON đúng schema.",
].join("\n");

export const buildTranslateTranscriptPrompt = (input: {
  sourceLanguage: string;
  segments: Array<{
    index: number;
    startSec: number;
    endSec: number;
    text: string;
  }>;
  contextBefore?: string;
}): string => {
  const payload = {
    source_language: input.sourceLanguage,
    context_before: input.contextBefore ?? "",
    segments: input.segments.map((segment) => ({
      index: segment.index,
      start_sec: segment.startSec,
      end_sec: segment.endSec,
      text: segment.text,
    })),
    output_schema: {
      segments: [{ index: 0, text: "bản dịch tiếng Việt" }],
    },
  };

  return [
    "Dịch các segment sau sang tiếng Việt.",
    "Giữ nguyên index; chỉ trả text đã dịch.",
    "Không được bỏ sót index; không được giữ chữ Hán trong text.",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
};

export const mergeTranslatedSegments = (
  source: RemixTranscriptV1,
  translated: TranslateTranscriptResponse,
): RemixTranscriptV1["segments"] => {
  const byIndex = new Map(
    translated.segments.map((segment) => [segment.index, segment.text.trim()]),
  );

  return source.segments.map((segment, index) => ({
    startSec: segment.startSec,
    endSec: segment.endSec,
    text: byIndex.get(index) || segment.text,
  }));
};
