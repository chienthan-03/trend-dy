# Fine Cue Timing (SRT-style STT → TTS) — Design

**Status:** Draft (pending implementation planning)  
**Date:** 2026-07-21  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md), [Remix Narration vs Source Audio Mix](./2026-07-20-remix-narration-source-mix-design.md)  
**Supersedes (partial):** Narration-pause alignment MVP that places VI sentences via ffmpeg `silencedetect` / in-TTS Whisper word-gap heuristics inside mega-cues. Those heuristics are **removed from the TTS path** once fine cues exist.  
**Related product intent:** Match prior project behavior — each spoken line has real `start`/`end` on the timeline (second-accurate), Studio and TTS share that timeline.

**Problem trigger:** Remakes (e.g. ~15 min Douyin review) often receive **4 Whisper mega-cues**. VI sentence-split + proportional / silence / word-align at TTS time cannot recover true per-line positions (e.g. *quán rượu* → film bed → *Người đi đường*).

---

## 1. Problem

Editors need Vietnamese dub that sits on the **same second-level timeline** as the source narration — like an SRT:

```json
{ "start": "00:00:01,000", "end": "00:00:05,000", "text": "…" }
```

Today:

1. STT may return one cue spanning minutes of mixed narration + film audio.  
2. Translate keeps that mega window.  
3. TTS splits VI sentences and **re-estimates** timing (char weight, silence detect, or ad-hoc word-align).  

Result: Studio and voice are not a single source of truth; rhythm drifts vs picture.

Silence-based alignment fails because **film dialogue is loud speech**, not silence. Word-gap at TTS time can approximate pauses but still does not give editors editable per-line cues.

---

## 2. Goals / non-goals

### Goals

- After STT, persist **fine cues**: roughly one spoken sentence per segment, with real `startSec` / `endSec`.  
- Studio transcript and TTS use the **same** cue list and timings (success criterion **C** from brainstorm).  
- Timing source: **hybrid** — prefer Whisper segments when already fine; if mega / unpunctuated, rebuild from word timestamps.  
- Cue shape: **by spoken sentence**, with a hard **~15s** cap.  
- Translate **1:1** with source segments; **copy** timing; only replace text.  
- TTS synthesizes and fits **inside each cue window only** — no sentence-split, no silence/word-align on the TTS path.  
- Existing remakes require **STT → translate → TTS** again to get fine cues.  
- Surface a coarse-timing warning when transcript still looks mega.

### Non-goals (this MVP)

- Speaker diarization / perfect film-vs-narrator separation.  
- Re-enabling narration vs `source` role skip as a **blocker** for this MVP (roles may remain in schema/UI but TTS treats all cues as speakable — brainstorm **B**).  
- Hearing original film audio inside gaps as a product guarantee (duck/mix policy unchanged except role skip relaxation).  
- Changing TTS vendor pricing (Gemini/Grok) beyond existing config.  
- ZIP subtitle format redesign (optional follow-up: export fine cues as SRT).

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Success | Studio + TTS share fine cues with real start/end |
| Timing pipeline | Normalize at **STT** (not only at TTS) |
| Whisper segments | Keep if `duration ≤ 15s` and usable sentence structure |
| Mega / no punctuation | Rebuild from `words` (gap + sentence + length soft-wrap) |
| Cue unit | Spoken sentence; cap **15s** |
| Word elongated tokens | Drop tokens longer than ~1.0s (film bed bleed) before clustering |
| Inter-word gap to split islands | ~0.8s |
| Min speech island | ~0.25s (merge/drop tinies) |
| Soft wrap (no punct) | ~40–48 chars, timings from words — **not** char-proportional over the full mega window |
| No words available | Fallback plain-text proportional split + `timingWarning`; prefer always requesting words in live STT |
| Translate | 1:1 count; copy `startSec`/`endSec` |
| TTS | Trust cue windows; **disable** `splitSegmentsForTts`, `detectSpeechRegions`, in-TTS `transcribeWordsInWindow` align |
| Roles (MVP) | Do **not** skip TTS for `source`; treat all cues as TTS (classify optional / non-blocking) |
| Existing remakes | Full **re-STT → re-translate → re-TTS** |
| Coarse warning | e.g. median cue > 15s or one cue > 20% of duration |

---

## 4. Architecture / data flow

```text
Source audio
  → Whisper verbose_json (segments + words)
  → normalizeCueTiming(segments, words, duration)
  → sourceTranscript { segments fine, words? }
  → translate 1:1 (copy timings)
  → sourceTranscriptTranslated
  → remix_tts: per cue synthesize + fit in [start, end]
  → assemble dub → render
```

**Source of truth for timeline:** `ViralRemake.sourceTranscript.segments` after normalize.  
Translated transcript must not invent new timings.

Optional persisted fields (additive, non-breaking):

- `RemixTranscriptV1.words` — already optional; keep when Whisper returns them.  
- Remake-level `timingWarning: string | null` (or reuse a generic warning field if one exists) when fallback proportional timing was used or cues remain coarse.

---

## 5. `normalizeCueTiming`

### 5.1 Keep Whisper segment as-is when

- `endSec - startSec ≤ 15`, **and**  
- Text has sentence boundaries (`。！？.!?’` / newlines) **or** is not a long unpunctuated CJK run spanning the whole window.

### 5.2 Rebuild from words when

