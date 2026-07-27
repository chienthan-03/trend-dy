import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeAudioDurationSec, runFfmpeg } from "../remix-audio.util";

export type SegmentFitPlan = {
  action: "pad" | "speed" | "shorten" | "ok";
  speed: number;
  padSec?: number;
};

export type SegmentFitInput = {
  audioDurationSec: number;
  targetDurationSec: number;
  maxSpeed: number;
};

const DURATION_EPSILON_SEC = 0.05;

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const isFakeTtsMode = (): boolean => process.env.REMIX_TTS_MODE === "fake";

export const planSegmentFit = (input: SegmentFitInput): SegmentFitPlan => {
  const { audioDurationSec, targetDurationSec, maxSpeed } = input;

  if (audioDurationSec <= targetDurationSec + DURATION_EPSILON_SEC) {
    if (Math.abs(audioDurationSec - targetDurationSec) <= DURATION_EPSILON_SEC) {
      return { action: "ok", speed: 1 };
    }

    return {
      action: "pad",
      padSec: targetDurationSec - audioDurationSec,
      speed: 1,
    };
  }

  const requiredSpeed = audioDurationSec / targetDurationSec;

  if (requiredSpeed <= maxSpeed) {
    return { action: "speed", speed: requiredSpeed };
  }

  return { action: "shorten", speed: maxSpeed };
};

const buildAtempoFilter = (speed: number): string => {
  const filters: string[] = [];
  let remaining = speed;

  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }

  filters.push(`atempo=${remaining}`);
  return filters.join(",");
};

export const applyPad = async (buffer: Buffer, padSec: number): Promise<Buffer> => {
  if (isFakeTtsMode()) {
    return buffer;
  }

  if (padSec <= 0) {
    return buffer;
  }

  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-pad-"));
  const inputPath = join(dir, "input.audio");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-af",
      `apad=pad_dur=${padSec}`,
      "-codec:a",
      "libmp3lame",
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const applyTempo = async (buffer: Buffer, speed: number): Promise<Buffer> => {
  if (isFakeTtsMode()) {
    return buffer;
  }

  if (Math.abs(speed - 1) < 0.001) {
    return buffer;
  }

  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-tempo-"));
  const inputPath = join(dir, "input.audio");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-af",
      buildAtempoFilter(speed),
      "-codec:a",
      "libmp3lame",
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** User-facing base speaking rate (applied before timeline fit). */
export const applyBaseTtsSpeed = async (
  buffer: Buffer,
  durationSec: number,
  baseSpeed: number,
): Promise<{ buffer: Buffer; durationSec: number }> => {
  if (Math.abs(baseSpeed - 1) < 0.001) {
    return { buffer, durationSec };
  }

  const adjustedBuffer = await applyTempo(buffer, baseSpeed);
  return { buffer: adjustedBuffer, durationSec: durationSec / baseSpeed };
};

/**
 * Hard-cut audio to `durationSec` so a clip that still overruns after max
 * atempo cannot spill into the next cue window (adelay + amix would sum voices).
 */
export const applyTruncate = async (
  buffer: Buffer,
  durationSec: number,
): Promise<Buffer> => {
  if (isFakeTtsMode()) {
    return buffer;
  }

  const target = Math.max(durationSec, 0.05);
  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-trim-"));
  const inputPath = join(dir, "input.audio");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-t",
      target.toFixed(3),
      "-codec:a",
      "libmp3lame",
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export type FitToTargetResult = {
  buffer: Buffer;
  /** True when the plan required max-speed + hard truncate (fit failure). */
  truncated: boolean;
};

const enforceMaxClipDuration = async (
  buffer: Buffer,
  maxDurationSec: number,
): Promise<FitToTargetResult> => {
  if (isFakeTtsMode()) {
    return { buffer, truncated: false };
  }

  const actualSec = await probeAudioDurationSec(buffer, "mp3");
  if (
    actualSec == null ||
    actualSec <= maxDurationSec + DURATION_EPSILON_SEC
  ) {
    return { buffer, truncated: false };
  }

  return {
    buffer: await applyTruncate(buffer, maxDurationSec),
    truncated: true,
  };
};

/**
 * Apply pad/tempo/shorten for a cue window. On `shorten`, tempo to maxSpeed
 * then hard-truncate to `targetDurationSec` so the clip cannot overrun.
 * Always probes the fitted buffer and truncates if it still exceeds the window
 * (guards against underestimated slice durations in smart-batch Piper splits).
 */
export const applyFitToTarget = async (
  buffer: Buffer,
  plan: SegmentFitPlan,
  targetDurationSec: number,
): Promise<FitToTargetResult> => {
  let result: FitToTargetResult;

  if (plan.action === "pad" && plan.padSec) {
    result = { buffer: await applyPad(buffer, plan.padSec), truncated: false };
  } else if (plan.action === "speed") {
    result = { buffer: await applyTempo(buffer, plan.speed), truncated: false };
  } else if (plan.action === "shorten") {
    const sped = await applyTempo(buffer, plan.speed);
    result = {
      buffer: await applyTruncate(sped, targetDurationSec),
      truncated: true,
    };
  } else {
    result = { buffer, truncated: false };
  }

  const enforced = await enforceMaxClipDuration(result.buffer, targetDurationSec);
  return {
    buffer: enforced.buffer,
    truncated: result.truncated || enforced.truncated,
  };
};
