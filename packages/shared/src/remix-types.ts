export const REMIX_JOB_TYPES = [
  "remix_resolve",
  "remix_fetch_detail",
  "remix_download_media",
  "remix_stt",
  "remix_translate",
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

export const REMIX_SCRIPT_MODES = ["caption", "full"] as const;
export type RemixScriptMode = (typeof REMIX_SCRIPT_MODES)[number];

export const REMIX_PIPELINE_PHASES = [
  "pending",
  "resolving",
  "fetching_detail",
  "downloading_media",
  "transcribing",
  "translating",
  "generating",
  "ready",
  "failed",
] as const;
export type RemixPipelinePhase = (typeof REMIX_PIPELINE_PHASES)[number];

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type RemixTranscriptV1 = {
  version: 1;
  language: string;
  durationSec: number;
  segments: RemixTranscriptSegment[];
  fullText: string;
  provider: string;
  model: string;
};

export type RemixSubtitlesV2 = RemixPackageV1["subtitles"] & {
  timing_source: "estimated" | "stt";
};
