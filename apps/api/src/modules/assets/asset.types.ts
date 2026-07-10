export const ASSET_TYPES = [
  "voice_script",
  "subtitle",
  "scene_list",
  "banner_text",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_TO_JOB: Record<AssetType, string> = {
  voice_script: "asset_voice_script",
  subtitle: "build_srt",
  scene_list: "scene_list",
  banner_text: "asset_banner_text",
};

export const JOB_TO_ASSET_TYPE = Object.fromEntries(
  Object.entries(ASSET_TYPE_TO_JOB).map(([type, job]) => [
    job,
    type as AssetType,
  ]),
) as Record<string, AssetType>;
