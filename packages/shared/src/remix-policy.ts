import type { RemixPolicyChecklist } from "./remix-types";

export const defaultRemixPolicyChecklist = (): RemixPolicyChecklist => ({
  scriptRewritten: false,
  hookIsNew: false,
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
  c.scriptRewritten &&
  c.hookIsNew &&
  c.hasStudioBrand &&
  c.voiceWillBeRerecorded &&
  c.noFullReupload &&
  c.leadApproved;
