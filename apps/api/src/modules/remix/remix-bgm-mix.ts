import {
  REMIX_BGM_DEFAULT_SPEED,
  REMIX_BGM_DEFAULT_VOLUME,
  REMIX_BGM_SPEED_MAX,
  REMIX_BGM_SPEED_MIN,
} from "@factory/shared";

export type BgmMixOptions = {
  volume: number;
  speed: number;
  startSec: number;
};

export const resolveBgmVolume = (persisted: number | null | undefined): number => {
  if (persisted == null) return REMIX_BGM_DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, persisted));
};

export const resolveBgmSpeed = (persisted: number | null | undefined): number => {
  if (persisted == null) return REMIX_BGM_DEFAULT_SPEED;
  return Math.min(REMIX_BGM_SPEED_MAX, Math.max(REMIX_BGM_SPEED_MIN, persisted));
};

export const resolveBgmStartSec = (
  persisted: number | null | undefined,
  maxSec?: number,
): number => {
  const start = persisted == null ? 0 : Math.max(0, persisted);
  if (maxSec != null && maxSec > 0) {
    return Math.min(start, Math.max(0, maxSec - 0.05));
  }
  return start;
};

const buildAtempoSegment = (speed: number): string =>
  speed === 1 ? "" : `atempo=${speed},`;

export const buildBgmMixFilterComplex = (opts: BgmMixOptions): string => {
  const trim =
    opts.startSec > 0
      ? `atrim=start=${opts.startSec},asetpts=PTS-STARTPTS,`
      : "";
  const atempo = buildAtempoSegment(opts.speed);
  return `[2:a]${trim}${atempo}volume=${opts.volume}[bgm_processed];[bgm_processed]aloop=loop=-1:size=2e+09[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
};
