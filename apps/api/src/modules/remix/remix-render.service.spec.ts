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

describe("RemixRenderService.renderBannerAudio (fake mode)", () => {
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
    const result = await service.renderBannerAudio(
      Buffer.from("fake-video-bytes"),
      Buffer.from("fake-dub-audio"),
      { header: "Header", bottom: "Bottom" },
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("returns a fixture distinct from the audio_only fixture", async () => {
    const audioOnly = await service.renderAudioOnly(
      Buffer.alloc(10),
      Buffer.alloc(10),
    );
    const bannerAudio = await service.renderBannerAudio(
      Buffer.alloc(10),
      Buffer.alloc(10),
      { header: "", bottom: "" },
    );

    expect(bannerAudio).not.toEqual(audioOnly);
  });

  it("returns the same fixture regardless of banner text or input size", async () => {
    const small = await service.renderBannerAudio(
      Buffer.alloc(0),
      Buffer.alloc(0),
      { header: "A", bottom: "B" },
    );
    const large = await service.renderBannerAudio(
      Buffer.alloc(1000),
      Buffer.alloc(1000),
      { header: "Different header", bottom: "Different bottom" },
    );

    expect(small).toEqual(large);
  });
});

describe("RemixRenderService.renderAudioMix (fake mode)", () => {
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
    const result = await service.renderAudioMix(
      Buffer.from("fake-video-bytes"),
      Buffer.from("fake-dub-audio"),
      [{ startSec: 1, endSec: 2 }],
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("returns the same fixture regardless of narration intervals or input size", async () => {
    const noIntervals = await service.renderAudioMix(
      Buffer.alloc(0),
      Buffer.alloc(0),
      [],
    );
    const withIntervals = await service.renderAudioMix(
      Buffer.alloc(1000),
      Buffer.alloc(1000),
      [
        { startSec: 0, endSec: 1 },
        { startSec: 3, endSec: 4 },
      ],
    );

    expect(noIntervals).toEqual(withIntervals);
  });
});

describe("RemixRenderService.renderBannerAudioMix (fake mode)", () => {
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
    const result = await service.renderBannerAudioMix(
      Buffer.from("fake-video-bytes"),
      Buffer.from("fake-dub-audio"),
      { header: "Header", bottom: "Bottom" },
      [{ startSec: 1, endSec: 2 }],
    );

    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.subarray(4, 8).toString("ascii")).toBe("ftyp");
  });

  it("returns a fixture distinct from the audio_only mix fixture", async () => {
    const audioMix = await service.renderAudioMix(
      Buffer.alloc(10),
      Buffer.alloc(10),
      [],
    );
    const bannerAudioMix = await service.renderBannerAudioMix(
      Buffer.alloc(10),
      Buffer.alloc(10),
      { header: "", bottom: "" },
      [],
    );

    expect(bannerAudioMix).not.toEqual(audioMix);
  });
});
