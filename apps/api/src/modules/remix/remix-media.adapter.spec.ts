import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRemixMediaAdapter } from "./adapters/fake-remix-media.adapter";
import { HttpRemixMediaAdapter } from "./adapters/http-remix-media.adapter";
import { createRemixMediaAdapter } from "./remix-media.adapter";

describe("FakeRemixMediaAdapter", () => {
  it("returns a non-empty buffer", async () => {
    const adapter = new FakeRemixMediaAdapter();
    const result = await adapter.downloadFromPlayUrl("https://example.test/video.mp4", "video-001");

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.contentType).toBe("video/mp4");
    expect(result.sizeBytes).toBe(result.buffer.length);
  });

  it("returns a stable buffer for the same videoId", async () => {
    const adapter = new FakeRemixMediaAdapter();
    const first = await adapter.downloadFromPlayUrl("https://example.test/a.mp4", "stable-id");
    const second = await adapter.downloadFromPlayUrl("https://example.test/b.mp4", "stable-id");

    expect(first.buffer.equals(second.buffer)).toBe(true);
  });
});

describe("createRemixMediaAdapter", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("throws when REMIX_ALLOW_MEDIA_DOWNLOAD=false", async () => {
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "false";

    await expect(createRemixMediaAdapter()).rejects.toThrow("Media download is disabled");
  });

  it("returns the fake adapter when REMIX_MEDIA_ADAPTER=fake", async () => {
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
    process.env.REMIX_MEDIA_ADAPTER = "fake";

    const adapter = await createRemixMediaAdapter();
    expect(adapter).toBeInstanceOf(FakeRemixMediaAdapter);
  });
});

describe("HttpRemixMediaAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.REMIX_MAX_MEDIA_MB;
  });

  it("rejects oversized media based on Content-Length", async () => {
    process.env.REMIX_MAX_MEDIA_MB = "1";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (name: string) => (name === "content-length" ? String(2 * 1024 * 1024) : null),
        },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    const adapter = new HttpRemixMediaAdapter();

    await expect(
      adapter.downloadFromPlayUrl("https://example.test/large.mp4", "video-001"),
    ).rejects.toThrow(/exceeds maximum size/);
  });

  it("rejects oversized media after download", async () => {
    process.env.REMIX_MAX_MEDIA_MB = "1";
    const oversized = new Uint8Array(2 * 1024 * 1024);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: () => null,
        },
        arrayBuffer: async () => oversized.buffer,
      }),
    );

    const adapter = new HttpRemixMediaAdapter();

    await expect(
      adapter.downloadFromPlayUrl("https://example.test/large.mp4", "video-002"),
    ).rejects.toThrow(/exceeds maximum size/);
  });
});
