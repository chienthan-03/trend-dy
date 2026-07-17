import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSttAudioBitrateKbps,
  getTtsApiBaseUrl,
  getTtsApiKey,
  getTtsCostPer1kCharsUsd,
  getTtsModel,
  resolveTtsVoiceId,
} from "../remix-config";
import type { TtsAdapter, TtsSynthesizeInput, TtsSynthesizeResult } from "./tts.adapter";
import { runFfmpeg } from "../remix-audio.util";

const getFfprobePath = (): string => process.env.FFPROBE_PATH ?? "ffprobe";

const estimateMp3DurationSec = (buffer: Buffer): number => {
  const bitrateKbps = getSttAudioBitrateKbps();
  return Math.max(0.1, (buffer.length * 8) / (bitrateKbps * 1000));
};

const probeMp3DurationSec = async (buffer: Buffer): Promise<number | null> => {
  const ffprobe = getFfprobePath();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-probe-"));
  const inputPath = join(dir, "input.mp3");

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

const measureDurationSec = async (buffer: Buffer): Promise<number> => {
  const probed = await probeMp3DurationSec(buffer);
  return probed ?? estimateMp3DurationSec(buffer);
};

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const pcmToMp3 = async (
  pcmBuffer: Buffer,
  sampleRateHz: number,
): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  const dir = await mkdtemp(join(tmpdir(), "remix-tts-pcm-"));
  const pcmPath = join(dir, "input.pcm");
  const outputPath = join(dir, "output.mp3");

  try {
    await writeFile(pcmPath, pcmBuffer);
    await runFfmpeg(ffmpeg, [
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(sampleRateHz),
      "-ac",
      "1",
      "-i",
      pcmPath,
      "-ac",
      "1",
      "-ar",
      "24000",
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

const parsePcmSampleRate = (contentType: string | null): number => {
  const match = contentType?.match(/rate=(\d+)/i);
  const rate = match ? Number(match[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : 24_000;
};

const estimateTtsCostUsd = (text: string): number =>
  (text.length / 1000) * getTtsCostPer1kCharsUsd();

export class HttpTtsAdapter implements TtsAdapter {
  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const apiKey = getTtsApiKey();
    if (!apiKey) {
      throw new Error(
        "REMIX_TTS_API_KEY, AI_GATEWAY_API_KEY, or OPENAI_API_KEY is required when REMIX_TTS_MODE is live",
      );
    }

    const baseUrl = getTtsApiBaseUrl();
    const model = getTtsModel();
    const voice = resolveTtsVoiceId(input.voiceId);
    // Gemini TTS on OpenRouter only accepts pcm; convert to mp3 for the dub pipeline.
    const wantsPcm = /gemini/i.test(model);
    const responseFormat = wantsPcm ? "pcm" : "mp3";

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // OpenRouter rankings / app attribution (harmless for OpenAI direct).
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
          "X-Title": "AI Content Factory Remix",
        },
        body: JSON.stringify({
          model,
          voice,
          input: input.text,
          response_format: responseFormat,
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`TTS request failed: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TTS request failed (${response.status}): ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type");
    if (wantsPcm || contentType?.includes("audio/pcm")) {
      buffer = await pcmToMp3(buffer, parsePcmSampleRate(contentType));
    }

    const durationSec = await measureDurationSec(buffer);

    return {
      buffer,
      contentType: "audio/mpeg",
      durationSec,
      costUsd: estimateTtsCostUsd(input.text),
    };
  }
}
