import { isMediaDownloadAllowed } from "./remix-config";

export type DownloadedMedia = {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
};

export interface RemixMediaAdapter {
  downloadFromPlayUrl(playUrl: string, videoId: string): Promise<DownloadedMedia>;
}

export const createRemixMediaAdapter = async (): Promise<RemixMediaAdapter> => {
  if (!isMediaDownloadAllowed()) {
    throw new Error("Media download is disabled");
  }
  const mode = process.env.REMIX_MEDIA_ADAPTER?.trim() ?? "http";
  if (mode === "fake") {
    const { FakeRemixMediaAdapter } = await import("./adapters/fake-remix-media.adapter");
    return new FakeRemixMediaAdapter();
  }
  const { HttpRemixMediaAdapter } = await import("./adapters/http-remix-media.adapter");
  return new HttpRemixMediaAdapter();
};
