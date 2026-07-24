import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  smartBatchCuesForTts,
  splitSmartBatchAudioToCues,
} from "./smart-batch-cues";
import type { CueForBatch } from "./batch-cues-for-tts";

const cue = (
  index: number,
  startSec: number,
  endSec: number,
  text: string,
): CueForBatch => ({ index, startSec, endSec, text });

describe("smartBatchCuesForTts", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("merges adjacent cues under gap/duration/char caps", () => {
    const batches = smartBatchCuesForTts(
      [
        cue(0, 0, 2, "Câu một."),
        cue(1, 2, 4, "Câu hai."),
        cue(2, 4, 6, "Câu ba."),
      ],
      { maxDurationSec: 12, maxChars: 500, maxGapSec: 0.6 },
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]!.segmentIndexes).toEqual([0, 1, 2]);
    expect(batches[0]!.text).toBe("Câu một. Câu hai. Câu ba.");
    expect(batches[0]!.totalWindowSec).toBeCloseTo(6, 5);
  });

  it("does not merge across large gaps", () => {
    const batches = smartBatchCuesForTts(
      [
        cue(0, 0, 2, "Trước."),
        cue(1, 5, 7, "Sau khoảng lặng."),
      ],
      { maxDurationSec: 12, maxChars: 500, maxGapSec: 0.6 },
    );

    expect(batches).toHaveLength(2);
    expect(batches[0]!.segmentIndexes).toEqual([0]);
    expect(batches[1]!.segmentIndexes).toEqual([1]);
  });

  it("flushes after sentence-ending punctuation when next cue would exceed caps", () => {
    const batches = smartBatchCuesForTts(
      [
        cue(0, 0, 3, "First."),
        cue(1, 3, 5, "More text"),
        cue(2, 5, 8, "End."),
        cue(3, 8, 10, "Next."),
      ],
      { maxDurationSec: 7, maxChars: 500, maxGapSec: 0.6 },
    );

    expect(batches).toHaveLength(2);
    expect(batches[0]!.segmentIndexes).toEqual([0]);
    expect(batches[0]!.text).toBe("First.");
    expect(batches[1]!.segmentIndexes).toEqual([1, 2, 3]);
    expect(batches[1]!.text).toBe("More text End. Next.");
  });
});

describe("splitSmartBatchAudioToCues", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, REMIX_TTS_MODE: "fake" };
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns one slice per cue at cumulative window boundaries", async () => {
    const cues = [
      cue(0, 0, 2, "a"),
      cue(1, 2, 6, "b"),
      cue(2, 6, 8, "c"),
    ];
    const batchMp3 = Buffer.alloc(1000, 0x01);

    const slices = await splitSmartBatchAudioToCues({
      cues,
      batchMp3,
      batchAudioDurationSec: 10,
    });

    expect(slices).toHaveLength(3);
    expect(slices.map((slice) => slice.index)).toEqual([0, 1, 2]);
    for (const slice of slices) {
      expect(slice.buffer.length).toBeGreaterThan(0);
      expect(slice.sliceDurationSec).toBeGreaterThan(0);
    }
    expect(slices[0]!.startSec).toBe(0);
    expect(slices[0]!.endSec).toBe(2);
    expect(slices[2]!.startSec).toBe(6);
    expect(slices[2]!.endSec).toBe(8);
  });
});
