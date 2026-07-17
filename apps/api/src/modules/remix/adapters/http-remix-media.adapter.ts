import { getMaxMediaMb, getMediaDownloadTimeoutMs } from "../remix-config";
import type { DownloadedMedia, RemixMediaAdapter } from "../remix-media.adapter";

const getMaxBytes = (): number => getMaxMediaMb() * 1024 * 1024;

const assertWithinSizeLimit = (sizeBytes: number, maxBytes: number): void => {
  if (sizeBytes > maxBytes) {
    throw new Error(
      `Media exceeds maximum size of ${getMaxMediaMb()} MB (${sizeBytes} bytes)`,
    );
  }
};

export class HttpRemixMediaAdapter implements RemixMediaAdapter {
  async downloadFromPlayUrl(playUrl: string, _videoId: string): Promise<DownloadedMedia> {
    const maxBytes = getMaxBytes();

    let response: Response;
    try {
      response = await fetch(playUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(getMediaDownloadTimeoutMs()),
        headers: {
          // Douyin CDN often returns 403 without browser-like Referer.
          Referer: "https://www.douyin.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to download media from ${playUrl}: ${message}`);
    }

    if (!response.ok) {
      throw new Error(
        `Failed to download media from ${playUrl}: HTTP ${response.status} ${response.statusText}`,
      );
    }

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength)) {
        assertWithinSizeLimit(contentLength, maxBytes);
      }
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read media body from ${playUrl}: ${message}`);
    }

    const buffer = Buffer.from(arrayBuffer);
    assertWithinSizeLimit(buffer.length, maxBytes);

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "video/mp4";

    return {
      buffer,
      contentType,
      sizeBytes: buffer.length,
    };
  }
}
