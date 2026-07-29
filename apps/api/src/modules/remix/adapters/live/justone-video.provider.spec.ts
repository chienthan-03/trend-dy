import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractDouyinShareUrl,
  extractDouyinVideoIdFromUrl,
  parseJustOneShareUrlTransferData,
  resolveJustOneShareUrl,
} from "./justone-video.provider";

describe("extractDouyinVideoIdFromUrl", () => {
  it("extracts id from canonical douyin video URL", () => {
    expect(
      extractDouyinVideoIdFromUrl("https://www.douyin.com/video/7123456789012345678"),
    ).toBe("7123456789012345678");
  });

  it("extracts id from iesdouyin share URL", () => {
    expect(
      extractDouyinVideoIdFromUrl(
        "https://www.iesdouyin.com/share/video/7659990543732116762/",
      ),
    ).toBe("7659990543732116762");
  });

  it("extracts id from modal_id query param", () => {
    expect(
      extractDouyinVideoIdFromUrl(
        "https://www.douyin.com/discover?modal_id=7123456789012345678",
      ),
    ).toBe("7123456789012345678");
  });
});

describe("extractDouyinShareUrl", () => {
  it("extracts short link from pasted share text", () => {
    expect(
      extractDouyinShareUrl(
        "7.66 复制打开抖音 https://v.douyin.com/iJxYzAb/ 看看这个视频",
      ),
    ).toBe("https://v.douyin.com/iJxYzAb/");
  });
});

describe("parseJustOneShareUrlTransferData", () => {
  it("parses redirect URL string returned by Just One API", () => {
    expect(
      parseJustOneShareUrlTransferData(
        "https://www.douyin.com/video/7123456789012345678?previous_page=app_code_link",
      ),
    ).toEqual({
      videoId: "7123456789012345678",
      canonicalUrl:
        "https://www.douyin.com/video/7123456789012345678?previous_page=app_code_link",
    });
  });

  it("parses legacy object payloads", () => {
    expect(
      parseJustOneShareUrlTransferData({
        aweme_id: "7123456789012345678",
        url: "https://www.douyin.com/video/7123456789012345678",
      }),
    ).toEqual({
      videoId: "7123456789012345678",
      canonicalUrl: "https://www.douyin.com/video/7123456789012345678",
    });
  });
});

describe("resolveJustOneShareUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DOUYIN_API_TOKEN;
    delete process.env.DOUYIN_API_BASE_URL;
  });

  it("resolves full douyin video URLs without calling Just One API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveJustOneShareUrl(
      "https://www.douyin.com/video/7123456789012345678",
    );

    expect(result).toEqual({
      videoId: "7123456789012345678",
      canonicalUrl: "https://www.douyin.com/video/7123456789012345678",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls share-url-transfer for short links and parses string data", async () => {
    process.env.DOUYIN_API_TOKEN = "test-token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: "ok",
        data: "https://www.douyin.com/video/7123456789012345678",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const pasted =
      "复制打开抖音 https://v.douyin.com/iJxYzAb/ 看看这个视频";
    const result = await resolveJustOneShareUrl(pasted);

    expect(result).toEqual({
      videoId: "7123456789012345678",
      canonicalUrl: "https://www.douyin.com/video/7123456789012345678",
    });

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("/api/douyin/share-url-transfer/v1");
    expect(calledUrl).toContain("shareUrl=");
    expect(calledUrl).toContain("v.douyin.com%2FiJxYzAb");
  });
});
