import type { DouyinVideoAdapter, DouyinVideoDetail } from "../../douyin-video.adapter";
import { fetchYtdlpVideoDetail } from "./ytdlp-video.provider";

const canonicalVideoUrl = (videoId: string): string =>
  `https://www.douyin.com/video/${videoId}`;

export class YtdlpDouyinVideoAdapter implements DouyinVideoAdapter {
  async resolveShareUrl(
    shareUrl: string,
  ): Promise<{ videoId: string; canonicalUrl?: string }> {
    const detail = await fetchYtdlpVideoDetail(shareUrl.trim());
    return {
      videoId: detail.videoId,
      canonicalUrl: detail.canonicalUrl,
    };
  }

  async getVideoDetail(videoId: string): Promise<DouyinVideoDetail> {
    return fetchYtdlpVideoDetail(canonicalVideoUrl(videoId));
  }
};
