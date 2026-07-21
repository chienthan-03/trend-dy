# Fine Cue Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize Whisper mega-cues into sentence-level timed segments at STT so Studio and TTS share one second-accurate timeline (no in-TTS split/silence/word-align).

**Architecture:** After Whisper `segments` + `words`, run pure `normalizeCueTiming`. Persist fine `sourceTranscript` (+ optional `timingWarning`). Translate copies timings 1:1 and hard-fails on count mismatch. TTS synthesizes every cue in its window. Render ducks **all** cue intervals (ignore roles) for TTS dubs.

**Tech Stack:** NestJS, Prisma, BullMQ, Vitest, Whisper via OpenRouter, existing remix TTS/render path, Next.js Remake Studio

**Spec:** [docs/superpowers/specs/2026-07-21-fine-cue-timing-design.md](../specs/2026-07-21-fine-cue-timing-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/src/modules/remix/tts/normalize-cue-timing.ts` | Pure normalize + coarse detector |
| `apps/api/src/modules/remix/tts/normalize-cue-timing.spec.ts` | Unit tests for normalize / coarse |
| `apps/api/src/ai/stt.ts` | Request words; call normalize; expose degraded flag |
| `apps/api/src/ai/stt.spec.ts` | Mega+words → many cues |
| `apps/api/src/ai/translate.ts` | Assert/ensure timing copy; hard-fail count mismatch if not already |
| `apps/api/src/modules/remix/tts/segment-role.ts` | Add `mergeAllCueIntervals` (ignore role) for MVP duck |
| `apps/api/src/workers/processors/remix.processor.ts` | STT persist warning + invalidate dub; TTS trust cues; render duck-all |
| `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` | TTS no split/align; clip count = cues |
| `prisma/schema.prisma` + migration | `timingWarning String?` |
| `apps/api/src/modules/remix/remix.service.ts` | Return `timingWarning` on remake DTO path if mapped |
| `apps/web/src/lib/api-client.ts` | `timingWarning` on `ViralRemake` |
| `apps/web/src/components/remix/remake-transcript-panel.tsx` | Show timing warning + re-STT CTA |
| `docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md` | Migration: re-STT → translate → TTS |

**Constants (lock in `normalize-cue-timing.ts`):**

```ts
export const CUE_MAX_DURATION_SEC = 15;
export const CUE_MIN_SPEECH_SEC = 0.25;
export const CUE_WORD_GAP_SEC = 0.8;
export const CUE_MAX_WORD_DURATION_SEC = 1.0;
export const CUE_SOFT_WRAP_CHARS = 48;
export const CUE_COARSE_MEDIAN_SEC = 15;
export const CUE_COARSE_FRACTION = 0.2;
```

---

### Task 1: `normalizeCueTiming` (TDD)

**Files:**
- Create: `apps/api/src/modules/remix/tts/normalize-cue-timing.ts`
- Create: `apps/api/src/modules/remix/tts/normalize-cue-timing.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  detectCoarseTiming,
  normalizeCueTiming,
} from "./normalize-cue-timing";

describe("normalizeCueTiming", () => {
  it("keeps short punctuated Whisper segments", () => {
    const { segments, degraded } = normalizeCueTiming({
      segments: [
        { startSec: 0, endSec: 4, text: "第一句。" },
        { startSec: 4, endSec: 8, text: "第二句！" },
      ],
      words: [],
      durationSec: 8,
    });
    expect(degraded).toBe(false);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ startSec: 0, endSec: 4, text: "第一句。" });
  });

  it("rebuilds mega unpunctuated segment from words and preserves film gaps", () => {
    const { segments } = normalizeCueTiming({
      segments: [
        {
          startSec: 0,
          endSec: 40,
          text: "打听通缉犯在酒馆哪个地方路人见他眼神犀利也不敢打胡乱说向对方表示感谢后",
        },
      ],
      words: [
        { startSec: 7.2, endSec: 7.4, text: "顺" },
        { startSec: 9.38, endSec: 9.56, text: "地方" },
        { startSec: 10.26, endSec: 16.4, text: "路" }, // elongated — drop
        { startSec: 16.4, endSec: 18.68, text: "人" }, // elongated — drop
        { startSec: 18.68, endSec: 18.82, text: "见" },
        { startSec: 18.82, endSec: 18.98, text: "他" },
        { startSec: 21.54, endSec: 21.76, text: "说" },
        { startSec: 32.24, endSec: 32.36, text: "向" },
        { startSec: 33.0, endSec: 33.1, text: "谢" },
      ],
      durationSec: 40,
    });
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.some((s) => s.endSec <= 9.6)).toBe(true);
    expect(segments.some((s) => s.startSec >= 18.5)).toBe(true);
    expect(segments.every((s) => s.endSec - s.startSec <= 15.01)).toBe(true);
  });

  it("degrades to plain-text split when words missing on mega cue", () => {
    const { segments, degraded } = normalizeCueTiming({
      segments: [
        {
          startSec: 0,
          endSec: 60,
          text: "这是一段没有标点的很长中文内容用于测试降级路径需要足够长",
        },
      ],
      words: [],
      durationSec: 60,
    });
    expect(degraded).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
  });
});

