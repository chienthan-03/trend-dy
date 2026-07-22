import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assembleDubTimeline,
  buildFilterComplex,
  buildLayersMixFilter,
  chunkSegmentsForAssemble,
  getAssembleMixBatchSize,
} from "./assemble-dub";

describe("chunkSegmentsForAssemble", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("splits 405 cues into batches of 40 (Windows argv safe)", () => {
    process.env.REMIX_TTS_ASSEMBLE_BATCH_SIZE = "40";
    const items = Array.from({ length: 405 }, (_, i) => i);
    const batches = chunkSegmentsForAssemble(items);
    expect(getAssembleMixBatchSize()).toBe(40);
    expect(batches).toHaveLength(11);
    expect(batches[0]).toHaveLength(40);
    expect(batches.at(-1)).toHaveLength(5);
    expect(batches.flat()).toHaveLength(405);
  });
});

describe("buildFilterComplex", () => {
  it("applies loudnorm on the final mix by default", () => {
    const graph = buildFilterComplex([{ startSec: 1.5 }, { startSec: 3 }]);
    expect(graph).toContain("adelay=1500|1500");
    expect(graph).toContain("amix=inputs=3");
    expect(graph).toContain("loudnorm=");
    expect(graph).toContain("[out]");
  });

  it("omits loudnorm for intermediate layer mixes", () => {
    const graph = buildFilterComplex([{ startSec: 0 }], { applyLoudnorm: false });
    expect(graph).not.toContain("loudnorm");
    expect(graph).toMatch(/amix=inputs=2.*\[out\]/);
  });
});

describe("buildLayersMixFilter", () => {
  it("mixes multiple full-length layers with a single loudnorm", () => {
    const graph = buildLayersMixFilter(11);
    expect(graph).toContain("amix=inputs=11");
    expect(graph).toContain("loudnorm=");
  });
});

describe("assembleDubTimeline (fake mode)", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    process.env.REMIX_TTS_MODE = "fake";
  });

  afterEach(() => {
    process.env = env;
  });

  it("concatenates segment buffers without invoking ffmpeg", async () => {
    const seg1 = Buffer.from("segment-one");
    const seg2 = Buffer.from("segment-two");

    const result = await assembleDubTimeline({
      segments: [
        { startSec: 0, endSec: 2, fittedMp3Buffer: seg1 },
        { startSec: 2, endSec: 4, fittedMp3Buffer: seg2 },
      ],
      totalDurationSec: 4,
    });

    expect(result).toEqual(Buffer.concat([seg1, seg2]));
  });

  it("returns an empty buffer when there are no segments", async () => {
    const result = await assembleDubTimeline({ segments: [], totalDurationSec: 10 });
    expect(result.length).toBe(0);
  });
});

describe("assembleDubTimeline (ffmpeg integration)", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.REMIX_TTS_MODE;
  });

  afterEach(() => {
    process.env = env;
  });

  it.runIf(process.env.FFMPEG_INTEGRATION === "1")(
    "mixes delayed segments onto a silence bed and returns a playable MP3",
    async () => {
      const { buildMinimalWav, runFfmpeg } = await import("../remix-audio.util");
      const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
      const dir = await mkdtemp(join(tmpdir(), "remix-dub-assemble-test-"));

      try {
        const wavPath = join(dir, "seg.wav");
        const mp3Path = join(dir, "seg.mp3");
        await writeFile(wavPath, buildMinimalWav(1));
        await runFfmpeg(ffmpeg, [
          "-y",
          "-i",
          wavPath,
          "-codec:a",
          "libmp3lame",
          "-f",
          "mp3",
          mp3Path,
        ]);
        const segmentBuffer = await readFile(mp3Path);

        const result = await assembleDubTimeline({
          segments: [
            { startSec: 0, endSec: 1, fittedMp3Buffer: segmentBuffer },
            { startSec: 2, endSec: 3, fittedMp3Buffer: segmentBuffer },
          ],
          totalDurationSec: 4,
        });

        expect(result.length).toBeGreaterThan(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.env.FFMPEG_INTEGRATION === "1")(
    "multi-batch layer mix awaits final mix before temp cleanup",
    async () => {
      process.env.REMIX_TTS_ASSEMBLE_BATCH_SIZE = "2";
      const { buildMinimalWav, runFfmpeg } = await import("../remix-audio.util");
      const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
      const dir = await mkdtemp(join(tmpdir(), "remix-dub-layers-test-"));

      try {
        const wavPath = join(dir, "seg.wav");
        const mp3Path = join(dir, "seg.mp3");
        await writeFile(wavPath, buildMinimalWav(0.4));
        await runFfmpeg(ffmpeg, [
          "-y",
          "-i",
          wavPath,
          "-codec:a",
          "libmp3lame",
          "-f",
          "mp3",
          mp3Path,
        ]);
        const segmentBuffer = await readFile(mp3Path);

        // 5 segments → batch size 2 → 3 layers → mixLayerFiles path
        const result = await assembleDubTimeline({
          segments: Array.from({ length: 5 }, (_, i) => ({
            startSec: i * 0.5,
            endSec: i * 0.5 + 0.4,
            fittedMp3Buffer: segmentBuffer,
          })),
          totalDurationSec: 3,
        });

        expect(result.length).toBeGreaterThan(1000);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
