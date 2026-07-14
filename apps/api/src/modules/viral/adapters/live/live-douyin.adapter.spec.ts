import { describe, expect, it, vi, afterEach } from "vitest";
import { LiveDouyinAdapter } from "./live-douyin.adapter";

describe("LiveDouyinAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DOUYIN_API_TOKEN;
    delete process.env.DOUYIN_API_BASE_URL;
  });

  it("maps Just One API items for a genre board", async () => {
    process.env.DOUYIN_API_TOKEN = "test-token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        message: "ok",
        data: {
          list: [
            {
              aweme_id: "7123456789012345678",
              desc: "系统流爽文解说 #系统流",
              author: { unique_id: "studio_creator" },
              statistics: {
                digg_count: 12000,
                comment_count: 340,
                share_count: 90,
              },
              share_url: "https://www.douyin.com/video/7123456789012345678",
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LiveDouyinAdapter();
    const items = await adapter.fetchBoard("douyin:hot:system", {
      genre: "system",
      limit: 5,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "7123456789012345678",
      rankPosition: 1,
      authorHandle: "@studio_creator",
      stats: { likes: 12000, comments: 340, shares: 90 },
      canonicalUrl: "https://www.douyin.com/video/7123456789012345678",
    });
    expect(items[0]?.externalId).not.toMatch(/^fake-/);

    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("keyword=");
    expect(calledUrl).toContain("token=test-token");
  });

  it("maps Just One API content_list payloads", async () => {
    process.env.DOUYIN_API_TOKEN = "test-token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          content_list: [
            {
              id: "7650106493467364837",
              attribute_datas: {
                item_title: "小说推文 #书荒推文",
                like_cnt_all: "130047",
                comment_cnt_all: "18720",
                share_cnt_all: "18022",
                item_create_time: "1781179218",
              },
              user_info: { name: "郭大美" },
            },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LiveDouyinAdapter();
    const items = await adapter.fetchBoard("douyin:hot:web_novel", {
      genre: "web_novel",
      limit: 5,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      externalId: "7650106493467364837",
      title: "小说推文 #书荒推文",
      authorHandle: "@郭大美",
      stats: { likes: 130047, comments: 18720, shares: 18022 },
    });
    expect(items[0]?.externalId).not.toMatch(/^fake-/);
  });

  it("throws when API token is missing", async () => {
    const adapter = new LiveDouyinAdapter();
    await expect(adapter.fetchBoard("douyin:hot:system", { genre: "system" })).rejects.toThrow(
      /DOUYIN_API_TOKEN/,
    );
  });
});
