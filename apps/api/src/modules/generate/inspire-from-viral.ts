import type { GenerationType } from "../../ai/prompts/generation.types";

export const PACKAGING_GENERATION_TYPES: GenerationType[] = [
  "pack.title",
  "pack.thumbnail_text",
  "pack.description",
  "pack.tags",
  "pack.hook_3s",
];

export type InspireFromViralOptions = {
  inspireGenre: string;
  includeScriptNarration?: boolean;
};

export const parseInspireFromViralOptions = (
  options?: Record<string, unknown>,
): InspireFromViralOptions | undefined => {
  const raw = options?.inspireFromViral;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const inspireGenre = (raw as { inspireGenre?: unknown }).inspireGenre;
  if (typeof inspireGenre !== "string" || inspireGenre.length === 0) {
    return undefined;
  }

  const includeScriptNarration = (raw as { includeScriptNarration?: unknown })
    .includeScriptNarration;

  return {
    inspireGenre,
    ...(includeScriptNarration === true ? { includeScriptNarration: true } : {}),
  };
};

export const shouldIncludeViralInspire = (
  type: GenerationType,
  options?: InspireFromViralOptions,
): boolean => {
  if (!options?.inspireGenre) {
    return false;
  }
  if (PACKAGING_GENERATION_TYPES.includes(type)) {
    return true;
  }
  return type === "script.narration" && options.includeScriptNarration === true;
};
