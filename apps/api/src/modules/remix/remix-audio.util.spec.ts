import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMinimalWav, extractAudioForStt, extractAudioWav, probeClipDurationSec } from "./remix-audio.util";

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

      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim() || "no stderr output"}`));
    });
  });

describe("buildMinimalWav", () => {
  it("produces a valid WAV header", () => {
    const wav = buildMinimalWav(1);

    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(wav.subarray(12, 16).toString("ascii")).toBe("fmt ");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.subarray(36, 40).toString("ascii")).toBe("data");
    expect(wav.length).toBe(44 + 16000 * 2);
  });
});

describe("probeClipDurationSec", () => {
  it("falls back to estimate when probe cannot read the buffer", async () => {
    const durationSec = await probeClipDurationSec(Buffer.from("not-mp3"), 2.5);
    expect(durationSec).toBe(2.5);
  });

  it("never returns below 50ms", async () => {
    const durationSec = await probeClipDurationSec(Buffer.from("x"), 0);
    expect(durationSec).toBe(0.05);
  });
});

describe("extractAudioWav", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns a RIFF buffer in fake mode", async () => {
    process.env.REMIX_STT_MODE = "fake";

    const result = await extractAudioForStt(Buffer.from("fake-video"));

    expect(result.contentType).toBe("audio/wav");
    expect(result.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("extractAudioWav alias returns buffer only", async () => {
    process.env.REMIX_STT_MODE = "fake";
    const result = await extractAudioWav(Buffer.from("fake-video"));
    expect(result.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});

describe("extractAudioWav (ffmpeg integration)", () => {
  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";

  it.runIf(process.env.FFMPEG_INTEGRATION === "1")(
    "extracts 16kHz mono WAV from a generated video",
    async () => {
      delete process.env.REMIX_STT_MODE;

      const dir = await mkdtemp(join(tmpdir(), "remix-audio-test-"));
      const inputPath = join(dir, "input.mp4");

      try {
        await runFfmpeg(ffmpeg, [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=1",
          "-c:a",
          "aac",
          inputPath,
        ]);

        const videoBuffer = await readFile(inputPath);
        const audio = await extractAudioForStt(videoBuffer);

        expect(audio.contentType).toBe("audio/mpeg");
        expect(audio.fileName).toBe("audio.mp3");
        expect(audio.buffer.length).toBeGreaterThan(0);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
});
