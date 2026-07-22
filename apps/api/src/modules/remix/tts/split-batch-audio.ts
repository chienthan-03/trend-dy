import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg } from "../remix-audio.util";
import type { CueForBatch } from "./batch-cues-for-tts";

export type CueAudioSlice = {
  index: number;
  startSec: number;
  endSec: number;
  /** Slice cut from the batch TTS audio (not yet tempo-fitted). */
  buffer: Buffer;
  /** Duration of this slice inside the batch audio timeline. */
  sliceDurationSec: number;
};

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const isFakeTtsMode = (): boolean =>
  process.env.REMIX_TTS_MODE?.trim().toLowerCase() === "fake";

const cueWindowSec = (cue: CueForBatch): number =>
  Math.max(cue.endSec - cue.startSec, 0.1);

/**
 * Allocate contiguous time ranges inside a batch TTS clip using each cue's
 * timeline window as weight (matches Phân đoạn durations better than raw chars).
 */
export const allocateBatchSliceRanges = (
  cues: CueForBatch[],
  batchAudioDurationSec: number,
): Array<{ index: number; offsetSec: number; durationSec: number }> => {
  if (cues.length === 0) return [];

  const weights = cues.map((cue) => cueWindowSec(cue));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const total = Math.max(batchAudioDurationSec, 0.1);

  let cursor = 0;
  return cues.map((cue, i) => {
    const isLast = i === cues.length - 1;
    const share = weights[i]! / weightSum;
    const durationSec = isLast
      ? Math.max(total - cursor, 0.05)
      : Math.max(total * share, 0.05);
    const offsetSec = cursor;
    cursor += durationSec;
    return { index: cue.index, offsetSec, durationSec };
  });
};

const sliceFakeByRatio = (
  mp3Buffer: Buffer,
  offsetSec: number,
  durationSec: number,
  totalDurationSec: number,
): Buffer => {
  const total = Math.max(totalDurationSec, 0.1);
  const startByte = Math.floor((offsetSec / total) * mp3Buffer.length);
  const endByte = Math.min(
    mp3Buffer.length,
    Math.max(
      startByte + 1,
      Math.floor(((offsetSec + durationSec) / total) * mp3Buffer.length),
    ),
  );
  return mp3Buffer.subarray(startByte, endByte);
};

const sliceMp3Window = async (
  mp3Buffer: Buffer,
  offsetSec: number,
  durationSec: number,
): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-batch-slice-"));
  const inputPath = join(dir, "input.mp3");
  const outputPath = join(dir, "slice.mp3");

  try {
    await writeFile(inputPath, mp3Buffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-ss",
      Math.max(offsetSec, 0).toFixed(3),
      "-t",
      Math.max(durationSec, 0.05).toFixed(3),
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "24000",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Cut one batch TTS mp3 into per-cue slices that will later be tempo-fitted
 * into each Segment's startSec/endSec window (Phân đoạn).
 */
export const splitBatchAudioToCues = async (input: {
  cues: CueForBatch[];
  batchMp3: Buffer;
  batchAudioDurationSec: number;
}): Promise<CueAudioSlice[]> => {
  const { cues, batchMp3, batchAudioDurationSec } = input;
  const ranges = allocateBatchSliceRanges(cues, batchAudioDurationSec);

  const slices: CueAudioSlice[] = [];
  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i]!;
    const range = ranges[i]!;
    const buffer = isFakeTtsMode()
      ? sliceFakeByRatio(
          batchMp3,
          range.offsetSec,
          range.durationSec,
          batchAudioDurationSec,
        )
      : await sliceMp3Window(batchMp3, range.offsetSec, range.durationSec);

    slices.push({
      index: cue.index,
      startSec: cue.startSec,
      endSec: cue.endSec,
      buffer,
      sliceDurationSec: range.durationSec,
    });
  }

  return slices;
};
