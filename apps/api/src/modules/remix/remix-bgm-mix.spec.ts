import { describe, expect, it } from "vitest";
import {
  buildBgmMixFilterComplex,
  resolveBgmSpeed,
  resolveBgmStartSec,
  resolveBgmVolume,
} from "./remix-bgm-mix";

describe("buildBgmMixFilterComplex", () => {
  it("includes volume and amix with duration=first", () => {
    const filter = buildBgmMixFilterComplex({
      volume: 0.3,
      speed: 1,
      startSec: 0,
    });
    expect(filter).toContain("volume=0.3[bgm_processed]");
    expect(filter).toContain("aloop=loop=-1");
    expect(filter).toContain(
      "[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]",
    );
  });

  it("includes atrim and atempo when configured", () => {
    const filter = buildBgmMixFilterComplex({
      volume: 0.5,
      speed: 1.25,
      startSec: 12,
    });
    expect(filter).toContain("atrim=start=12,asetpts=PTS-STARTPTS,");
    expect(filter).toContain("atempo=1.25,");
  });
});

describe("resolveBgmVolume", () => {
  it("defaults null to 0.3", () => {
    expect(resolveBgmVolume(null)).toBe(0.3);
  });

  it("clamps values to 0-1", () => {
    expect(resolveBgmVolume(1.5)).toBe(1);
    expect(resolveBgmVolume(-0.2)).toBe(0);
  });
});

describe("resolveBgmSpeed", () => {
  it("defaults null to 1", () => {
    expect(resolveBgmSpeed(null)).toBe(1);
  });

  it("clamps speed to 0.5-2", () => {
    expect(resolveBgmSpeed(3)).toBe(2);
    expect(resolveBgmSpeed(0.1)).toBe(0.5);
  });
});

describe("resolveBgmStartSec", () => {
  it("defaults null to 0", () => {
    expect(resolveBgmStartSec(null)).toBe(0);
  });

  it("clamps to track duration when max provided", () => {
    expect(resolveBgmStartSec(200, 120)).toBe(119.95);
  });
});