describe("detectCoarseTiming", () => {
  it("flags median > 15s", () => {
    expect(
      detectCoarseTiming({
        segments: [
          { startSec: 0, endSec: 20, text: "a" },
          { startSec: 20, endSec: 40, text: "b" },
        ],
        durationSec: 40,
        degraded: false,
      }),
    ).toBe(true);
  });

  it("flags any cue > 20% of duration", () => {
    expect(
      detectCoarseTiming({
        segments: [
          { startSec: 0, endSec: 1, text: "a" },
          { startSec: 1, endSec: 50, text: "b".repeat(10) },
        ],
        durationSec: 100,
        degraded: false,
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/api && npx vitest run src/modules/remix/tts/normalize-cue-timing.spec.ts
```

Expected: module not found / FAIL

- [ ] **Step 3: Implement `normalizeCueTiming` + `detectCoarseTiming`**

Export:

```ts
export type CueSegment = { startSec: number; endSec: number; text: string };
export type CueWord = { startSec: number; endSec: number; text: string };

export const normalizeCueTiming = (input: {
  segments: CueSegment[];
  words: CueWord[];
  durationSec: number;
}): { segments: CueSegment[]; degraded: boolean };

export const detectCoarseTiming = (input: {
  segments: CueSegment[];
  durationSec: number;
  degraded: boolean;
}): boolean;
```

Follow spec §5 algorithm. For degraded path, **do not** import `buildSegmentsFromPlainText` from `stt.ts` (circular risk). Either:

- duplicate a thin call by extracting `buildSegmentsFromPlainText` + `splitPlainTextPhrases` into `apps/api/src/ai/plain-text-segments.ts` (preferred, tiny move), then import from both `stt.ts` and normalize; or  
- inline a minimal proportional splitter inside normalize for degraded-only.

If normalize would return **0 segments** but input had non-empty text, throw:

```ts
throw new Error("normalizeCueTiming produced 0 cues from non-empty transcript");
```

(caller maps this to STT job failure — Task 2/3).

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/api && npx vitest run src/modules/remix/tts/normalize-cue-timing.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/tts/normalize-cue-timing.ts apps/api/src/modules/remix/tts/normalize-cue-timing.spec.ts
git commit -m "feat(remix): add normalizeCueTiming for fine STT cues"
```

---

### Task 2: Wire normalize into STT mapping

**Files:**
- Modify: `apps/api/src/ai/stt.ts`
- Modify: `apps/api/src/ai/stt.spec.ts`

- [ ] **Step 1: Failing test — mega + words becomes many cues**

In `stt.spec.ts`, add case: `mapWhisperResponseToTranscript` with one 120s unpunctuated segment + word list with a mid gap → `transcript.segments.length > 1` and no cue spans the gap interior.

- [ ] **Step 2: Run — expect FAIL** (current plain-text resplit or single mega remains wrong)

- [ ] **Step 3: Implement**

1. Keep requesting `timestamp_granularities[]=word` + `segment` (already present).  
2. After mapping raw segments/words, call `normalizeCueTiming`.  
3. Replace today’s mega `buildSegmentsFromPlainText` flatMap path with normalize (words-first).  
4. Return transcript; extend `TranscribeAudioResult`:

```ts
export type TranscribeAudioResult = {
  transcript: RemixTranscriptV1;
  costUsd: number;
  timingDegraded?: boolean;
  timingCoarse?: boolean;
};
```

5. **Empty-cue guard:** if normalize throws or returns 0 cues with non-empty text, `transcribeAudio` / `mapWhisper…` must throw so `handleStt` fails the job (spec §9).

6. **Chunked STT (`transcribeChunkedMp3`):** after `mergeTranscripts`, re-run `normalizeCueTiming` on the **merged** segments+words (or OR per-chunk `timingDegraded` flags, then `detectCoarseTiming` on final segments). Set:

```ts
timingDegraded = chunkFlags.some(Boolean) || mergedNormalize.degraded
timingCoarse = detectCoarseTiming({ segments: final.segments, durationSec: final.durationSec, degraded: timingDegraded })
```

Long remakes (~15 min) always hit this path — flags must not be lost.

7. When `verbose_json` falls back to plain `json` (no words), set `timingDegraded: true`.

- [ ] **Step 4: Run `stt.spec.ts` + normalize specs — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/stt.ts apps/api/src/ai/stt.spec.ts
git commit -m "feat(remix): normalize Whisper cues at STT map time"
```

---

### Task 3: Persist `timingWarning` + invalidate STT invalidation

**Files:**
- Modify: `prisma/schema.prisma`
- Create migration: `prisma/migrations/..._add_timing_warning/`
- Modify: `apps/api/src/workers/processors/remix.processor.ts` (`handleStt`)
- Modify: remake select/DTO paths that expose remake to web (`remix.service.ts` / serializers if any)

- [ ] **Step 1: Add Prisma field**

```prisma
timingWarning String? @map("timing_warning")
```

Run: `pnpm exec prisma migrate dev --name add_timing_warning` (from repo root / prisma cwd as project usual).

- [ ] **Step 2: Update `handleStt`**

After `transcribeAudio` (let thrown normalize/empty-cue errors fail the job):

```ts
const timingWarning =
  result.timingDegraded || result.timingCoarse
    ? "Timeline cue còn thô hoặc ước lượng — nên Transcribe lại / kiểm tra sync."
    : null;

await this.prisma.viralRemake.update({
  where: { id: remakeId },
  data: {
    sourceTranscript: transcript as Prisma.InputJsonValue,
    sourceTranscriptTranslated: null,
    timingWarning,
    videoDurationSec: transcript.durationSec,
    sttCostUsd,
    pipelinePhase: ...,
    // IMPORTANT: same as retranscribe API — do not leave stale dub on new cues
    ...invalidateDubAndRenderData,
  },
});
```

**Export** `invalidateDubAndRenderData` from `remix.service.ts` (or a tiny `remix-invalidation.ts`) and import in the processor — do not duplicate field lists.

- [ ] **Step 3: Spec — handleStt clears dub when STT completes** (extend full-script or service spec)

- [ ] **Step 4: Commit**

```bash
git add prisma apps/api/src/workers/processors/remix.processor.ts apps/api/src/modules/remix/remix.service.ts
git commit -m "feat(remix): persist timingWarning and invalidate dub on STT"
```

---

### Task 4: Translate timing copy + hard-fail count mismatch

**Files:**
- Modify: `apps/api/src/ai/translate.ts` (+ existing specs)
- Modify: `apps/api/src/workers/processors/remix.processor.ts` `handleTranslate` if needed

- [ ] **Step 1: Audit** — confirm LLM/google paths already set `startSec`/`endSec` from source. Add assertion test: output timings equal source timings for each index.

- [ ] **Step 2: Hard-fail** — if any path can return fewer/more segments than source, throw before persist. In `handleTranslate`, after `translateTranscript`:

```ts
if (translated.segments.length !== sourceTranscript.segments.length) {
  throw new Error(
    `Translate segment count mismatch: source=${sourceTranscript.segments.length} translated=${translated.segments.length}`,
  );
}
for (let i = 0; i < sourceTranscript.segments.length; i++) {
  const s = sourceTranscript.segments[i]!;
  const t = translated.segments[i]!;
  if (t.startSec !== s.startSec || t.endSec !== s.endSec) {
    // repair by copy (preferred) OR throw — prefer copy-forward to be resilient:
    t.startSec = s.startSec;
    t.endSec = s.endSec;
  }
}
```

Spec says hard-fail on **count** mismatch; timing drift → **copy from source** (do not invent). Document that in code comment.

- [ ] **Step 3: Tests + commit**

```bash
git commit -m "fix(remix): enforce translate 1:1 timing and count"
```

---

### Task 5: TTS trusts cues only (remove align/split; speak all)

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts` `handleTts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 1: Failing processor test**

- Fine translated segments (3 short cues) → synth called 3 times.  
- Mock `detectSpeechRegions` / `transcribeWordsInWindow` / assert **not** called.  
- Segment with `role: "source"` still synthesized (MVP B).

- [ ] **Step 2: Simplify `handleTts` loop**

```ts
for (const segment of translated.segments) {
  // MVP: do not skip source roles
  const targetDurationSec = Math.max(segment.endSec - segment.startSec, 0.1);
  // synthesize + fit + shorten as today — NO splitSegmentsForTts / align
  timelineSegments.push({ startSec: segment.startSec, endSec: segment.endSec, fittedMp3Buffer });
}
```

Remove lazy speech-align block (`loadSourceAudio`, `detectSpeechRegions`, `transcribeWordsInWindow`, `splitNarrationForTts`). Keep optional lazy classify only if still desired for UI badges — **must not** gate TTS skip.

Update/remove obsolete specs that expected sentence-split or source skip for TTS count (replace with “TTS all cues” expectations). Role UI can remain; smoke note that MVP TTS ignores role for speakability.

- [ ] **Step 3: Run full-script processor specs — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): TTS uses fine cue windows only, speak all segments"
```

---

### Task 6: Render ducks all cue intervals (ignore roles)

**Files:**
- Modify: `apps/api/src/modules/remix/tts/segment-role.ts` (+ spec)
- Modify: `apps/api/src/workers/processors/remix.processor.ts` `handleRender`
- Modify: any render specs that assumed source windows unducked

- [ ] **Step 1: Add helper + failing test**

```ts
it("mergeAllCueIntervals includes source-role cues", () => {
  expect(
    mergeAllCueIntervals([
      { startSec: 0, endSec: 2, role: "narration" },
      { startSec: 2, endSec: 5, role: "source" },
    ]),
  ).toEqual([{ startSec: 0, endSec: 5 }]);
});
```

```ts
export const mergeAllCueIntervals = (
  segments: Array<{ startSec: number; endSec: number }>,
): Array<{ startSec: number; endSec: number }> => {
  // same merge as mergeNarrationIntervals but NO role filter
};
```

- [ ] **Step 2: In `handleRender` when `dubSource === "tts"`**

```ts
const duckIntervals = mergeAllCueIntervals(translated?.segments ?? []);
// pass duckIntervals into renderAudioMix / renderBannerAudioMix
```

Leave `mergeNarrationIntervals` in codebase for follow-up role restore.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(remix): duck all TTS cue windows ignoring roles"
```

---

### Task 7: Studio timing warning + smoke docs

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/remix/remake-transcript-panel.tsx`
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx` (pass prop / retranscribe CTA)
- Modify: `docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md` (or new fine-cue smoke section)

- [ ] **Step 1: API client type** `timingWarning?: string | null`

- [ ] **Step 2: UI** — banner under transcript when `timingWarning` set; button “Transcribe lại” calling existing `api.remix.retranscribe` (wire like `classifyWarning` / retranslate handlers on the remake page — retranscribe may not be wired in UI yet).

- [ ] **Step 3: Smoke checklist bullets**

1. Remake cũ: Transcribe lại → Translate → Tạo audio VI → nghe pause *quán rượu*.  
2. Studio shows many short cues with distinct start/end.  
3. TTS clip count ≈ cue count (no 66 sentences packed into 1 mega window).  

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): show timingWarning and document fine-cue migration"
```

---

### Task 8: Cleanup / YAGNI gate

**Files:** optional

- [ ] **Step 1:** Leave `detect-speech-regions.ts` / `align-sentences-to-speech.ts` / `words-to-speech-regions.ts` in tree **unused** by TTS, **or** delete if nothing imports them after Task 5. Prefer delete dead TTS-only path to avoid drift; keep `wordsToSpeechRegions` logic only if duplicated into normalize — otherwise normalize has its own word clustering.

- [ ] **Step 2:** Run targeted suites:

```bash
cd apps/api && npx vitest run src/modules/remix/tts/normalize-cue-timing.spec.ts src/ai/stt.spec.ts src/workers/processors/remix.processor.full-script.spec.ts src/modules/remix/tts/segment-role.spec.ts
```

- [ ] **Step 3: Final commit** if cleanup landed

```bash
git commit -m "chore(remix): remove unused in-TTS pause alignment helpers"
```

---

## Manual verification

1. Restart API + worker after migrate.  
2. On `cmrocikn6000gvsicqdw9uxhp` (or new remake): **Transcribe lại** → wait STT+translate → **Tạo audio VI**.  
3. Transcript panel: dozens of short lines; times advance across film beds.  
4. Listen first ~30s: pause after quán rượu line before tiếp tục.  
5. Render `audio_only` smoke for sync.

---

## Out of scope (do not implement in this plan)

- Re-enable role-based TTS skip + selective duck  
- SRT download export  
- Cue drag editor  
- Env knobs `REMIX_CUE_*`
