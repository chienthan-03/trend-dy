import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSttAudioBitrateKbps, getTtsMode } from "./remix-config";

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

export const runFfmpeg = (ffmpegPath: string, args: string[]): Promise<void> =>
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
const getFfprobePath = (): string => process.env.FFPROBE_PATH ?? "ffprobe";

const MINIMAL_MP3 = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

export const probeAudioDurationSec = async (
  buffer: Buffer,
  inputExt = "audio",
): Promise<number | null> => {
  const ffprobe = getFfprobePath();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-probe-"));
  const inputPath = join(dir, `input.${inputExt}`);

  try {
    await writeFile(inputPath, buffer);
    const durationSec = await new Promise<number | null>((resolve) => {
      const proc = spawn(
        ffprobe,
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          inputPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      let stdout = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on("error", () => resolve(null));
      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        const parsed = Number(stdout.trim());
        resolve(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      });
    });

    return durationSec;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Probe source video width/height (px) via ffprobe; null if unavailable. */
export const probeVideoDimensions = async (
  videoBuffer: Buffer,
): Promise<{ width: number; height: number } | null> => {
  const ffprobe = getFfprobePath();
  const dir = await mkdtemp(join(tmpdir(), "remix-video-probe-"));
  const inputPath = join(dir, "input.mp4");

  try {
    await writeFile(inputPath, videoBuffer);
    return await new Promise<{ width: number; height: number } | null>((resolve) => {
      const proc = spawn(
        ffprobe,
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height",
          "-of",
          "csv=p=0",
          inputPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      let stdout = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on("error", () => resolve(null));
      proc.on("close", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        const [width, height] = stdout.trim().split(",").map(Number);
        if (
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width! > 0 &&
          height! > 0
        ) {
          resolve({ width: width!, height: height! });
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Probe whether the source video has at least one audio stream. */
export const probeHasAudioStream = async (videoBuffer: Buffer): Promise<boolean> => {
  const ffprobe = getFfprobePath();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-stream-probe-"));
  const inputPath = join(dir, "input.mp4");

  try {
    await writeFile(inputPath, videoBuffer);
    return await new Promise<boolean>((resolve) => {
      const proc = spawn(
        ffprobe,
        [
          "-v",
          "error",
          "-select_streams",
          "a",
          "-show_entries",
          "stream=index",
          "-of",
          "csv=p=0",
          inputPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      let stdout = "";
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on("error", () => resolve(false));
      proc.on("close", (code) => {
        resolve(code === 0 && stdout.trim().length > 0);
      });
    });
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Convert WAV (or other non-MP3 audio) to MP3 for dub storage. */
export const convertWavToMp3 = async (wavBuffer: Buffer): Promise<Buffer> => {
  if (getTtsMode() === "fake") {
    try {
      return await convertWavToMp3WithFfmpeg(wavBuffer);
    } catch {
      return MINIMAL_MP3;
    }
  }

  return convertWavToMp3WithFfmpeg(wavBuffer);
};

const convertWavToMp3WithFfmpeg = async (wavBuffer: Buffer): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-dub-wav-"));
  const inputPath = join(dir, "input.wav");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, wavBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
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

/** Convert container audio (m4a/mp4) to MP3 for dub storage. */
export const convertContainerAudioToMp3 = async (
  audioBuffer: Buffer,
  inputExt: "m4a" | "mp4",
): Promise<Buffer> => {
  if (getTtsMode() === "fake") {
    try {
      return await convertContainerAudioToMp3WithFfmpeg(audioBuffer, inputExt);
    } catch {
      return MINIMAL_MP3;
    }
  }

  return convertContainerAudioToMp3WithFfmpeg(audioBuffer, inputExt);
};

const convertContainerAudioToMp3WithFfmpeg = async (
  audioBuffer: Buffer,
  inputExt: "m4a" | "mp4",
): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "remix-dub-container-"));
  const inputPath = join(dir, `input.${inputExt}`);
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, audioBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-vn",
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

/** Slice a timeline window from source audio into a compact mono MP3 for STT. */
export const sliceAudioWindowForStt = async (
  audioBuffer: Buffer,
  startSec: number,
  durationSec: number,
): Promise<Buffer> => {
  if (process.env.REMIX_STT_MODE === "fake") {
    return audioBuffer;
  }

  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-slice-"));
  const inputPath = join(dir, "input.audio");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(inputPath, audioBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-ss",
      Math.max(startSec, 0).toFixed(3),
      "-t",
      Math.max(durationSec, 0.1).toFixed(3),
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
