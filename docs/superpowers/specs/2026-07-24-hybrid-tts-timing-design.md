# Hybrid TTS Timing — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-24  
**Audience:** Engineering — Remake Studio remix TTS pipeline  
**Depends on:** Full VI TTS soundtrack replace (`REMIX_TTS_AUDIO_MODE`), segment fit + `assembleDubTimeline`  
**Related:** Narration/source role classification; Piper smart-batch; fit failures on ZH cue windows

---

## 1. Problem

Full soundtrack replace removed ZH↔VI audio switching, but clips are still **pinned to Chinese STT windows** (`startSec`/`endSec`). Vietnamese speech length rarely matches those windows:

| VI vs ZH window | Current behavior | User hears |
|---|---|---|
| Longer (beyond max speed) | Speed + hard truncate | Stutter / cut-off (“vấp”) |
| Shorter | Pad silence to fill window | Gaps (“ngắt”) |

Evidence: remake runs still report dozens of `ttsFitFailedIndexes` after replace mode (e.g. 42/113 cues).

Editors want **continuous Vietnamese narration** that finishes sentences, while keeping **important moments** synced to picture (in-film dialogue / scene resets).

---

## 2. Goals / non-goals

### Goals

- **Hybrid timing:** within a narration block, play each cue to completion and **defer** the next cue’s `startSec` when needed; allow short cues to end early (silence until the next ZH `startSec` — no early pull).
- **Lock points:** hard-sync **`source`** cues to ZH windows; reset narration at the **start of a new narration block** after a gap ≥ **1.0s**.
- When a deferred narration chain would collide with a lock: allow **500ms grace** past the lock start, then **max-speed then truncate** (same fit tools as today).
- Config: `REMIX_TTS_TIMING_MODE=hybrid|strict` (default **`hybrid`**), applied only when `REMIX_TTS_AUDIO_MODE=replace`. `mix` or `strict` keep per-cue ZH locking.
- Pure planner module (no I/O) + unit tests; wire into `handleTts` after real clip durations are known.

### Non-goals (MVP)

- LLM rewrite/shorten as the primary fix for hybrid narration (keep existing shorten retry for `strict` / locked cues only as today).
- Time-remapping / stretching video to match audio.
- Changing `handleRender` / `renderAudioOnly` beyond existing replace/mix modes.
- Guaranteeing zero fit failures at locks (narrow `source` windows can still fail).
- UI controls for timing mode (env flag is enough for MVP).

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Strategy | Hybrid: natural narration in block; lock at important points |
| Lock definition | Cue `role=source`, plus first narration cue after gap ≥ **1.0s**, plus first cue on timeline |
| Within-block short VI | Keep ZH `startSec`; silence until next cue (no early pull) |
| Within-block long VI | Finish sentence; **push** following narration `startSec` to `prevPlacedEnd` |
| Lock collision | Grace **500ms** past lock `startSec`, then max-speed → truncate |
| `source` timing | Hard lock to ZH window + existing fit (pad/speed/shorten) |
| Audio mode gate | Hybrid only if `REMIX_TTS_AUDIO_MODE=replace` |
| Timing mode flag | `REMIX_TTS_TIMING_MODE=hybrid\|strict`, default **`hybrid`** |
| Implementation | Dedicated `planHybridTimeline()` planner (Approach 1) |

---

## 4. Architecture

### 4.1 High level

```text
cues + roles
  → synthesize TTS (existing batch/per_cue / piper smart-batch)
  → measure real duration per cue (after batch split)
  → if timingMode=hybrid && audioMode=replace:
        planHybridTimeline(cues, durations, options)
     else:
        strict ZH windows (current behavior)
  → applyFitToTarget(buffer, plan, fitTargetSec)
  → assembleDubTimeline(retimed startSec/endSec)
  → putDub → render (unchanged replace/mix)
```

### 4.2 New module

`apps/api/src/modules/remix/tts/hybrid-timeline.ts` (+ `hybrid-timeline.spec.ts`)

- Pure functions; no ffmpeg / filesystem.
- Config helpers live in `remix-config.ts`: `getTtsTimingMode()`, gap/grace defaults overridable via env if useful (`REMIX_TTS_HYBRID_BLOCK_GAP_SEC`, `REMIX_TTS_HYBRID_LOCK_GRACE_SEC`) — optional; hardcoded defaults 1.0 / 0.5 acceptable for MVP if env omitted.

### 4.3 Integration point

`RemixProcessor.handleTts` — **after** synthesize + batch split yields per-cue `audioDurationSec`, **before** final `assembleDubTimeline`.

Do **not** apply ZH-window truncate to hybrid narration before the planner runs (otherwise “read full sentence” is impossible).

---

## 5. `planHybridTimeline` algorithm

