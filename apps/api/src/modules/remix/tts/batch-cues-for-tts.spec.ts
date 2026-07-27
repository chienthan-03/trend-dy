import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  batchCuesForTts,
  getPiperTtsBatchMode,
  getTtsBatchMode,
  perCueBatchesForTts,
  type CueForBatch,
} from "./batch-cues-for-tts";

const cue = (
  index: number,
  startSec: number,
  endSec: number,
  text: string,
): CueForBatch => ({ index, startSec, endSec, text });

describe("batchCuesForTts", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("defaults to batch mode", () => {
    delete process.env.REMIX_TTS_BATCH_MODE;
    expect(getTtsBatchMode()).toBe("batch");
  });

  it("defaults Piper to per_cue batch mode", () => {
    delete process.env.REMIX_PIPER_TTS_BATCH_MODE;
    expect(getPiperTtsBatchMode()).toBe("per_cue");
  });

  it("perCueBatchesForTts returns one batch per cue", () => {
    const batches = perCueBatchesForTts([
      cue(0, 0, 2, "Một."),
      cue(1, 2, 4, "Hai."),
    ]);

    expect(batches).toHaveLength(2);
    expect(batches[0]!.text).toBe("Một.");
    expect(batches[1]!.segmentIndexes).toEqual([1]);
  });

  it("merges adjacent short cues under duration/char caps", () => {
    const batches = batchCuesForTts(
      [
        cue(0, 0, 2, "Câu một."),
        cue(1, 2, 4, "Câu hai."),
        cue(2, 4, 6, "Câu ba."),
      ],
      { maxDurationSec: 10, maxChars: 400 },
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]!.segmentIndexes).toEqual([0, 1, 2]);
    expect(batches[0]!.text).toBe("Câu một. Câu hai. Câu ba.");
    expect(batches[0]!.totalWindowSec).toBeCloseTo(6, 5);
  });

  it("starts a new batch when max duration would be exceeded", () => {
    const batches = batchCuesForTts(
      [
        cue(0, 0, 4, "AAAAA"),
        cue(1, 4, 8, "BBBBB"),
        cue(2, 8, 12, "CCCCC"),
      ],
      { maxDurationSec: 8, maxChars: 400 },
    );

    // 4+4=8 fits; adding third (4) → 12 > 8 → new batch
    expect(batches).toHaveLength(2);
    expect(batches[0]!.segmentIndexes).toEqual([0, 1]);
    expect(batches[1]!.segmentIndexes).toEqual([2]);
  });

  it("does not merge across a large timeline gap", () => {
    const batches = batchCuesForTts(
      [
        cue(0, 0, 2, "Trước."),
        cue(1, 5, 7, "Sau khoảng lặng."),
      ],
      { maxDurationSec: 20, maxChars: 400, maxGapSec: 0.75 },
    );

    expect(batches).toHaveLength(2);
    expect(batches[0]!.segmentIndexes).toEqual([0]);
    expect(batches[1]!.segmentIndexes).toEqual([1]);
  });

  it("405 fine cues become far fewer batches than cues", () => {
    const cues = Array.from({ length: 405 }, (_, i) =>
      cue(i, i * 2, i * 2 + 1.8, `Câu số ${i} nội dung vừa.`),
    );
    const batches = batchCuesForTts(cues, {
      maxDurationSec: 10,
      maxChars: 400,
    });

    expect(batches.length).toBeLessThan(120);
    expect(batches.length).toBeGreaterThan(20);
    expect(batches.flatMap((batch) => batch.segmentIndexes)).toHaveLength(405);
  });
});
