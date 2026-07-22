import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFfmpeg } from "../remix-audio.util";
import { getSttAudioBitrateKbps } from "../remix-config";

export type DubTimelineSegment = {
  startSec: number;
  endSec: number;
  fittedMp3Buffer: Buffer;
};

export type AssembleDubTimelineInput = {
  segments: DubTimelineSegment[];
  totalDurationSec: number;
};

const isFakeTtsMode = (): boolean => process.env.REMIX_TTS_MODE === "fake";

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const DUB_SAMPLE_RATE = 44100;

/**
 * Max segment inputs per ffmpeg process (plus 1 lavfi silence bed).
 * Windows CreateProcess caps command lines (~32k); 405 absolute temp paths
 * overflow that. Batches of ~40 stay safe even with absolute `-i` paths.
 */
export const getAssembleMixBatchSize = (): number => {
  const n = Number(process.env.REMIX_TTS_ASSEMBLE_BATCH_SIZE ?? "40");
  if (!Number.isFinite(n) || n < 1) return 40;
  return Math.floor(n);
};

export const chunkSegmentsForAssemble = <T>(
  items: T[],
  batchSize: number = getAssembleMixBatchSize(),
): T[][] => {
  const size = Math.max(1, batchSize);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

type FilterComplexOptions = {
  /** Apply loudnorm on the mixed output (final pass only). */
  applyLoudnorm: boolean;
};

/**
 * Build a single ffmpeg filter_complex graph that:
 *  - generates a silent "bed" input (index 0) spanning the full timeline
 *  - delays every segment (inputs 1..N) to its absolute `startSec` offset
 *    via `adelay` (per-channel millisecond delay)
 *  - sums the bed + delayed segments with `amix`, clamped to the bed's
 *    duration so accidental TTS overrun never extends the final track
 */
export const buildFilterComplex = (
  segments: Pick<DubTimelineSegment, "startSec">[],
  options: FilterComplexOptions = { applyLoudnorm: true },
): string => {
  const delayStages = segments
    .map((segment, index) => {
      const delayMs = Math.max(Math.round(segment.startSec * 1000), 0);
      return `[${index + 1}:a]adelay=${delayMs}|${delayMs}[seg${index}]`;
    })
    .join(";");

  const mixInputs = ["[0:a]", ...segments.map((_, index) => `[seg${index}]`)].join(
    "",
  );
  // normalize=0: default amix divides volume by input count (bed + N segs),
  // which makes the dub almost inaudible. loudnorm restores broadcast level.
  const mixLabel = options.applyLoudnorm ? "[mixed]" : "[out]";
  const mixStage = `${mixInputs}amix=inputs=${segments.length + 1}:duration=first:dropout_transition=0:normalize=0${mixLabel}`;
  if (!options.applyLoudnorm) {
    return `${delayStages};${mixStage}`;
  }

  return `${delayStages};${mixStage};[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
};

/** Mix pre-baked full-length layer tracks (no adelay). */
export const buildLayersMixFilter = (
  layerCount: number,
  options: FilterComplexOptions = { applyLoudnorm: true },
): string => {
  if (layerCount < 1) {
    throw new Error("buildLayersMixFilter requires at least one layer");
  }

  if (layerCount === 1) {
    return options.applyLoudnorm
      ? `[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[out]`
      : `[0:a]aresample=${DUB_SAMPLE_RATE}[out]`;
  }

  const mixInputs = Array.from({ length: layerCount }, (_, i) => `[${i}:a]`).join(
    "",
  );
  const mixLabel = options.applyLoudnorm ? "[mixed]" : "[out]";
  const mixStage = `${mixInputs}amix=inputs=${layerCount}:duration=first:dropout_transition=0:normalize=0${mixLabel}`;
  if (!options.applyLoudnorm) {
    return mixStage;
  }

  return `${mixStage};[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
};

const assertMp3Exists = async (path: string, label: string): Promise<void> => {
  try {
    await access(path);
  } catch {
    throw new Error(`assemble-dub: missing ${label} at ${path}`);
  }
  const buffer = await readFile(path);
  if (buffer.length < 64) {
    throw new Error(
      `assemble-dub: ${label} too small (${buffer.length} bytes) at ${path}`,
    );
  }
};

const synthesizeSilenceMp3 = async (durationSec: number): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-dub-silence-"));
  const outputPath = join(dir, "output.mp3");

  try {
    await runFfmpeg(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${DUB_SAMPLE_RATE}:cl=stereo:d=${Math.max(durationSec, 0.1).toFixed(3)}`,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      `${bitrateKbps}k`,
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

type MixSegmentBatchInput = {
  ffmpeg: string;
  bitrateKbps: number;
  bedDurationSec: string;
  /** Absolute paths to segment mp3s. */
  segmentPaths: string[];
  segments: Pick<DubTimelineSegment, "startSec">[];
  /** Absolute path for the mixed output. */
  outputPath: string;
  applyLoudnorm: boolean;
};

/**
 * One ffmpeg mix: lavfi silence bed + N segment inputs.
 * Uses absolute `-i` / output paths (safe with or without spawn `cwd`).
 */
const mixSegmentBatch = async (input: MixSegmentBatchInput): Promise<string> => {
  const {
    ffmpeg,
    bitrateKbps,
    bedDurationSec,
    segmentPaths,
    segments,
    outputPath,
    applyLoudnorm,
  } = input;

  if (segmentPaths.length !== segments.length) {
    throw new Error("mixSegmentBatch: segmentPaths/segments length mismatch");
  }

  await runFfmpeg(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=${DUB_SAMPLE_RATE}:cl=stereo:d=${bedDurationSec}`,
    ...segmentPaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    buildFilterComplex(segments, { applyLoudnorm }),
    "-map",
    "[out]",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${bitrateKbps}k`,
    "-f",
    "mp3",
    outputPath,
  ]);

  await assertMp3Exists(outputPath, "batch mix output");
  return outputPath;
};

const mixLayerFiles = async (input: {
  ffmpeg: string;
  bitrateKbps: number;
  /** Absolute paths to full-length layer mp3s. */
  layerPaths: string[];
  outputPath: string;
}): Promise<Buffer> => {
  const { ffmpeg, bitrateKbps, layerPaths, outputPath } = input;

  for (const [index, layerPath] of layerPaths.entries()) {
    await assertMp3Exists(layerPath, `layer_${index}`);
  }

  await runFfmpeg(ffmpeg, [
    "-y",
    ...layerPaths.flatMap((path) => ["-i", path]),
    "-filter_complex",
    buildLayersMixFilter(layerPaths.length, { applyLoudnorm: true }),
    "-map",
    "[out]",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${bitrateKbps}k`,
    "-f",
    "mp3",
    outputPath,
  ]);

  await assertMp3Exists(outputPath, "final dub output");
  return readFile(outputPath);
};

/**
 * Assemble per-segment TTS clips into a single dub audio track that stays
 * synced to the original video timeline.
 *
 * Approach: generate a silent "bed" spanning `totalDurationSec`, then
 * overlay every fitted segment clip at its absolute `startSec` offset
 * using ffmpeg's `adelay` + `amix` filters (rather than naive concatenation,
 * which would drift out of sync the moment any segment's fitted duration
 * differs — even slightly — from its `endSec - startSec` window). `amix`
 * also tolerates any accidental micro-overlap between adjacent segments by
 * summing them instead of erroring, and `duration=first` clamps the output
 * to the bed's length so a segment that still overruns after fitting can
 * never stretch the final render.
 *
 * Large cue counts are mixed in batches then layered, so Windows does not
 * hit `spawn ENAMETOOLONG` from hundreds of absolute `-i` paths.
 *
 * Under `REMIX_TTS_MODE=fake` we skip the filter graph entirely and just
 * concatenate the segment buffers directly — the fake adapter emits tiny
 * placeholder MP3s, and CI only needs to exercise the calling code path
 * without depending on a real ffmpeg build being present.
 */
export const assembleDubTimeline = async (
  input: AssembleDubTimelineInput,
): Promise<Buffer> => {
  const { segments, totalDurationSec } = input;

  if (isFakeTtsMode()) {
    if (segments.length === 0) {
      return Buffer.alloc(0);
    }
    return Buffer.concat(segments.map((segment) => segment.fittedMp3Buffer));
  }

  if (segments.length === 0) {
    return synthesizeSilenceMp3(totalDurationSec);
  }

  const ffmpeg = getFfmpegPath();
  // Dub preview should not reuse the ultra-low STT bitrate (often 24kbps).
  const bitrateKbps = Math.max(getSttAudioBitrateKbps(), 128);
  const dir = await mkdtemp(join(tmpdir(), "remix-dub-assemble-"));
  const bedDurationSec = Math.max(totalDurationSec, 0.1).toFixed(3);

  try {
    const segmentPaths = await Promise.all(
      segments.map(async (segment, index) => {
        const path = join(dir, `seg_${index}.mp3`);
        await writeFile(path, segment.fittedMp3Buffer);
        return path;
      }),
    );

    const batches = chunkSegmentsForAssemble(
      segments.map((segment, index) => ({
        segment,
        path: segmentPaths[index]!,
      })),
    );

    if (batches.length === 1) {
      const batch = batches[0]!;
      const outputPath = await mixSegmentBatch({
        ffmpeg,
        bitrateKbps,
        bedDurationSec,
        segmentPaths: batch.map((item) => item.path),
        segments: batch.map((item) => item.segment),
        outputPath: join(dir, "output.mp3"),
        applyLoudnorm: true,
      });
      // Must await before finally — otherwise rm(dir) races the read.
      return await readFile(outputPath);
    }

    const layerPaths: string[] = [];
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]!;
      const layerPath = join(dir, `layer_${batchIndex}.mp3`);
      await mixSegmentBatch({
        ffmpeg,
        bitrateKbps,
        bedDurationSec,
        segmentPaths: batch.map((item) => item.path),
        segments: batch.map((item) => item.segment),
        outputPath: layerPath,
        applyLoudnorm: false,
      });
      layerPaths.push(layerPath);
    }

    // Must await before finally — bare `return mixLayerFiles(...)` lets
    // `rm(dir)` delete layer_*.mp3 while the final mix is still starting
    // (classic async try/finally footgun; looked like a Windows cwd bug).
    return await mixLayerFiles({
      ffmpeg,
      bitrateKbps,
      layerPaths,
      outputPath: join(dir, "output.mp3"),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
