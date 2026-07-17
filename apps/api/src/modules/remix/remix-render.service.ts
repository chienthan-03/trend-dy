import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { RemixBannerJson } from "@factory/shared";
import { probeVideoDimensions, runFfmpeg } from "./remix-audio.util";
import { getLetterboxRatio, getRenderFontPath } from "./remix-config";

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const isFakeRenderMode = (): boolean => process.env.REMIX_RENDER_MODE === "fake";

/** Fallback source height (portrait) used only when ffprobe cannot read dimensions. */
const DEFAULT_SOURCE_HEIGHT = 1920;

/**
 * Minimal-but-structurally-valid MP4 (a bare `ftyp` box) used as the render
 * output under REMIX_RENDER_MODE=fake so tests/CI can exercise the render
 * pipeline without a real ffmpeg build or real video/audio fixtures.
 */
const MINIMAL_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00,
  0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
]);

/** Same fixture with a trailing marker so fake audio_only vs banner_audio outputs are distinguishable in tests. */
const MINIMAL_MP4_BANNER = Buffer.concat([
  MINIMAL_MP4,
  Buffer.from([0x62, 0x61, 0x6e, 0x6e]),
]);

const escapeDrawtextValue = (text: string): string =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    // A literal single quote cannot be embedded inside ffmpeg's single-quoted
    // drawtext value without complex quote-breaking; substitute a lookalike
    // Unicode apostrophe instead.
    .replace(/'/g, "\u2019");

const buildDrawtextFilter = (input: {
  text: string;
  fontPath?: string;
  fontSize: number;
  y: string;
}): string => {
  const parts = [
    input.fontPath
      ? `fontfile='${escapeDrawtextValue(input.fontPath)}'`
      : undefined,
    `text='${escapeDrawtextValue(input.text)}'`,
    "fontcolor=white",
    `fontsize=${input.fontSize}`,
    "x=(w-text_w)/2",
    `y=${input.y}`,
  ].filter((part): part is string => Boolean(part));

  return `drawtext=${parts.join(":")}`;
};

@Injectable()
export class RemixRenderService {
  /** Replace the source video's audio track with the dub track, video untouched. */
  async renderAudioOnly(
    videoBuffer: Buffer,
    dubAudioBuffer: Buffer,
  ): Promise<Buffer> {
    if (isFakeRenderMode()) {
      return MINIMAL_MP4;
    }

    return this.renderAudioOnlyWithFfmpeg(videoBuffer, dubAudioBuffer);
  }

  /** Pad video with top/bottom letterbox bars, draw header/bottom text, and swap in the dub track. */
  async renderBannerAudio(
    videoBuffer: Buffer,
    dubAudioBuffer: Buffer,
    banners: RemixBannerJson,
  ): Promise<Buffer> {
    if (isFakeRenderMode()) {
      return MINIMAL_MP4_BANNER;
    }

    return this.renderBannerAudioWithFfmpeg(videoBuffer, dubAudioBuffer, banners);
  }

  private async renderAudioOnlyWithFfmpeg(
    videoBuffer: Buffer,
    dubAudioBuffer: Buffer,
  ): Promise<Buffer> {
    const ffmpeg = getFfmpegPath();
    const dir = await mkdtemp(join(tmpdir(), "remix-render-"));
    const videoPath = join(dir, "input.mp4");
    const audioPath = join(dir, "dub.mp3");
    const outputPath = join(dir, "output.mp4");

    try {
      await writeFile(videoPath, videoBuffer);
      await writeFile(audioPath, dubAudioBuffer);
      await runFfmpeg(ffmpeg, [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        "-f",
        "mp4",
        outputPath,
      ]);
      return await readFile(outputPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private async renderBannerAudioWithFfmpeg(
    videoBuffer: Buffer,
    dubAudioBuffer: Buffer,
    banners: RemixBannerJson,
  ): Promise<Buffer> {
    const ffmpeg = getFfmpegPath();
    const dir = await mkdtemp(join(tmpdir(), "remix-render-banner-"));
    const videoPath = join(dir, "input.mp4");
    const audioPath = join(dir, "dub.mp3");
    const outputPath = join(dir, "output.mp4");

    try {
      await writeFile(videoPath, videoBuffer);
      await writeFile(audioPath, dubAudioBuffer);

      const dimensions = await probeVideoDimensions(videoBuffer);
      const sourceHeight = dimensions?.height ?? DEFAULT_SOURCE_HEIGHT;
      const ratio = getLetterboxRatio();
      const barHeight = Math.max(1, Math.round(sourceHeight * ratio));
      const paddedHeight = sourceHeight + barHeight * 2;
      const fontSize = Math.max(12, Math.round(barHeight * 0.5));
      const fontPath = getRenderFontPath();

      const filters = [`pad=iw:${paddedHeight}:0:${barHeight}:black`];

      const header = banners.header.trim();
      if (header) {
        filters.push(
          buildDrawtextFilter({
            text: header,
            fontPath,
            fontSize,
            y: `(${barHeight}-text_h)/2`,
          }),
        );
      }

      const bottom = banners.bottom.trim();
      if (bottom) {
        filters.push(
          buildDrawtextFilter({
            text: bottom,
            fontPath,
            fontSize,
            y: `${sourceHeight + barHeight}+(${barHeight}-text_h)/2`,
          }),
        );
      }

      await runFfmpeg(ffmpeg, [
        "-y",
        "-i",
        videoPath,
        "-i",
        audioPath,
        "-filter:v",
        filters.join(","),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-shortest",
        "-f",
        "mp4",
        outputPath,
      ]);
      return await readFile(outputPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
