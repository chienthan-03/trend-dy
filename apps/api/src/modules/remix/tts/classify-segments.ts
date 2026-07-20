import type { RemixSegmentRole, RemixTranscriptSegment, RemixTranscriptV1 } from "@factory/shared";
import { completeText } from "../../../ai/gateway";
import {
  buildRemixSegmentRolesPrompt,
  parseSegmentRolesJson,
} from "../../../ai/prompts/remix.segment-roles.v1";

export type ClassifyRolesMode = "lazy" | "reclassify";

export type ClassifiedSegmentRole = {
  index: number;
  role: RemixSegmentRole;
};

export type ApplyClassifiedRolesInput = {
  segments: RemixTranscriptSegment[];
  classified: ClassifiedSegmentRole[];
  mode: ClassifyRolesMode;
};

/**
 * Applies auto-classified roles onto translated segments following the
 * overwrite rules from the design doc:
 * - "lazy": only fills segments where `role` is still unset (null/undefined).
 * - "reclassify": overwrites every segment except ones an editor manually set
 *   (`roleSource === "manual"`), which are always left untouched.
 */
export const applyClassifiedRoles = (
  input: ApplyClassifiedRolesInput,
): RemixTranscriptSegment[] => {
  const roleByIndex = new Map(input.classified.map((entry) => [entry.index, entry.role]));

  return input.segments.map((segment, index) => {
    const classifiedRole = roleByIndex.get(index);
    if (!classifiedRole) {
      return segment;
    }

    if (input.mode === "lazy") {
      if (segment.role != null) {
        return segment;
      }
      return { ...segment, role: classifiedRole, roleSource: "auto" };
    }

    if (segment.roleSource === "manual") {
      return segment;
    }
    return { ...segment, role: classifiedRole, roleSource: "auto" };
  });
};

const isFakeMode = (): boolean => process.env.LLM_MODE?.trim().toLowerCase() === "fake";

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

/** Matches `estimateFakeTtsDurationSec`'s ~20 chars/sec VI speaking-rate estimate. */
const FAKE_CLASSIFY_CHARS_PER_SEC = 20;
/** A translated line reading in under 40% of its window is "very short" for its slot. */
const FAKE_CLASSIFY_SHORT_WINDOW_RATIO = 0.4;

/**
 * Dependency-free classifier used under LLM_MODE=fake so CI never needs
 * network access. Deterministic heuristic: a CJK source line whose Vietnamese
 * translation reads much faster than its allotted window looks like a short
 * in-film utterance (dialogue/SFX) rather than full reviewer narration.
 */
export const classifyPairLocally = (input: {
  sourceText: string;
  translatedText: string;
  windowSec: number;
}): RemixSegmentRole => {
  if (!CJK_RE.test(input.sourceText)) {
    return "narration";
  }

  const translatedLen = input.translatedText.trim().length;
  const expectedReadSec = translatedLen / FAKE_CLASSIFY_CHARS_PER_SEC;
  const isVeryShortForWindow =
    input.windowSec > 0 && expectedReadSec < input.windowSec * FAKE_CLASSIFY_SHORT_WINDOW_RATIO;

  return isVeryShortForWindow ? "source" : "narration";
};

export type ClassifyTranslatedSegmentsInput = {
  source: RemixTranscriptV1;
  translated: RemixTranscriptV1;
  mode: ClassifyRolesMode;
};

export type ClassifyTranslatedSegmentsResult =
  | {
      ok: true;
      segments: RemixTranscriptSegment[];
      tokensIn?: number;
      tokensOut?: number;
    }
  | {
      ok: false;
      warning: string;
    };

/**
 * Classifies each translated segment as `narration` vs `source` using the
 * paired source (ZH) + translated (VI) line, then applies the result via
 * `applyClassifiedRoles`. Never partial-applies: a segment-count mismatch or
 * an unparsable/mismatched LLM response leaves existing roles untouched and
 * surfaces a `warning` instead.
 */
export const classifyTranslatedSegments = async (
  input: ClassifyTranslatedSegmentsInput,
): Promise<ClassifyTranslatedSegmentsResult> => {
  const { source, translated, mode } = input;

  if (source.segments.length !== translated.segments.length) {
    return {
      ok: false,
      warning:
        `Số lượng segment không khớp giữa bản gốc (${source.segments.length}) và ` +
        `bản dịch (${translated.segments.length}); giữ nguyên phân loại hiện tại.`,
    };
  }

  const expectedLength = translated.segments.length;
  if (expectedLength === 0) {
    return { ok: true, segments: translated.segments };
  }

  const pairs = translated.segments.map((segment, index) => ({
    index,
    sourceText: source.segments[index]!.text,
    translatedText: segment.text,
    windowSec: Math.max(0, segment.endSec - segment.startSec),
  }));

  let classified: ClassifiedSegmentRole[];
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;

  if (isFakeMode()) {
    classified = pairs.map((pair) => ({
      index: pair.index,
      role: classifyPairLocally(pair),
    }));
  } else {
    try {
      const { system, user } = buildRemixSegmentRolesPrompt({ pairs });
      const llm = await completeText(user, {
        type: "remix_classify_segments",
        system,
      });
      tokensIn = llm.tokensIn;
      tokensOut = llm.tokensOut;
      classified = parseSegmentRolesJson(llm.text, expectedLength);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        warning: `Không thể phân loại segment (LLM trả về không hợp lệ): ${message}`,
      };
    }
  }

  const segments = applyClassifiedRoles({
    segments: translated.segments,
    classified,
    mode,
  });

  return { ok: true, segments, tokensIn, tokensOut };
};
