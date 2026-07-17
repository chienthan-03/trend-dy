import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMinimalWav, runFfmpeg } from "../remix-audio.util";
import { getSttAudioBitrateKbps } from "../remix-config";
import type { TtsAdapter, TtsSynthesizeInput, TtsSynthesizeResult } from "./tts.adapter";

/** Duration heuristic for fake TTS — keeps segment-fit tests realistic. */
export const estimateFakeTtsDurationSec = (text: string): number =>
  Math.max(0.4, text.length * 0.05);

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const MINIMAL_MP3 = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const synthesizeMp3 = async (durationSec: number): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-fake-tts-"));
  const wavPath = join(dir, "input.wav");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(wavPath, buildMinimalWav(durationSec));
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      wavPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      `${bitrateKbps}k`,
      "-f",
      "mp3",
      outputPath,
    ]);
    return await readFile(outputPath);
  } catch {
    return MINIMAL_MP3;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export class FakeTtsAdapter implements TtsAdapter {
  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const durationSec = estimateFakeTtsDurationSec(input.text);
    const buffer = await synthesizeMp3(durationSec);

    return {
      buffer,
      contentType: "audio/mpeg",
      durationSec,
      costUsd: 0,
    };
  }
}
