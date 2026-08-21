import { afterEach, describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import {
  buildYtdlpCookieArgs,
  downloadYtdlpVideo,
  fetchYtdlpVideoDetail,
  formatYtdlpAuthHint,
  isYtdlpVideoProvider,
  mapYtdlpJsonToDetail,
} from "./ytdlp-video.provider";

describe("isYtdlpVideoProvider", () => {
  afterEach(() => {
    delete process.env.DOUYIN_ADAPTER;
    delete process.env.DOUYIN_VIDEO_PROVIDER;
  });

  it("is false when the Douyin adapter is fake", () => {
    process.env.DOUYIN_ADAPTER = "fake";
    process.env.DOUYIN_VIDEO_PROVIDER = "ytdlp";
    expect(isYtdlpVideoProvider()).toBe(false);
  });

  it("is true when live adapter uses the ytdlp video provider", () => {
    process.env.DOUYIN_ADAPTER = "live";
    process.env.DOUYIN_VIDEO_PROVIDER = "ytdlp";
    expect(isYtdlpVideoProvider()).toBe(true);
  });
});

describe("buildYtdlpCookieArgs", () => {
  afterEach(() => {
    delete process.env.YTDLP_COOKIES_FILE;
    delete process.env.YTDLP_COOKIES_FROM_BROWSER;
  });

  it("includes cookies file and browser when both are set", () => {
    process.env.YTDLP_COOKIES_FILE = "C:/secrets/douyin-cookies.txt";
    process.env.YTDLP_COOKIES_FROM_BROWSER = "chrome";

    expect(buildYtdlpCookieArgs()).toEqual([
      "--cookies",
      "C:/secrets/douyin-cookies.txt",
      "--cookies-from-browser",
      "chrome",
    ]);
  });

  it("returns no cookie flags when unset", () => {
    expect(buildYtdlpCookieArgs()).toEqual([]);
  });
});

describe("mapYtdlpJsonToDetail", () => {
  it("maps yt-dlp JSON to a Douyin video detail", () => {
    const detail = mapYtdlpJsonToDetail(
      {
        id: "7123456789012345678",
        title: "酒馆西片",
        description: "旁白讲解",
        webpage_url: "https://www.douyin.com/video/7123456789012345678",
        uploader: "reviewer",
        thumbnail: "https://example.test/cover.jpg",
        like_count: 10,
        comment_count: 2,
        repost_count: 1,
        timestamp: 1_700_000_000,
      },
      "https://v.douyin.com/abc/",
    );

    expect(detail).toMatchObject({
      videoId: "7123456789012345678",
      title: "酒馆西片",
      caption: "旁白讲解",
      authorHandle: "@reviewer",
      coverUrl: "https://example.test/cover.jpg",
      canonicalUrl: "https://www.douyin.com/video/7123456789012345678",
      stats: { likes: 10, comments: 2, shares: 1 },
    });
    expect(detail.playUrl).toBeUndefined();
    expect(detail.rawPayload).toMatchObject({ source: "ytdlp" });
  });
});

describe("formatYtdlpAuthHint", () => {
  it("tells the operator to export Douyin cookies on login-style failures", () => {
    expect(formatYtdlpAuthHint("ERROR: this video is private, login required")).toMatch(
      /YTDLP_COOKIES_FILE/,
    );
  });

  it("returns empty when the error is unrelated", () => {
    expect(formatYtdlpAuthHint("ERROR: no video formats found")).toBe("");
  });
});

describe("fetchYtdlpVideoDetail", () => {
  it("parses yt-dlp JSON stdout from the runner", async () => {
    const detail = await fetchYtdlpVideoDetail(
      "https://v.douyin.com/abc/",
      async () => ({
        stdout: JSON.stringify({
          id: "7123456789012345678",
          title: "酒馆",
          webpage_url: "https://www.douyin.com/video/7123456789012345678",
        }),
        stderr: "",
      }),
    );

    expect(detail.videoId).toBe("7123456789012345678");
    expect(detail.title).toBe("酒馆");
  });
});

describe("downloadYtdlpVideo", () => {
  it("reads the mp4 written to the -o path", async () => {
    const result = await downloadYtdlpVideo(
      "https://v.douyin.com/abc/",
      async (args) => {
        const outputPath = args[args.indexOf("-o") + 1];
        if (!outputPath) throw new Error("missing -o");
        await writeFile(outputPath, Buffer.from("mp4"));
        return { stdout: "", stderr: "" };
      },
    );

    expect(result.contentType).toBe("video/mp4");
    expect(result.buffer.toString()).toBe("mp4");
  });
});