### 5.1 Types (conceptual)

```ts
type HybridCueIn = {
  index: number;
  startSec: number; // ZH
  endSec: number;   // ZH
  role?: "narration" | "source";
  audioDurationSec: number;
};

type HybridCueOut = {
  index: number;
  startSec: number;     // placement on dub timeline
  endSec: number;       // startSec + fitted duration (post-plan intent)
  fitTargetSec: number; // duration budget for applyFitToTarget
  locked: boolean;
};

type HybridTimelineOptions = {
  blockGapSec: number;   // default 1.0
  lockGraceSec: number;  // default 0.5
  maxSpeed: number;      // from getMaxTtsSpeed()
};
```

### 5.2 Steps

1. Sort cues by ZH `startSec` (stable by `index`).
2. **Mark locks:**
   - any cue with effective role `source`;
   - any narration cue whose gap from previous cue’s ZH `endSec` is ≥ `blockGapSec`;
   - the first cue on the timeline.
3. Walk in order with `prevPlacedEnd = 0`:
   - **Locked (`source` or block-start narration):**
     - `startSec = ZH startSec`
     - `fitTargetSec = max(ZH endSec - ZH startSec, ε)`
     - `locked = true`
   - **Unlocked narration:**
     - `startSec = max(ZH startSec, prevPlacedEnd)`
     - `naturalEnd = startSec + audioDurationSec`
     - `nextLockStart` = ZH `startSec` of the next lock cue after this one (if any), else `+Infinity` / video end if provided
     - `maxEndSec = nextLockStart + lockGraceSec`
     - if `naturalEnd <= maxEndSec`: `fitTargetSec = audioDurationSec` (no pad); intended end = `naturalEnd`
     - else: `fitTargetSec = max(maxEndSec - startSec, ε)` (may require speed/shorten)
4. After determining fitted duration intent, set `prevPlacedEnd = startSec + min(audioDurationSec, fitTargetSec)` (planner may return both raw and target; processor applies real fit and can recompute end from buffer duration if needed — MVP: trust `fitTargetSec` + planSegmentFit).
5. **No early pull:** never set narration `startSec < ZH startSec`.

### 5.3 Fit application

Reuse `planSegmentFit` + `applyFitToTarget`:

- `source` / locked: target = ZH window (unchanged).
- unlocked narration under budget: action `ok` (do not pad to next cue).
- unlocked narration over `fitTargetSec`: speed up to `maxSpeed`, then truncate; record fit failure if shorten.

---

## 6. Config

| Env | Values | Default |
|---|---|---|
| `REMIX_TTS_TIMING_MODE` | `hybrid` \| `strict` | `hybrid` |
| `REMIX_TTS_AUDIO_MODE` | `replace` \| `mix` | `replace` (existing) |
| `REMIX_TTS_MAX_SPEED` | number | `1.25` (existing) |

Effective hybrid: `getTtsTimingMode() === "hybrid" && getTtsAudioMode() === "replace"`.

Document in `.env.example`.

---

## 7. Edge cases

| Case | Behavior |
|---|---|
| No `source`, no large gaps | One narration block; lock only first cue (+ end-of-video budget) |
| STT overlapping ZH windows | Order by ZH start/`index`; retimer ensures VI starts ≥ `prevPlacedEnd` |
| Piper smart-batch slices | Use **slice** `audioDurationSec`, not ZH window length |
| `per_cue` LLM shorten retry | Keep for `strict` and locked cues; hybrid unlocked narration prefers finish+defer over rewrite |
| Grace past lock into `source` | Narration may extend to `source.startSec + 0.5`; then speed/cut. `source` still starts at ZH `startSec` (possible brief overlap ≤ grace — acceptable by product choice) |
| `mix` mode | Hybrid off; narration-only TTS + duck as today |

---

## 8. Testing

- **`hybrid-timeline.spec.ts`:** short→silence (next keeps ZH start); long→push next; collide source → grace 500ms then constrained target; gap 1.0s creates new lock; `source` locked to ZH window.
- **`remix-config.spec.ts`:** default `hybrid`; `strict`; unknown → `hybrid`.
- **`remix.processor.full-script.spec.ts`:** hybrid path retimes a long narration before a `source` lock; `strict` keeps ZH starts.

---

## 9. Rollout

1. Ship planner + config default `hybrid` under replace.
2. Restart worker; re-run TTS + render on a known remake; compare fit-fail count and subjective “vấp/ngắt”.
3. If regressions: set `REMIX_TTS_TIMING_MODE=strict` without code revert.

---

## 10. Open questions (deferred)

- Persist retimed cue map on remake for UI preview — out of MVP.
- UI toggle for timing mode — out of MVP.
- Tunable grace/gap via env — optional nicety, not required to start.
