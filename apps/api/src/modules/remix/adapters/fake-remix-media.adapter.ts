import { createHash } from "node:crypto";
import type { DownloadedMedia, RemixMediaAdapter } from "../remix-media.adapter";

const MIN_BUFFER_BYTES = 1024;

const buildDeterministicBuffer = (videoId: string): Buffer => {
  const hash = createHash("sha256").update(videoId).digest();
  const buffer = Buffer.alloc(MIN_BUFFER_BYTES);
  for (let i = 0; i < MIN_BUFFER_BYTES; i++) {
    buffer[i] = hash[i % hash.length]!;
  }
  return buffer;
};

export class FakeRemixMediaAdapter implements RemixMediaAdapter {
  async downloadFromPlayUrl(_playUrl: string, videoId: string): Promise<DownloadedMedia> {
    const buffer = buildDeterministicBuffer(videoId);
    return {
      buffer,
      contentType: "video/mp4",
      sizeBytes: buffer.length,
    };
  }
}
