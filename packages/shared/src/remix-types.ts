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
  banners: { top: string; bottom: string; watermark: string };
  packaging: { titles: string[]; description: string; hashtags: string[] };
  subtitles: {
    format: "srt";
    cues: Array<{ start: string; end: string; text: string }>;
    /** Present on full-script (v2) packages; omit in caption mode. */
    timing_source?: "estimated" | "stt";
  };
  transform_notes: {
    source_language: string;
    rewrite_strategy: string;
    risks: string[];
  };
};

export type RemixPolicyChecklist = {
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

export const REMIX_SEGMENT_ROLES = ["narration", "source"] as const;
export type RemixSegmentRole = (typeof REMIX_SEGMENT_ROLES)[number];
export type RemixSegmentRoleSource = "auto" | "manual";

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  role?: RemixSegmentRole;
  roleSource?: RemixSegmentRoleSource;
};

export type RemixTranscriptWord = {
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
  /** Optional Whisper word timings — used to align TTS pauses to film beds. */
  words?: RemixTranscriptWord[];
};

export type RemixSubtitlesV2 = RemixPackageV1["subtitles"] & {
  timing_source: "estimated" | "stt";
};

export const REMIX_RENDER_MODES = ["audio_only", "banner_audio"] as const;
export type RemixRenderMode = (typeof REMIX_RENDER_MODES)[number];

export const REMIX_RENDER_PHASES = [
  "idle",
  "tts",
  "tts_ready",
  "rendering",
  "render_ready",
  "failed",
] as const;
export type RemixRenderPhase = (typeof REMIX_RENDER_PHASES)[number];

export type RemixBannerJson = {
  header: string;
  bottom: string;
};

export type RemixDubSource = "tts" | "upload";

export const REMIX_BGM_TRACK_IDS = [
  "bad-style-time-back",
  "asphyxia",
  "xomu-lanterns",
  "late-night-melancholy",
  "else-paris",
  "shiverr-whize",
] as const;
export type RemixBgmTrackId = (typeof REMIX_BGM_TRACK_IDS)[number];

export type RemixBgmTrack = {
  id: RemixBgmTrackId;
  label: string;
  previewUrl: string;
  durationSec: number;
};

export const REMIX_BGM_DEFAULT_VOLUME = 0.3;
export const REMIX_BGM_DEFAULT_SPEED = 1;
export const REMIX_BGM_SPEED_MIN = 0.5;
export const REMIX_BGM_SPEED_MAX = 2;

export type RemixTtsFitFailure = {
  indexes: number[];
};
