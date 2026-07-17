import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { runFfmpeg } from "./remix-audio.util";

const getFfmpegPath = (): string => process.env.FFMPEG_PATH ?? "ffmpeg";

const isFakeRenderMode = (): boolean => process.env.REMIX_RENDER_MODE === "fake";

/**
 * Minimal-but-structurally-valid MP4 (a bare `ftyp` box) used as the render
 * output under REMIX_RENDER_MODE=fake so tests/CI can exercise the render
 * pipeline without a real ffmpeg build or real video/audio fixtures.
 */
const MINIMAL_MP4 = Buffer.from([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00,
  0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
]);

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
}
