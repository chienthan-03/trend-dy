import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
 * Build a single ffmpeg filter_complex graph that:
 *  - generates a silent "bed" input (index 0) spanning the full timeline
 *  - delays every segment (inputs 1..N) to its absolute `startSec` offset
 *    via `adelay` (per-channel millisecond delay)
 *  - sums the bed + delayed segments with `amix`, clamped to the bed's
 *    duration so accidental TTS overrun never extends the final track
 */
const buildFilterComplex = (segments: DubTimelineSegment[]): string => {
  const delayStages = segments
    .map((segment, index) => {
      const delayMs = Math.max(Math.round(segment.startSec * 1000), 0);
      return `[${index + 1}:a]adelay=${delayMs}|${delayMs}[seg${index}]`;
    })
    .join(";");

  const mixInputs = ["[0:a]", ...segments.map((_, index) => `[seg${index}]`)].join("");
  // normalize=0: default amix divides volume by input count (bed + N segs),
  // which makes the dub almost inaudible. loudnorm restores broadcast level.
  const mixStage = `${mixInputs}amix=inputs=${segments.length + 1}:duration=first:dropout_transition=0:normalize=0[mixed]`;
  const loudStage = `[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]`;

  return `${delayStages};${mixStage};${loudStage}`;
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

  try {
    const segmentPaths = await Promise.all(
      segments.map(async (segment, index) => {
        const path = join(dir, `seg_${index}.mp3`);
        await writeFile(path, segment.fittedMp3Buffer);
        return path;
      }),
    );

    const outputPath = join(dir, "output.mp3");
    const bedDurationSec = Math.max(totalDurationSec, 0.1).toFixed(3);

    await runFfmpeg(ffmpeg, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${DUB_SAMPLE_RATE}:cl=stereo:d=${bedDurationSec}`,
      ...segmentPaths.flatMap((path) => ["-i", path]),
      "-filter_complex",
      buildFilterComplex(segments),
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

    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
