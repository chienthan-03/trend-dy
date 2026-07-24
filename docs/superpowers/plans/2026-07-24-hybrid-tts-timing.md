# Hybrid TTS Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retimed Vietnamese TTS so narration finishes sentences and defers following cues inside a block, while locking `source` cues and block starts to the Chinese timeline (with 500ms grace before speed+truncate).

**Architecture:** Pure `planHybridTimeline()` runs after synthesize/split (when real `audioDurationSec` is known). `handleTts` collects raw per-cue buffers first, then either applies the hybrid plan (`timingMode=hybrid` && `audioMode=replace`) or keeps strict ZH-window fit. Assemble/render unchanged.

**Tech Stack:** NestJS worker, Vitest, existing `planSegmentFit` / `applyFitToTarget` / `assembleDubTimeline`

**Spec:** [docs/superpowers/specs/2026-07-24-hybrid-tts-timing-design.md](../specs/2026-07-24-hybrid-tts-timing-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/src/modules/remix/remix-config.ts` | `TtsTimingMode`, `getTtsTimingMode()`, optional gap/grace getters |
| `apps/api/src/modules/remix/remix-config.spec.ts` | Default `hybrid`; `strict`; unknown → `hybrid` |
| `.env.example` | Document `REMIX_TTS_TIMING_MODE` |
| `apps/api/src/modules/remix/tts/hybrid-timeline.ts` | Pure planner: locks, defer, grace budget |
| `apps/api/src/modules/remix/tts/hybrid-timeline.spec.ts` | Unit tests for planner rules |
| `apps/api/src/workers/processors/remix.processor.ts` | Collect raw clips → plan → fit; gate hybrid |
| `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` | Hybrid retimes; strict keeps ZH starts |

**Locked defaults:**

```ts
REMIX_TTS_TIMING_MODE = "hybrid" // | "strict"
REMIX_TTS_HYBRID_BLOCK_GAP_SEC = 1.0   // optional env; hardcode OK
REMIX_TTS_HYBRID_LOCK_GRACE_SEC = 0.5  // optional env; hardcode OK
```

**Effective hybrid:** `getTtsTimingMode() === "hybrid" && getTtsAudioMode() === "replace"`.

**Integration shape (critical):** Do **not** ZH-truncate hybrid narration inside the batch loop before planning. Pattern:

```ts
// 1) synth + split → rawByIndex: Map<index, { buffer, audioDurationSec, zhStart, zhEnd, role }>
// 2) if useHybrid: outs = planHybridTimeline(...); else strict ZH targets
// 3) for each cue: planSegmentFit + applyFitToTarget(fitTargetSec); timeline uses planned startSec
```

---

### Task 1: Timing mode config

**Files:**
- Modify: `apps/api/src/modules/remix/remix-config.ts`
- Modify: `apps/api/src/modules/remix/remix-config.spec.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing config tests**

Add to `remix-config.spec.ts` (import `getTtsTimingMode`):

```ts
it("defaults TTS timing mode to hybrid", () => {
  delete process.env.REMIX_TTS_TIMING_MODE;
  expect(getTtsTimingMode()).toBe("hybrid");
});

it("honors REMIX_TTS_TIMING_MODE=strict", () => {
  process.env.REMIX_TTS_TIMING_MODE = "strict";
  expect(getTtsTimingMode()).toBe("strict");
});

it("falls back to hybrid for unknown timing mode", () => {
  process.env.REMIX_TTS_TIMING_MODE = "elastic";
  expect(getTtsTimingMode()).toBe("hybrid");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && npx vitest run src/modules/remix/remix-config.spec.ts -t "timing mode"
```

Expected: FAIL — `getTtsTimingMode` not exported / undefined.

- [ ] **Step 3: Implement config**

In `remix-config.ts` (near `getTtsAudioMode`):

```ts
export type TtsTimingMode = "hybrid" | "strict";

export const getTtsTimingMode = (): TtsTimingMode => {
  const raw = process.env.REMIX_TTS_TIMING_MODE?.trim().toLowerCase();
  if (raw === "strict") return "strict";
  return "hybrid";
};

export const getHybridBlockGapSec = (): number => {
  const n = Number(process.env.REMIX_TTS_HYBRID_BLOCK_GAP_SEC ?? "1");
  if (!Number.isFinite(n) || n < 0) return 1;
  return n;
};

export const getHybridLockGraceSec = (): number => {
  const n = Number(process.env.REMIX_TTS_HYBRID_LOCK_GRACE_SEC ?? "0.5");
  if (!Number.isFinite(n) || n < 0) return 0.5;
  return n;
};
```

In `.env.example` after `REMIX_TTS_AUDIO_MODE`:

```bash
# hybrid (default) = narration finishes + defers next cue; locks at source / block gaps
# strict = pin every cue to Chinese STT windows (legacy)
REMIX_TTS_TIMING_MODE=hybrid
# REMIX_TTS_HYBRID_BLOCK_GAP_SEC=1
# REMIX_TTS_HYBRID_LOCK_GRACE_SEC=0.5
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd apps/api && npx vitest run src/modules/remix/remix-config.spec.ts -t "timing mode"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/remix-config.ts apps/api/src/modules/remix/remix-config.spec.ts .env.example
git commit -m "feat(remix): add REMIX_TTS_TIMING_MODE hybrid/strict config"
```

---

### Task 2: `planHybridTimeline` (TDD)

**Files:**
- Create: `apps/api/src/modules/remix/tts/hybrid-timeline.spec.ts`
- Create: `apps/api/src/modules/remix/tts/hybrid-timeline.ts`

- [ ] **Step 1: Write failing unit tests**

Create `hybrid-timeline.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planHybridTimeline } from "./hybrid-timeline";

const opts = { blockGapSec: 1, lockGraceSec: 0.5, maxSpeed: 1.25 };

describe("planHybridTimeline", () => {
  it("keeps ZH start for short narration (silence gap, no early pull)", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 2, role: "narration", audioDurationSec: 0.8 },
        { index: 1, startSec: 2, endSec: 4, role: "narration", audioDurationSec: 1.0 },
      ],
      opts,
    );
    // First cue is always locked → fitTarget = ZH window (may pad short audio)
    expect(out[0]!.locked).toBe(true);
    expect(out[0]!.startSec).toBe(0);
    expect(out[0]!.fitTargetSec).toBeCloseTo(2.0);
    expect(out[1]!.startSec).toBe(2); // not pulled early
  });

  it("defers following narration when previous unlocked cue overruns ZH end", () => {
    // First cue is always locked (ZH window). Long cue must be unlocked middle.
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 0.5, role: "narration", audioDurationSec: 0.4 },
        { index: 1, startSec: 0.5, endSec: 2, role: "narration", audioDurationSec: 3.0 },
        { index: 2, startSec: 2, endSec: 4, role: "narration", audioDurationSec: 1.0 },
      ],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[1]!.locked).toBe(false);
    expect(out[1]!.fitTargetSec).toBeCloseTo(3.0); // finish sentence
    expect(out[2]!.startSec).toBeCloseTo(0.5 + 3.0); // deferred past ZH start 2
  });

  it("locks source to ZH window", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 2, role: "narration", audioDurationSec: 1.5 },
        { index: 1, startSec: 5, endSec: 6, role: "source", audioDurationSec: 1.2 },
      ],
      opts,
    );
    const source = out.find((c) => c.index === 1)!;
    expect(source.locked).toBe(true);
    expect(source.startSec).toBe(5);
    expect(source.fitTargetSec).toBeCloseTo(1.0); // ZH window
  });

  it("constrains unlocked narration before source with 500ms grace", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 0.5, role: "narration", audioDurationSec: 0.4 },
        { index: 1, startSec: 0.5, endSec: 2, role: "narration", audioDurationSec: 10 },
        { index: 2, startSec: 5, endSec: 6, role: "source", audioDurationSec: 1 },
      ],
      opts,
    );
    // start = max(0.5, prev≈0.5)=0.5; maxEnd = 5 + 0.5 = 5.5 → fitTarget = 5.0
    expect(out[1]!.locked).toBe(false);
    expect(out[1]!.startSec).toBeCloseTo(0.5);
    expect(out[1]!.fitTargetSec).toBeCloseTo(5.0);
  });

  it("marks new lock after gap >= blockGapSec", () => {
    const out = planHybridTimeline(
      [
        { index: 0, startSec: 0, endSec: 1, role: "narration", audioDurationSec: 0.5 },
        { index: 1, startSec: 3, endSec: 4, role: "narration", audioDurationSec: 0.5 }, // gap 2s
      ],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[1]!.locked).toBe(true);
    expect(out[1]!.startSec).toBe(3);
  });

  it("uses effectiveRole: missing role treated as narration", () => {
    const out = planHybridTimeline(
      [{ index: 0, startSec: 0, endSec: 1, audioDurationSec: 0.4 }],
      opts,
    );
    expect(out[0]!.locked).toBe(true);
    expect(out[0]!.fitTargetSec).toBeCloseTo(1.0); // locked → ZH window, not natural 0.4
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && npx vitest run src/modules/remix/tts/hybrid-timeline.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement planner**

Create `hybrid-timeline.ts` implementing the spec algorithm:

```ts
import { effectiveRole } from "./segment-role";

export type HybridCueIn = {
  index: number;
  startSec: number;
  endSec: number;
  role?: "narration" | "source";
  audioDurationSec: number;
};

export type HybridCueOut = {
  index: number;
  startSec: number;
  endSec: number;
  fitTargetSec: number;
  locked: boolean;
};

export type HybridTimelineOptions = {
  blockGapSec: number;
  lockGraceSec: number;
  maxSpeed: number;
  videoEndSec?: number;
};

const EPS = 0.1;

export const planHybridTimeline = (
  cues: HybridCueIn[],
  options: HybridTimelineOptions,
): HybridCueOut[] => {
  const sorted = [...cues].sort(
    (a, b) => a.startSec - b.startSec || a.index - b.index,
  );
  if (sorted.length === 0) return [];

  const lockedIdx = new Set<number>();
  sorted.forEach((cue, i) => {
    if (i === 0) lockedIdx.add(cue.index);
    if (effectiveRole(cue) === "source") lockedIdx.add(cue.index);
    if (i > 0) {
      const prev = sorted[i - 1]!;
      const gap = cue.startSec - prev.endSec;
      if (effectiveRole(cue) === "narration" && gap >= options.blockGapSec) {
        lockedIdx.add(cue.index);
      }
    }
  });

  const lockStarts = sorted
    .filter((c) => lockedIdx.has(c.index))
    .map((c) => c.startSec);

  const nextLockStartAfter = (zhStart: number): number => {
    const next = lockStarts.find((s) => s > zhStart + 1e-9);
    if (next != null) return next;
    if (options.videoEndSec != null && Number.isFinite(options.videoEndSec)) {
      return options.videoEndSec;
    }
    return Number.POSITIVE_INFINITY;
  };

  let prevPlacedEnd = 0;
  const out: HybridCueOut[] = [];

  for (const cue of sorted) {
    const locked = lockedIdx.has(cue.index);
    if (locked) {
      const fitTargetSec = Math.max(cue.endSec - cue.startSec, EPS);
      const startSec = cue.startSec;
      const endSec = startSec + fitTargetSec;
      out.push({
        index: cue.index,
        startSec,
        endSec,
        fitTargetSec,
        locked: true,
      });
      prevPlacedEnd = startSec + fitTargetSec;
      continue;
    }

    const startSec = Math.max(cue.startSec, prevPlacedEnd);
    const naturalEnd = startSec + cue.audioDurationSec;
    const nextLock = nextLockStartAfter(cue.startSec);
    const maxEndSec = Number.isFinite(nextLock)
      ? nextLock + options.lockGraceSec
      : Number.POSITIVE_INFINITY;
    const fitTargetSec =
      naturalEnd <= maxEndSec
        ? Math.max(cue.audioDurationSec, EPS)
        : Math.max(maxEndSec - startSec, EPS);
    const placedEnd = startSec + Math.min(cue.audioDurationSec, fitTargetSec);
    out.push({
      index: cue.index,
      startSec,
      endSec: placedEnd,
      fitTargetSec,
      locked: false,
    });
    prevPlacedEnd = placedEnd;
  }

  return out.sort((a, b) => a.index - b.index);
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd apps/api && npx vitest run src/modules/remix/tts/hybrid-timeline.spec.ts
```

Expected: PASS (adjust expectations if ε/`prevPlacedEnd` for locked pad differs by &lt;0.05).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/tts/hybrid-timeline.ts apps/api/src/modules/remix/tts/hybrid-timeline.spec.ts
git commit -m "feat(remix): add planHybridTimeline for hybrid TTS timing"
```

---

### Task 3: Wire hybrid into `handleTts`

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 1: Write failing processor tests**

In `remix.processor.full-script.spec.ts` `beforeEach`, add `delete process.env.REMIX_TTS_TIMING_MODE;` next to the other remix env deletes. Add:

```ts
it("handleTts hybrid retimes long narration before a source lock", async () => {
  process.env.REMIX_TTS_MODE = "fake";
  process.env.REMIX_TTS_AUDIO_MODE = "replace";
  process.env.REMIX_TTS_TIMING_MODE = "hybrid";
  process.env.REMIX_TTS_BATCH_MODE = "per_cue";

  const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

  remixService.getRemake.mockResolvedValue({
    id: "remake_1",
    dubSource: null,
    mediaDubAudioKey: null,
    ttsVoiceId: null,
    ttsEngine: null,
    videoDurationSec: 12,
    sourceTranscriptTranslated: {
      version: 1,
      language: "vi",
      durationSec: 12,
      segments: [
        { startSec: 0, endSec: 0.5, text: "A", role: "narration", roleSource: "manual" },
        {
          startSec: 0.5,
          endSec: 2,
          text: "B".repeat(200),
          role: "narration",
          roleSource: "manual",
        },
        { startSec: 5, endSec: 6, text: "C", role: "source", roleSource: "manual" },
      ],
      fullText: "…",
    },
  });

  await processor.process({
    id: "job_hybrid",
    name: "remix_tts",
    data: { remakeId: "remake_1" },
  } as never);

  expect(assembleSpy).toHaveBeenCalled();
  const segs = assembleSpy.mock.calls[0]![0].segments as Array<{
    startSec: number;
    endSec: number;
  }>;
  // narration B should not stay hard-pinned ending at 2 if audio is long —
  // either start deferred chain or fitTarget constrained by source+grace
  const narrB = segs[1]!;
  expect(narrB.endSec).toBeGreaterThan(2);
});

it("handleTts strict keeps ZH startSec for narration", async () => {
  process.env.REMIX_TTS_MODE = "fake";
  process.env.REMIX_TTS_AUDIO_MODE = "replace";
  process.env.REMIX_TTS_TIMING_MODE = "strict";
  process.env.REMIX_TTS_BATCH_MODE = "per_cue";

  const assembleSpy = vi.spyOn(assembleDub, "assembleDubTimeline");

  remixService.getRemake.mockResolvedValue({
    id: "remake_1",
    dubSource: null,
    mediaDubAudioKey: null,
    ttsVoiceId: null,
    ttsEngine: null,
    videoDurationSec: 10,
    sourceTranscriptTranslated: {
      version: 1,
      language: "vi",
      durationSec: 10,
      segments: [
        { startSec: 0, endSec: 2, text: "A".repeat(80), role: "narration", roleSource: "manual" },
        { startSec: 2, endSec: 4, text: "B", role: "narration", roleSource: "manual" },
      ],
      fullText: "…",
    },
  });

  await processor.process({
    id: "job_strict",
    name: "remix_tts",
    data: { remakeId: "remake_1" },
  } as never);

  const segs = assembleSpy.mock.calls[0]![0].segments as Array<{ startSec: number }>;
  expect(segs[0]!.startSec).toBe(0);
  expect(segs[1]!.startSec).toBe(2);
});
```

Tune assertions to FakeTtsAdapter duration behavior. `"B".repeat(200)` already yields ~10s via fake duration estimate under `per_cue` — no synthesize spy required unless durations are stubbed shorter elsewhere.

**Also:** existing full-script tests that assume ZH-pin + shorten (`fits each segment, retries a shorten once`, `records ttsFitFailedIndexes`, etc.) must set `process.env.REMIX_TTS_TIMING_MODE = "strict"` once hybrid is the default, or they will flake.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd apps/api && npx vitest run src/workers/processors/remix.processor.full-script.spec.ts -t "hybrid retimes|strict keeps"
```

Expected: FAIL on hybrid assertion (still ZH-pinned).

- [ ] **Step 3: Refactor `handleTts` fit path**

Imports: add `planHybridTimeline`, `getTtsTimingMode`, `getHybridBlockGapSec`, `getHybridLockGraceSec`. When building `cues`, also keep role lookup from `translated.segments[index]`.

**Required structural change:** the current `per_cue` branch writes `timelineByIndex` and `continue`s (~L855–903). Remove that early fit/`continue` so **both** `per_cue` and batch-split paths only **collect** into `rawByIndex` inside the batch loop; all `planSegmentFit` / `applyFitToTarget` / `timelineByIndex` writes move to the shared fit phase after planning.

Replace the immediate fit-inside-batch loop with:

1. **Collect phase** — for each batch, synth. Optional LLM shorten (`per_cue` only): run when `!useHybrid`, **or** when `useHybrid` and the single cue will be locked (`source` / first / block-start — compute locks with the same rules as `planHybridTimeline`, or shorten after plan for locked indexes only). Hybrid **unlocked** narration skips shorten. For `per_cue` single-cue batches, store the synth buffer/duration directly (no split). For multi-cue batches, split to slices then store (same collect into `rawByIndex` — move the current slice fit loop ~L918–941 to collect-only as well):

```ts
rawByIndex.set(index, {
  buffer,
  audioDurationSec,
  zhStartSec,
  zhEndSec,
  role: effectiveRole(translated.segments[index]!),
});
```

2. **Plan phase:**

```ts
const useHybrid =
  getTtsTimingMode() === "hybrid" && getTtsAudioMode() === "replace";

const hybridOuts = useHybrid
  ? planHybridTimeline(
      [...rawByIndex.entries()].map(([index, raw]) => ({
        index,
        startSec: raw.zhStartSec,
        endSec: raw.zhEndSec,
        role: raw.role,
        audioDurationSec: raw.audioDurationSec,
      })),
      {
        blockGapSec: getHybridBlockGapSec(),
        lockGraceSec: getHybridLockGraceSec(),
        maxSpeed,
        videoEndSec: remake.videoDurationSec ?? undefined,
      },
    )
  : null;
```

3. **Fit phase:**

```ts
for (const [index, raw] of rawByIndex) {
  const planned = hybridOuts?.find((o) => o.index === index);
  const startSec = planned?.startSec ?? raw.zhStartSec;
  const fitTargetSec = planned?.fitTargetSec ?? Math.max(raw.zhEndSec - raw.zhStartSec, 0.1);
  const plan = planSegmentFit({
    audioDurationSec: raw.audioDurationSec,
    targetDurationSec: fitTargetSec,
    maxSpeed,
  });
  const fitted = await applyFitToTarget(raw.buffer, plan, fitTargetSec);
  if (fitted.truncated || plan.action === "shorten") {
    fitFailedIndexes.push(index);
  }
  timelineByIndex.set(index, {
    startSec,
    endSec: startSec + fitTargetSec, // or measure after fit if easy
    fittedMp3Buffer: fitted.buffer,
  });
}
```

For **strict**, behavior must match today’s ZH pad/speed/truncate (including per_cue shorten before collect — keep shorten inside collect when `!useHybrid && per_cue`).

Log one line when hybrid: `remix_tts … hybrid timeline planned for N cues`.

- [ ] **Step 4: Run processor tests**

Run:

```bash
cd apps/api && npx vitest run src/workers/processors/remix.processor.full-script.spec.ts
```

Expected: all PASS (fix any previously brittle expectations if collect/fit order changes call counts).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/processors/remix.processor.ts apps/api/src/workers/processors/remix.processor.full-script.spec.ts
git commit -m "feat(remix): wire hybrid TTS timeline into handleTts"
```

---

### Task 4: Full verification

**Files:** (none new)

- [ ] **Step 1: Run targeted suites**

```bash
cd apps/api && npx vitest run \
  src/modules/remix/remix-config.spec.ts \
  src/modules/remix/tts/hybrid-timeline.spec.ts \
  src/modules/remix/tts/segment-fit.spec.ts \
  src/workers/processors/remix.processor.full-script.spec.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke (operator)**

1. Ensure `.env` has `REMIX_TTS_AUDIO_MODE=replace` and omit or set `REMIX_TTS_TIMING_MODE=hybrid`.
2. Restart worker.
3. Re-run TTS + Render on remake `cmryof5ld000wvst4z1tijo8v` (or current).
4. Compare log `fit failures` vs prior ~42; listen for reduced mid-sentence cuts and fewer long dead air gaps inside narration blocks.
5. Rollback check: `REMIX_TTS_TIMING_MODE=strict` restores old pinning.

- [ ] **Step 3: Commit any test fixes only if needed**

```bash
git status
# commit only if Step 1 required small assertion fixes
```

---

## Execution notes

- @superpowers:test-driven-development — red/green per task.
- Do not edit the spec or this plan file while implementing unless a blocker requires a documented plan amendment.
- YAGNI: no UI toggle, no persisted retimed map, no video stretch.
