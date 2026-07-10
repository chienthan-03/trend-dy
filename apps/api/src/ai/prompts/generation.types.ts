export const GENERATION_TYPES = [
  "summary.chapter",
  "summary.arc",
  "script.narration",
  "outline.video",
  "pack.title",
  "pack.thumbnail_text",
  "pack.description",
  "pack.tags",
  "pack.hook_3s",
] as const;

export type GenerationType = (typeof GENERATION_TYPES)[number];

export const GENERATION_TYPE_TO_JOB: Record<GenerationType, string> = {
  "summary.chapter": "gen_summary_chapter",
  "summary.arc": "gen_summary_arc",
  "script.narration": "gen_script_narration",
  "outline.video": "gen_outline_video",
  "pack.title": "gen_pack_title",
  "pack.thumbnail_text": "gen_pack_thumbnail_text",
  "pack.description": "gen_pack_description",
  "pack.tags": "gen_pack_tags",
  "pack.hook_3s": "gen_pack_hook_3s",
};

export const JOB_TO_GENERATION_TYPE = Object.fromEntries(
  Object.entries(GENERATION_TYPE_TO_JOB).map(([type, job]) => [
    job,
    type as GenerationType,
  ]),
) as Record<string, GenerationType>;

export const CHAPTER_SCOPED_TYPES: GenerationType[] = [
  "summary.chapter",
  "script.narration",
  "outline.video",
];

export const ARC_SCOPED_TYPES: GenerationType[] = [
  "summary.arc",
  "pack.title",
  "pack.thumbnail_text",
  "pack.description",
  "pack.tags",
  "pack.hook_3s",
];
