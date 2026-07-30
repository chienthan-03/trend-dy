import { beforeEach, describe, expect, it } from "vitest";
import { RemixBgmService } from "./remix-bgm.service";

describe("RemixBgmService", () => {
  let service: RemixBgmService;

  beforeEach(() => {
    service = new RemixBgmService();
  });

  it("lists 6 tracks with preview paths", async () => {
    const tracks = await service.listTracks();
    expect(tracks).toHaveLength(6);
    expect(tracks[0].previewUrl).toContain("/viral/remix/bgm/");
    expect(tracks[0].previewUrl).toContain("/preview");
    expect(tracks[0].durationSec).toBeGreaterThan(0);
  });

  it("reads buffer for valid track id", async () => {
    const buffer = await service.readTrackBuffer("else-paris");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("throws for unknown track id", async () => {
    await expect(service.readTrackBuffer("unknown" as "else-paris")).rejects.toThrow();
  });
});
