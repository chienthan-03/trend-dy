import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg } from "../remix-audio.util";

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
