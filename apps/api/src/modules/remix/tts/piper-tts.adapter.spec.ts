import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeVietnameseForTts } from "./viet-normalize";

const PIPER_STUB_SCRIPT = `
const fs = require("fs");

const args = process.argv.slice(2);
const getFlag = (name) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
};

const outputPath = getFlag("--output_file");

const buildMinimalWav = (durationSec) => {
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

let stdinText = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinText += chunk;
});
process.stdin.on("end", () => {
  if (process.env.PIPER_STUB_TEXT_FILE) {
    fs.writeFileSync(process.env.PIPER_STUB_TEXT_FILE, stdinText, "utf8");
  }
  const exitCode = Number(process.env.PIPER_STUB_EXIT_CODE || "0");
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }
  if (!outputPath) {
    process.exitCode = 1;
    return;
  }
  fs.writeFileSync(outputPath, buildMinimalWav(0.5));
});
`;

describe("PiperTtsAdapter", () => {
  const env = process.env;
  let dir: string;
  let stubPath: string;
  let modelDir: string;
  const stem = "ngoc-huyen";

  beforeEach(async () => {
    process.env = { ...env };
    dir = await mkdtemp(join(tmpdir(), "remix-piper-test-"));
    stubPath = join(dir, "piper-stub.js");
    await writeFile(stubPath, PIPER_STUB_SCRIPT, "utf8");
    modelDir = join(dir, "models");
    await mkdir(modelDir, { recursive: true });
  });

  afterEach(async () => {
    process.env = env;
    await rm(dir, { recursive: true, force: true });
  });

  const writeModelAssets = async (targetDir: string, targetStem: string) => {
    await mkdir(targetDir, { recursive: true });
    await writeFile(join(targetDir, `${targetStem}.onnx`), "fake-onnx-weights");
    await writeFile(join(targetDir, `${targetStem}.onnx.json`), "{}");
  };

  it("throws mentioning REMIX_PIPER when the binary is missing", async () => {
    await writeModelAssets(modelDir, stem);
    process.env.REMIX_PIPER_BIN = join(dir, "does-not-exist-piper");
    process.env.REMIX_PIPER_MODEL_DIR = modelDir;
    process.env.REMIX_PIPER_MODEL_STEM = stem;

    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    const adapter = new PiperTtsAdapter();

    await expect(adapter.synthesize({ text: "Xin chào", voiceId: "ngoc-huyen" })).rejects.toThrow(
      /REMIX_PIPER/,
    );
  });

  it("throws mentioning models/tts when voice assets are missing", async () => {
    process.env.REMIX_PIPER_BIN = stubPath;
    process.env.REMIX_PIPER_MODEL_DIR = modelDir; // empty — no .onnx / .onnx.json
    process.env.REMIX_PIPER_MODEL_STEM = stem;

    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    const adapter = new PiperTtsAdapter();

    await expect(adapter.synthesize({ text: "Xin chào", voiceId: "ngoc-huyen" })).rejects.toThrow(
      /models\/tts/,
    );
  });

  it("synthesizes via the stub CLI and returns a $0 mp3 result", async () => {
    await writeModelAssets(modelDir, stem);
    process.env.REMIX_PIPER_BIN = stubPath;
    process.env.REMIX_PIPER_MODEL_DIR = modelDir;
    process.env.REMIX_PIPER_MODEL_STEM = stem;

    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    const adapter = new PiperTtsAdapter();

    const result = await adapter.synthesize({ text: "Xin chào các bạn", voiceId: "ngoc-huyen" });

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.durationSec).toBeGreaterThan(0);
    expect(result.costUsd).toBe(0);
  });

  it("normalizes Vietnamese text before sending it to the Piper CLI", async () => {
    await writeModelAssets(modelDir, stem);
    process.env.REMIX_PIPER_BIN = stubPath;
    process.env.REMIX_PIPER_MODEL_DIR = modelDir;
    process.env.REMIX_PIPER_MODEL_STEM = stem;
    const sidecarPath = join(dir, "received-text.txt");
    process.env.PIPER_STUB_TEXT_FILE = sidecarPath;

    const { PiperTtsAdapter } = await import("./piper-tts.adapter");
    const adapter = new PiperTtsAdapter();

    const inputText = "Giảm 50% hôm nay";
    await adapter.synthesize({ text: inputText, voiceId: "ngoc-huyen" });

    const received = await readFile(sidecarPath, "utf8");
    expect(received).toBe(normalizeVietnameseForTts(inputText));
    expect(received).toMatch(/phần trăm/);
  });

  it("resolves a relative REMIX_PIPER_MODEL_DIR against the current working directory", async () => {
    const { resolvePiperAssets } = await import("./piper-tts.adapter");
    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      process.env.REMIX_PIPER_MODEL_DIR = "models";
      process.env.REMIX_PIPER_MODEL_STEM = stem;
      const assets = resolvePiperAssets();
      expect(assets.onnxPath).toBe(resolve(dir, "models", `${stem}.onnx`));
      expect(assets.configPath).toBe(resolve(dir, "models", `${stem}.onnx.json`));
    } finally {
      process.chdir(originalCwd);
    }
  });
});
