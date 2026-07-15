import { createHash } from "node:crypto";
import type { DouyinVideoAdapter, DouyinVideoDetail } from "../douyin-video.adapter";

const KNOWN_FIXTURES: Record<string, Omit<DouyinVideoDetail, "videoId">> = {
  "fake-video-001": {
    title: "【假数据】都市逆袭爽文解说",
    caption: "这是一段用于本地开发的抖音视频假数据，讲述主角从底层逆袭的热血故事。#爽文 #解说 #假数据",
    authorHandle: "@fake_creator_001",
    stats: { likes: 128_000, comments: 3_420, shares: 890 },
    coverUrl: "https://example.test/fake/fake-video-001/cover.jpg",
    canonicalUrl: "https://example.test/fake/fake-video-001",
    playUrl: "https://example.test/fake/fake-video-001/play.mp4",
    publishedAt: new Date(Date.UTC(2026, 0, 15, 8, 30, 0)),
    rawPayload: { source: "fake-douyin-video-adapter", fixture: "fake-video-001" },
  },
};

const hashSeed = (input: string): string =>
  createHash("sha256").update(input).digest("hex").slice(0, 12);

const videoIdFromShareUrl = (shareUrl: string): string => `fake-${hashSeed(shareUrl.trim())}`;

const buildFixtureDetail = (videoId: string): DouyinVideoDetail => {
  const known = KNOWN_FIXTURES[videoId];
  if (known) {
    return { videoId, ...known };
  }

  const seed = videoId.replace(/^fake-/, "") || hashSeed(videoId);
  const publishedAt = new Date(Date.UTC(2026, 1, 1, 12, 0, 0));

  return {
    videoId,
    title: `【假数据】热门短视频 #${seed.slice(0, 6)}`,
    caption: `本地假数据视频解说，编号 ${seed}。讲述一段精彩的短视频故事，适合 remix 流程测试。#假数据 #短视频 #解说`,
    authorHandle: `@fake_user_${seed.slice(0, 8)}`,
    stats: {
      likes: 10_000 + parseInt(seed.slice(0, 4), 16),
      comments: 200 + parseInt(seed.slice(4, 8), 16) % 500,
      shares: 50 + parseInt(seed.slice(8, 12), 16) % 200,
    },
    coverUrl: `https://example.test/fake/${seed}/cover.jpg`,
    canonicalUrl: `https://example.test/fake/${seed}`,
    playUrl: `https://example.test/fake/${videoId}/play.mp4`,
    publishedAt,
    rawPayload: { source: "fake-douyin-video-adapter", videoId, seed },
  };
};

export class FakeDouyinVideoAdapter implements DouyinVideoAdapter {
  async resolveShareUrl(
    shareUrl: string,
  ): Promise<{ videoId: string; canonicalUrl?: string }> {
    const videoId = videoIdFromShareUrl(shareUrl);
    const detail = buildFixtureDetail(videoId);

    return {
      videoId,
      canonicalUrl: detail.canonicalUrl,
    };
  }

  async getVideoDetail(videoId: string): Promise<DouyinVideoDetail> {
    return buildFixtureDetail(videoId);
  }
}
