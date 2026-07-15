import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSttAudioBitrateKbps } from "./remix-config";

export type SttAudioExtract = {
  buffer: Buffer;
  contentType: "audio/mpeg" | "audio/wav";
  fileName: string;
};

export const buildMinimalWav = (durationSec = 1): Buffer => {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = numSamples * (bitsPerSample / 8);
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.alloc(dataSize)]);
};

const runFfmpeg = (ffmpegPath: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg exited with code ${code}: ${stderr.trim() || "no stderr output"}`,
        ),
      );
    });
  });

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

/** Mono MP3 tuned for speech STT — much smaller than 16 kHz WAV. */
export const extractAudioForStt = async (
  videoBuffer: Buffer,
): Promise<SttAudioExtract> => {
  if (process.env.REMIX_STT_MODE === "fake") {
    const buffer = buildMinimalWav();
    return { buffer, contentType: "audio/wav", fileName: "audio.wav" };
  }

  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-"));
  const inputPath = join(dir, "input.bin");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, videoBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-vn",
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
    const buffer = await readFile(outputPath);
    return { buffer, contentType: "audio/mpeg", fileName: "audio.mp3" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** @deprecated Use extractAudioForStt */
export const extractAudioWav = async (videoBuffer: Buffer): Promise<Buffer> =>
  (await extractAudioForStt(videoBuffer)).buffer;

/** Re-encode any audio buffer (e.g. legacy WAV in storage) to compact MP3 for STT. */
export const compressAudioBufferForStt = async (
  audioBuffer: Buffer,
): Promise<Buffer> => {
  if (process.env.REMIX_STT_MODE === "fake") {
    return audioBuffer;
  }

  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-compress-"));
  const inputPath = join(dir, "input.audio");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, audioBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-vn",
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Split large MP3 into time-based chunks for Whisper's 25 MB upload cap. */
export const splitMp3ForStt = async (
  mp3Buffer: Buffer,
  segmentSec = 600,
): Promise<Buffer[]> => {
  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-chunks-"));
  const inputPath = join(dir, "input.mp3");
  const outputPattern = join(dir, "chunk_%03d.mp3");

  try {
    await writeFile(inputPath, mp3Buffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-f",
      "segment",
      "-segment_time",
      String(segmentSec),
      "-codec",
      "copy",
      outputPattern,
    ]);

    const names = (await readdir(dir))
      .filter((name) => name.startsWith("chunk_") && name.endsWith(".mp3"))
      .sort();

    if (names.length === 0) {
      return [mp3Buffer];
    }

    return Promise.all(names.map((name) => readFile(join(dir, name))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
