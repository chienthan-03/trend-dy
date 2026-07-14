export const REMIX_JOB_TYPES = [
  "remix_resolve",
  "remix_fetch_detail",
  "remix_generate",
] as const;
export type RemixJobType = (typeof REMIX_JOB_TYPES)[number];

export const REMIX_STATUSES = ["pending", "running", "ready", "failed", "archived"] as const;
export type RemixStatus = (typeof REMIX_STATUSES)[number];

export const REMIX_USAGE_POLICIES = [
  "research_only",
  "remix_draft",
  "approved_for_export",
  "blocked",
] as const;
export type RemixUsagePolicy = (typeof REMIX_USAGE_POLICIES)[number];

export type RemixPackageV1 = {
  locale: "vi";
  script: {
    narration: string;
    duration_estimate_sec: number;
    sections: Array<{ label: string; text: string }>;
  };
  hook_3s: { spoken: string; on_screen: string; visual_hint: string };
  banners: { top: string; bottom: string; watermark: string };
  packaging: { titles: string[]; description: string; hashtags: string[] };
  subtitles: {
    format: "srt";
    cues: Array<{ start: string; end: string; text: string }>;
  };
  transform_notes: {
    source_language: string;
    rewrite_strategy: string;
    risks: string[];
  };
};

export type RemixPolicyChecklist = {
  scriptRewritten: boolean;
  hookIsNew: boolean;
  hasStudioBrand: boolean;
  voiceWillBeRerecorded: boolean;
  noFullReupload: boolean;
  leadApproved: boolean;
};
