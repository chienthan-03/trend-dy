import type { RemixPackageV1, RemixPolicyChecklist } from "./remix-types";

export const defaultRemixPolicyChecklist = (): RemixPolicyChecklist => ({
  hasStudioBrand: false,
  voiceWillBeRerecorded: false,
  noFullReupload: false,
  leadApproved: false,
});

/** Jaccard-like word overlap on normalized tokens — advisory only */
export const literalOverlapRatio = (source: string, target: string): number => {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );
  const a = tokenize(source);
  const b = tokenize(target);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / Math.max(a.size, b.size);
};

export const isPolicyChecklistComplete = (c: RemixPolicyChecklist): boolean =>
  c.hasStudioBrand &&
  c.voiceWillBeRerecorded &&
  c.noFullReupload &&
  c.leadApproved;

export const toSlimRemixPackage = (raw: unknown): RemixPackageV1 => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const banners = (o.banners ?? {}) as RemixPackageV1["banners"];
  const packaging = (o.packaging ?? {}) as RemixPackageV1["packaging"];
  const subtitles = (o.subtitles ?? { format: "srt", cues: [] }) as RemixPackageV1["subtitles"];
  const transform_notes = (o.transform_notes ?? {
    source_language: "unknown",
    rewrite_strategy: "packaging_subtitles",
    risks: [],
  }) as RemixPackageV1["transform_notes"];

  return {
    locale: "vi",
    banners: {
      top: banners.top ?? "",
      bottom: banners.bottom ?? "",
      watermark: banners.watermark ?? "",
    },
    packaging: {
      titles: Array.isArray(packaging.titles) ? packaging.titles : [],
      description: packaging.description ?? "",
      hashtags: Array.isArray(packaging.hashtags) ? packaging.hashtags : [],
    },
    subtitles: {
      format: "srt",
      cues: Array.isArray(subtitles.cues) ? subtitles.cues : [],
      ...(typeof (subtitles as { timing_source?: string }).timing_source === "string"
        ? {
            timing_source: (subtitles as { timing_source: "estimated" | "stt" })
              .timing_source,
          }
        : {}),
    } as RemixPackageV1["subtitles"],
    transform_notes,
  };
};