- Segment duration > 15s, **or**  
- Unpunctuated mega text (typical Chinese Whisper dump), **or**  
- Single segment covers a large fraction of the file (existing mega-segment heuristics).

Algorithm sketch:

1. Collect words overlapping the window (or all words for a full-file mega).  
2. Drop words with duration `> maxWordDurationSec` (~1.0).  
3. Split islands on gaps `≥ minGapSec` (~0.8).  
4. Within an island: split on punctuation if present; else soft-wrap by char budget with **word-derived** start/end.  
5. Cap any cue still `> 15s` by cutting at the nearest word boundary near the midpoint.  
6. Merge/drop cues shorter than ~0.25s.

### 5.3 No words

- Call existing `buildSegmentsFromPlainText` (or equivalent) as **degraded** mode.  
- Set `timingWarning` so editors know sync is estimated.  
- Live STT **must** request `timestamp_granularities[]=word` (and segment) to minimize this path.

### 5.4 Placement in code

- New pure module under `apps/api/src/ai/` or `apps/api/src/modules/remix/tts/` (e.g. `normalize-cue-timing.ts`) with unit tests.  
- Invoke from `mapWhisperResponseToTranscript` **after** raw segment/word mapping (replace or narrow today’s `shouldResplitMegaSegment` / flatMap plain-text resplit so mega paths prefer words).

---

## 6. Translate

- Input/output segment counts must match.  
- Each output segment: translated `text`; `startSec`/`endSec` copied from source.  
- On count mismatch: fail or warn without inventing timings (same spirit as classify count checks).  
- Roles: MVP may leave `role` unset or force narration semantics at TTS; do not block translate on classify.

---

## 7. TTS (`handleTts`)

Ordered steps after this change:

1. Require `sourceTranscriptTranslated`.  
2. Upload-dub short-circuit unchanged.  
3. **Do not** require classify for speakability; synthesize **all** cues (MVP B).  
4. For each segment: `targetDurationSec = end - start`; synthesize → fit → optional one shorten pass → push clip at absolute `startSec`.  
5. Assemble dub; set `tts_ready`.

**Removed from this path (when fine-cue pipeline is active):**

- `splitSegmentsForTts` / `splitNarrationForTts`  
- `detectSpeechRegions` (silencedetect)  
- `transcribeWordsInWindow` + `wordsToSpeechRegions` for alignment  

Word timestamps remain relevant **only** at STT normalize time.

---

## 8. Migration / UX

- Document in smoke checklist: remakes created before this change need **Transcribe lại → Translate → Tạo audio VI**.  
- Studio: if coarse detector fires, show warning + CTA to re-transcribe.  
- Invalidation: successful re-STT clears translated transcript / dub / render as today’s re-STT policy already requires (confirm in plan; do not leave stale mega VI attached to new ZH cues).

---

## 9. Error handling

| Case | Behavior |
|---|---|
| Whisper omits words | Degraded proportional cues + `timingWarning` |
| Normalize yields 0 cues but text exists | Fail STT job with clear error |
| Translate count ≠ source count | Reject / warn; do not TTS with mismatched timings |
| Cue window too short for TTS audio | Existing fit/shorten/`ttsFitFailedIndexes` |
| Provider rejects `word` granularity | Fall back to segment-only + warning (same as degraded) |

---

## 10. Testing

- **Unit — normalize:** fixture words around film bed (e.g. 地方 → gap → 路人); elongated tokens dropped; islands preserve gap; sentence/cap rules.  
- **Unit — normalize:** short punctuated Whisper segments pass through unchanged.  
- **Unit — mapWhisper:** mega segment with words → many cues; timings not char-proportional across full mega span.  
- **Processor — TTS:** with fine translated segments, assert split/align helpers are **not** invoked; clip count equals narration cue count.  
- **Translate:** timing copy 1:1.  
- **Manual:** remake ~15 min — re-STT → translate → TTS; listen *quán rượu* pause vs picture; Studio shows many short lines with matching times.

---

## 11. Relationship to prior specs

| Prior | Effect |
|---|---|
| Narration/source mix (2026-07-20) | Schema/UI for roles may remain; **this MVP does not rely on role skip** for film beds. Film beds become **gaps between fine cues** (no VI speech). Re-enable role-based original keep as a **follow-up** once cues are trustworthy. |
| Silence/word-align pause plan | Superseded for TTS; word clustering moves upstream into STT normalize. |

---

## 12. Open follow-ups (out of scope)

1. Re-enable `source` role skip + duck mix on fine cues (true “keep film VO”).  
2. Export fine cues as downloadable SRT/VTT.  
3. Editor drag-adjust cue boundaries in Studio.  
4. Tunable env knobs for gap/cap/max-word (`REMIX_CUE_*`).

---

## 13. Implementation sketch (for planning)

| Area | Change |
|---|---|
| `normalize-cue-timing.ts` (+ spec) | Pure normalize |
| `stt.ts` | Always request words when verbose; call normalize; set warning |
| Translate path | Enforce timing copy / count |
| `remix.processor.ts` `handleTts` | Remove fine-window align/split branch |
| Remake model / API | Optional `timingWarning` |
| Studio | Coarse warning + re-STT CTA |
| Docs / smoke checklist | Migration steps |

---

**Brainstorm lock-in:** Approach = normalize at STT (option 1). Success = C. Timing = hybrid C. Cue = sentence + 15s cap. Migration = full re-pipeline. TTS = trust cues only. Roles = TTS all cues for this MVP.
