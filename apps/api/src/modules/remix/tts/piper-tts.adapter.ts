import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { probeAudioDurationSec, runFfmpeg } from "../remix-audio.util";
import {
  getPiperBin,
  getPiperModelDir,
  getPiperModelStem,
  getSttAudioBitrateKbps,
} from "../remix-config";
import { normalizeVietnameseForTts } from "./viet-normalize";
import type { TtsAdapter, TtsSynthesizeInput, TtsSynthesizeResult } from "./tts.adapter";

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

export type PiperAssets = {
  bin: string;
  onnxPath: string;
  configPath: string;
};

const hasPathSeparator = (value: string): boolean => value.includes("/") || value.includes("\\");

/** Resolves configured Piper CLI + Ngọc Huyền voice paths (model dir may be relative). */
export const resolvePiperAssets = (): PiperAssets => {
  const bin = getPiperBin();
  const modelDir = resolve(getPiperModelDir());
  const stem = getPiperModelStem();
  return {
    bin,
    onnxPath: join(modelDir, `${stem}.onnx`),
    configPath: join(modelDir, `${stem}.onnx.json`),
  };
};

export const assertPiperAssets = (assets: PiperAssets): void => {
  // Bare command names (e.g. "piper") resolve via PATH at spawn time.
  if (hasPathSeparator(assets.bin) && !existsSync(assets.bin)) {
    throw new Error(
      `Piper binary not found at "${assets.bin}". Set REMIX_PIPER_BIN to the piper executable path.`,
    );
  }
  if (!existsSync(assets.onnxPath) || !existsSync(assets.configPath)) {
    throw new Error(
      `Piper voice assets missing (expected "${assets.onnxPath}" and "${assets.configPath}"). ` +
        "Copy ngoc-huyen.onnx + ngoc-huyen.onnx.json into apps/api/models/tts/ngoc-huyen " +
        "(ASCII filenames — Piper on Windows crashes on Unicode paths), " +
        "or set REMIX_PIPER_MODEL_DIR / REMIX_PIPER_MODEL_STEM.",
    );
  }
};

/** Falls back to the raw text if the normalizer throws on unexpected input. */
const safeNormalize = (text: string): string => {
  try {
    return normalizeVietnameseForTts(text);
  } catch {
    return text;
  }
};

/**
 * Test stub CLIs are plain `.js` files, which Windows can't exec directly —
 * run those through the current Node binary instead of spawning them as-is.
 */
const resolveSpawnCommand = (bin: string): { command: string; prefixArgs: string[] } =>
  bin.endsWith(".js") ? { command: process.execPath, prefixArgs: [bin] } : { command: bin, prefixArgs: [] };

const runPiperCli = (assets: PiperAssets, text: string, outputWavPath: string): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    const { command, prefixArgs } = resolveSpawnCommand(assets.bin);
    // argv array only — never shell-join (spaces in paths). Prefer ASCII model filenames on Windows.
    const args = [
      ...prefixArgs,
      "--model",
      assets.onnxPath,
      "--config",
      assets.configPath,
      "--output_file",
      outputWavPath,
    ];

    // cwd = piper.exe dir so sibling DLLs (onnxruntime, espeak-ng) resolve on Windows.
    const spawnOpts: { stdio: ["pipe", "pipe", "pipe"]; cwd?: string } = {
      stdio: ["pipe", "pipe", "pipe"],
    };
    if (hasPathSeparator(assets.bin)) {
      spawnOpts.cwd = dirname(resolve(assets.bin));
    }

    const proc = spawn(command, args, spawnOpts);
    let stderr = "";

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Piper binary not found ("${command}"). Install Piper CLI and set REMIX_PIPER_BIN to the full path of piper.exe (Windows) or piper.`,
          ),
        );
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`piper exited with code ${code}: ${stderr.trim() || "no stderr output"}`));
    });

    proc.stdin?.end(text, "utf8");
  });

const wavToMp3 = async (wavPath: string, mp3Path: string): Promise<Buffer> => {
  const ffmpeg = getFfmpegPath();
  const bitrateKbps = getSttAudioBitrateKbps();
  await runFfmpeg(ffmpeg, [
    "-y",
    "-i",
    wavPath,
    "-codec:a",
    "libmp3lame",
    "-b:a",
    `${bitrateKbps}k`,
    "-f",
    "mp3",
    mp3Path,
  ]);
  return readFile(mp3Path);
};

export class PiperTtsAdapter implements TtsAdapter {
  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const assets = resolvePiperAssets();
    assertPiperAssets(assets);
    const text = safeNormalize(input.text);

    const dir = await mkdtemp(join(tmpdir(), "remix-piper-tts-"));
    const wavPath = join(dir, "output.wav");
    const mp3Path = join(dir, "output.mp3");

    try {
      await runPiperCli(assets, text, wavPath);
      const buffer = await wavToMp3(wavPath, mp3Path);
      const durationSec = (await probeAudioDurationSec(buffer, "mp3")) ?? 0.1;

      return {
        buffer,
        contentType: "audio/mpeg",
        durationSec,
        costUsd: 0,
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
