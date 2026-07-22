import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type CachedTtsClip = {
  buffer: Buffer;
  durationSec: number;
};

const isCacheEnabled = (): boolean => {
  const raw = process.env.REMIX_TTS_CACHE?.trim().toLowerCase();
  if (raw === "0" || raw === "off" || raw === "false") return false;
  return true;
};

export const getTtsCacheDir = (): string =>
  process.env.REMIX_TTS_CACHE_DIR?.trim() ||
  join(tmpdir(), "remix-tts-batch-cache");

export const ttsBatchCacheKey = (input: {
  model: string;
  voiceId: string;
  text: string;
}): string =>
  createHash("sha256")
    .update([input.model, input.voiceId, input.text].join("\0"), "utf8")
    .digest("hex");

const pathsForKey = (key: string) => {
  const dir = getTtsCacheDir();
  return {
    dir,
    mp3Path: join(dir, `${key}.mp3`),
    metaPath: join(dir, `${key}.json`),
  };
};

/**
 * Disk cache for batch TTS clips. Survive assemble failures / worker restarts
 * so the same (model, voice, text) does not re-bill OpenRouter.
 */
export const readTtsBatchCache = async (
  key: string,
): Promise<CachedTtsClip | null> => {
  if (!isCacheEnabled()) return null;

  const { mp3Path, metaPath } = pathsForKey(key);
  try {
    await access(mp3Path);
    await access(metaPath);
    const [buffer, metaRaw] = await Promise.all([
      readFile(mp3Path),
      readFile(metaPath, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as { durationSec?: number };
    const durationSec = Number(meta.durationSec);
    if (!Number.isFinite(durationSec) || durationSec <= 0 || buffer.length === 0) {
      return null;
    }
    return { buffer, durationSec };
  } catch {
    return null;
  }
};

export const writeTtsBatchCache = async (
  key: string,
  clip: CachedTtsClip,
): Promise<void> => {
  if (!isCacheEnabled()) return;
  if (clip.buffer.length === 0 || !(clip.durationSec > 0)) return;

  const { dir, mp3Path, metaPath } = pathsForKey(key);
  await mkdir(dir, { recursive: true });
  await Promise.all([
    writeFile(mp3Path, clip.buffer),
    writeFile(
      metaPath,
      JSON.stringify({ durationSec: clip.durationSec }),
      "utf8",
    ),
  ]);
};
