import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDouyinVideoAdapter } from "./douyin-video.adapter";
import { FakeDouyinVideoAdapter } from "./adapters/fake-douyin-video.adapter";
import { YtdlpDouyinVideoAdapter } from "./adapters/live/ytdlp-douyin-video.adapter";

describe("FakeDouyinVideoAdapter", () => {
  let previousAdapter: string | undefined;

  beforeEach(() => {
    previousAdapter = process.env.DOUYIN_ADAPTER;
    process.env.DOUYIN_ADAPTER = "fake";
  });

  afterEach(() => {
    if (previousAdapter === undefined) {
      delete process.env.DOUYIN_ADAPTER;
    } else {
      process.env.DOUYIN_ADAPTER = previousAdapter;
    }
  });

  it("resolveShareUrl extracts videoId from v.douyin.com link", async () => {
    const adapter = await createDouyinVideoAdapter();
    const shareUrl = "https://v.douyin.com/abc123/";

    const result = await adapter.resolveShareUrl(shareUrl);

    expect(result.videoId).toBeTruthy();
    expect(result.videoId).toMatch(/^fake-/);
  });

  it("resolveShareUrl returns stable videoId for the same share URL", async () => {
    const adapter = new FakeDouyinVideoAdapter();
    const shareUrl = "https://v.douyin.com/stable-link/";

    const first = await adapter.resolveShareUrl(shareUrl);
    const second = await adapter.resolveShareUrl(shareUrl);

    expect(first.videoId).toBe(second.videoId);
  });

  it("getVideoDetail returns caption for known fake id", async () => {
    const adapter = await createDouyinVideoAdapter();
    const detail = await adapter.getVideoDetail("fake-video-001");

    expect(detail.caption.length).toBeGreaterThan(10);
    expect(detail.title).toBeTruthy();
    expect(detail.videoId).toBe("fake-video-001");
    expect(detail.authorHandle).toMatch(/^@/);
    expect(detail.stats).toMatchObject({
      likes: expect.any(Number),
      comments: expect.any(Number),
      shares: expect.any(Number),
    });
  });

  it("getVideoDetail returns deterministic detail for hashed video ids", async () => {
    const adapter = new FakeDouyinVideoAdapter();
    const { videoId } = await adapter.resolveShareUrl("https://v.douyin.com/xyz789/");

    const first = await adapter.getVideoDetail(videoId);
    const second = await adapter.getVideoDetail(videoId);

    expect(first).toEqual(second);
    expect(first.caption.length).toBeGreaterThan(10);
  });
});

describe("createDouyinVideoAdapter", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("defaults to the fake adapter", async () => {
    process.env = { ...env };
    delete process.env.DOUYIN_ADAPTER;

    const adapter = await createDouyinVideoAdapter();
    expect(adapter).toBeInstanceOf(FakeDouyinVideoAdapter);
  });

  it("uses yt-dlp when live video provider is ytdlp", async () => {
    process.env = { ...env, DOUYIN_ADAPTER: "live", DOUYIN_VIDEO_PROVIDER: "ytdlp" };

    const adapter = await createDouyinVideoAdapter();
    expect(adapter).toBeInstanceOf(YtdlpDouyinVideoAdapter);
  });
});
