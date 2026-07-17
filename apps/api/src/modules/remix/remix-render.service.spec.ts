import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RemixRenderService } from "./remix-render.service";

describe("RemixRenderService.renderAudioOnly (fake mode)", () => {
  let service: RemixRenderService;
  let previousMode: string | undefined;

  beforeEach(() => {
    previousMode = process.env.REMIX_RENDER_MODE;
    process.env.REMIX_RENDER_MODE = "fake";
    service = new RemixRenderService();
  });

  afterEach(() => {
    if (previousMode === undefined) {
      delete process.env.REMIX_RENDER_MODE;
    } else {
      process.env.REMIX_RENDER_MODE = previousMode;
    }
  });

  it("returns a non-empty mp4 buffer without invoking ffmpeg", async () => {
    const result = await service.renderAudioOnly(
      Buffer.from("fake-video-bytes"),
      Buffer.from("fake-dub-audio"),
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // ftyp box signature
    expect(result.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("returns the same fixture regardless of input size", async () => {
    const small = await service.renderAudioOnly(Buffer.alloc(0), Buffer.alloc(0));
    const large = await service.renderAudioOnly(
      Buffer.alloc(1000),
      Buffer.alloc(1000),
    );

    expect(small).toEqual(large);
  });
});
