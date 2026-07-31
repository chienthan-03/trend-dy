# Qwen Timed Bilingual STT → VI TTS — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-31  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Fine Cue Timing](./2026-07-21-fine-cue-timing-design.md), [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md)  
**Related:** [Narration vs Source Audio Mix](./2026-07-20-remix-narration-source-mix-design.md) (roles retained for UI; MVP still TTS all cues)  
**Does not use:** Whisper / OpenAI `verbose_json` as the timing source for this path.

**Problem trigger:** Douyin movie-review remakes (e.g. *quán rượu* scene) get contiguous char-proportional cues from Qwen plain JSON. Vietnamese review TTS speaks continuously and never yields time for in-film English dialogue. Editors want real timestamps, bilingual capture (ZH review + EN dialogue), translate both to VI, and TTS both with the same voice.

---

## 1. Problem

Current live STT uses `qwen/qwen3-asr-flash` via OpenRouter with `REMIX_STT_LANGUAGE=zh` and `response_format=json`. That path returns **text without segment/word timestamps**. `buildSegmentsFromPlainText` then allocates time by character weight across the full video duration.

Observed on remake `cmrocikn6000gvsicqdw9uxhp`:

- 155 cues, **154/154** nearly contiguous (gap ≈ 0)
- Near-constant ~4.42 chars/sec — proportional split fingerprint
- 0 Latin/English source segments
- Example windows abut: review line ends → next review starts with **no** film-dialogue bed

TTS (`REMIX_TTS_TIMING_MODE` default `sequential`) correctly chains those windows, so the dub never pauses for character speech. Render still fully replaces original audio with the VI dub.

Qwen **can** recognize English and **can** return timed sentences when using the timed DashScope / filetrans-style API (`begin_time` / `end_time`, optional words). The studio currently does not use that path.

---

## 2. Goals / non-goals

### Goals

- Obtain **real** `startSec` / `endSec` (and words when available) from **Qwen only** — no Whisper.
- Capture **Chinese reviewer narration** and **English in-film dialogue** into one ordered cue list.
- Translate **all** cues 1:1 to Vietnamese; **copy** timings from source.
- TTS **all** non-empty cues with the **same** voice; place clips on true cue windows so character lines fill the former “gaps.”
- Keep full-audio **replace** render (dub VI only) for MVP.
- Persist `timingWarning` when timed STT fails and proportional fallback is used.
- Existing remakes require **Transcribe lại → translate → Tạo audio VI**.

### Non-goals (MVP)

- Whisper / hybrid Qwen-text + Whisper-align.
- Keeping original English audio in gaps (silence-or-mix path deferred).
- Separate TTS voice for character vs reviewer.
- Speaker diarization / voice cloning.
- Restoring duck/mix render for `source` roles (roles may still be set for UI).
- Changing ZIP export subtitle format.

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| STT vendor | **Qwen only** (timed API path) |
| English capture | Yes — EN → translate VI → TTS |
| Gap audio | Filled by **character VI TTS** (not silence, not original EN) |
| TTS voice | **Same** voice for narration and character |
| Language hint | Default **auto** (do not force `zh`); dual-pass `zh` + `en` if auto under-captures EN |
| Roles | `narration` (CJK/review) vs `source` (EN/film) for UI/classify; **TTS speaks both** |
| Render | Full dub **replace** (no original mix in MVP) |
| Fallback | Plain-text proportional + `timingWarning` if timed API fails |
| Old remakes | Full re-STT → re-translate → re-TTS |

---

## 4. Architecture / data flow

```text
Source audio
  → Qwen timed STT (auto, or zh+en dual-pass merge)
       sentences: begin_time/end_time → startSec/endSec
       optional words → RemixTranscriptWord[]
  → normalizeCueTiming (sentence islands, ~15s cap; preserve real gaps)
  → sourceTranscript { segments, words?, language mixed ok }
  → translate 1:1 (copy timings; ZH+EN → VI)
  → sourceTranscriptTranslated
  → remix_tts: synthesize every cue, same voice, fit to windows
  → assembleDubTimeline → render replace
```

**Source of truth for timeline:** `ViralRemake.sourceTranscript.segments` after timed normalize.  
Translated transcript must not invent timings.

---

## 5. STT — Qwen timed path

### 5.1 Transport

