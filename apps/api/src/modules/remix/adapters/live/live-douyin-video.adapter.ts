import type { DouyinVideoAdapter, DouyinVideoDetail } from "../../douyin-video.adapter";
import { fetchJustOneVideoDetail, resolveJustOneShareUrl } from "./justone-video.provider";

export class LiveDouyinVideoAdapter implements DouyinVideoAdapter {
  async resolveShareUrl(
    shareUrl: string,
  ): Promise<{ videoId: string; canonicalUrl?: string }> {
    return resolveJustOneShareUrl(shareUrl);
  }

  async getVideoDetail(videoId: string): Promise<DouyinVideoDetail> {
    return fetchJustOneVideoDetail(videoId);
  }
}
