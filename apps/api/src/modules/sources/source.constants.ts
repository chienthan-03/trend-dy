export const LICENSE_STATUSES = [
  "cleared",
  "pending",
  "rejected",
  "research_only",
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const SOURCE_TYPES = [
  "manual",
  "rss",
  "url",
  "douyin_board",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
