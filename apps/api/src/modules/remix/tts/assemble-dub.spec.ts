import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleDubTimeline } from "./assemble-dub";

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
});