- Prefer Qwen API that returns timed sentences (`begin_time` / `end_time` in ms, optional `words` when `enable_words`).
- Likely DashScope async filetrans / OpenAI-compatible endpoint that exposes those fields — **not** the current OpenRouter plain-`json` transcription that only returns `text`.
- Config (names illustrative; finalize in plan):
  - `REMIX_STT_MODEL` stays Qwen flash family unless timed endpoint requires a sibling model id.
  - `REMIX_STT_TIMED=true` (or auto-detect when credentials for timed API exist).
  - Clear `REMIX_STT_LANGUAGE` for auto; optional dual-pass flags.

### 5.2 Mapping

- `begin_time_ms / 1000` → `startSec`, `end_time_ms / 1000` → `endSec`.
- Map word arrays into `RemixTranscriptWord` when present.
- Feed `normalizeCueTiming` as today (prefer real segments; rebuild from words when mega/unpunctuated).
- Set `timingDegraded` / `timingCoarse` / remake `timingWarning` when:
  - Timed API unavailable or errors → fall back to plain text + proportional split.
  - Coarse heuristics still fire after normalize (median cue > 15s, etc.).

### 5.3 Bilingual strategy

1. **Primary:** one auto-language timed call (no `language=zh`).
2. **Fallback if EN under-captured:** second timed pass with `language=en`, merge with zh/auto cues by timeline:
   - Sort by `startSec`.
   - Drop near-duplicate overlaps (same window, highly similar text / IoU threshold — exact constants in plan).
   - Tag `role`: CJK-heavy → `narration`; Latin/EN → `source` (or LLM classify later; heuristic OK for MVP).
3. Chunking: respect Qwen sync/async duration limits (existing 300s chunk for flash); re-offset timestamps per chunk as today.

### 5.4 What we deliberately avoid

- Calling Whisper solely for timestamps.
- Silence-detect as the primary film-bed detector (film dialogue is loud).

---

## 6. Translate & TTS & render

### Translate

- Keep 1:1 segment count; copy `startSec` / `endSec` from source after provider returns.
- Translate English dialogue segments to Vietnamese like any other cue.
- Preserve `role` / `roleSource` when present.

### TTS

- Synthesize **all** cues with non-empty text (including `source`).
- Same `ttsVoiceId` / Piper model for every cue.
- Timing modes unchanged (`sequential` / `hybrid` / `strict`); real gaps + interleaved character cues produce the pause/resume rhythm editors want.
- No reintroduction of in-TTS silence/word-align helpers.

### Render

- Keep current full replace (`renderAudioOnly` / `renderBannerAudio` + optional BGM).
- Do **not** restore duck/mix against original for MVP (character audio is already in the VI dub).

---

## 7. Error handling & observability

| Failure | Behavior |
|---|---|
| Timed Qwen API error / timeout | Log; fall back to current plain STT; set `timingWarning` |
| Auto pass returns ZH only | Optional EN second pass; if EN pass fails, proceed ZH-only + mild warning |
| Merge produces overlaps | Prefer higher-confidence / EN-tagged cue in film beds; never leave two TTS clips stacked without resolve |
| Translate count mismatch | Existing hard error |
| TTS / render | Unchanged |

Gateway/OpenRouter-style call logs should record: timed vs plain path, language mode, segment count, whether dual-pass ran, `timingDegraded` / `timingCoarse`.

---

## 8. Testing

- **Unit:** Qwen timed payload → `RemixTranscriptV1` mapping (ms → sec, words).
- **Unit:** Dual-pass merge (ordered, overlap drop, role heuristic).
- **Unit:** Proportional fallback still sets degraded/coarse flags.
- **Unit:** Translate copies timings for mixed ZH/EN source texts.
- **Processor / integration (fake timed fixture):** cue gaps preserved through TTS assemble (silence bed between review cues filled by character cue audio, not collapsed).
- **Manual smoke:** re-STT the *quán rượu* remake — expect non-uniform CPS, EN→VI character line between review lines, listen sync vs picture.

---

## 9. Migration / rollout

1. Implement timed Qwen client + mapper behind config; keep plain path as fallback.
2. Default language to auto in `.env.example`; document removing forced `zh` for bilingual clips.
3. Ship; operators **Transcribe lại** on affected remakes.
4. Follow-ups (out of MVP): original-audio mix in gaps; distinct character voice; DashScope-only vs OpenRouter feature parity matrix.

---

## 10. Success criteria

1. Timed path remakes do **not** show near-constant chars/sec across all cues.  
2. At least some English film lines appear as cues (as VI after translate) on bilingual review clips.  
3. Listening check: review → character VI → review continues without talking over the character window.  
4. Same TTS voice throughout.  
5. If timed API is down, studio still completes STT with explicit `timingWarning` (no silent wrong rhythm without signal).
`)