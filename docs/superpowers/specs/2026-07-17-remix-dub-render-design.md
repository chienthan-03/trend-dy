# Remix Dub + Letterbox Render — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-17  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Viral Feed & Remix Factory](./2026-07-14-viral-feed-remix-factory.md) (full-script STT + translate already in tree)  
**Supersedes (partial):** Phase B “burn-in SRT + overlay banner” framing in the 2026-07-14 spec — this design **does not** burn full-script SRT; it focuses on **VI dub audio** and optional **letterbox banners**.

---

## 1. Problem

Editors can already: paste Douyin link → download → STT → translate VI → packaging (titles / description / hashtags).

They still cannot produce a **preview/export MP4** with:

1. Vietnamese audio that follows the **original video rhythm**, or  
2. The same dub **plus** header/bottom sensational lines in **added letterbox bars** (not overlay covering the picture).

Full remake (text-card slideshow / stock b-roll) was considered and **rejected**: harder to go viral and harder for editors to control.

---

## 2. Goals / non-goals

### Goals

- Two explicit render modes on a remake:
  - `audio_only` — original picture, replace audio with VI dub  
  - `banner_audio` — letterbox header/bottom + VI dub  
- Default dub from **TTS**, with **upload override**  
- TTS **segment-synced** to original STT timings  
- Banner copy: **LLM seed + editor editable**  
- Server-side render via **FFmpeg worker** (BullMQ), preview + download in Remake Studio  
- Keep existing ZIP package export; add MP4 download when render exists  
- Preserve approve / `usagePolicy` gate before export download  

### Non-goals (MVP)

- Template/text-card remake, stock b-roll assembly  
- Word-level / lip-sync  
- Voice cloning  
- Auto-publish to TikTok/YouTube  
- Burning full translated SRT as the primary product (optional later)  
- Replacing Just One (still required for live Douyin resolve/detail/`playUrl`)  

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Output shape | Keep source video picture; do not rebuild from b-roll |
| Mode 1 | VI dub audio only |
| Mode 2 | Letterbox bars (added canvas) + VI dub |
| Banner geometry | **Letterbox / added bars** — video content not covered |
| Banner copy | AI generate + editor edit (`header`, `bottom`) |
| Audio source | TTS default + allow full dub upload replace |
| Timing | Per-segment TTS fit into original STT `[start, end]` windows; **do not** retarget video duration to audio |
| Fit strategy | Pad silence if short; speed-up capped (~1.25×) if long; if still long → shorten VI text (LLM) and re-TTS segment |
| Architecture | In-app FFmpeg worker render (Approach A) |
| TTS voices | 1–2 presets initially; upload for studio voice |
| Ship order | (1) `audio_only` dub → (2) `banner_audio` |

---

## 4. Architecture

### 4.1 Pipeline (additive)

Existing:

```
remix_resolve → remix_fetch_detail → remix_download_media
  → remix_stt → remix_translate → remix_generate
```

Add:

```
→ remix_tts          (after translated transcript exists)
→ remix_render       (on-demand when user previews/exports MP4)
```

`remix_generate` (packaging) remains independent and must not block TTS.

Just One remains only on resolve/detail. Download/STT/translate/TTS/render do not call Just One.

### 4.2 New components

| Component | Responsibility |
|---|---|
| `TtsAdapter` | `synthesizeSegment(text, voiceId) → audio buffer`; fake + live providers |
| Segment fit util | Pad / tempo / shorten-retry to fit `[start,end]` |
| Dub assembler | Concat fitted segment audio (+ silence gaps) → full dub track |
| `RemixRenderService` | FFmpeg: replace audio; optional letterbox + draw banner text |
| Remake Studio “Video output” panel | Mode, voice, upload, banner fields, render/preview/download |
| Storage keys | Video source, dub audio, render MP4 (TTL aligned with existing media cleanup) |

### 4.3 Render modes

| Mode | Video | Audio | Banners |
|---|---|---|---|
| `audio_only` | Source, no letterbox | VI dub (TTS or upload) | None |
| `banner_audio` | Source + top/bottom bars | VI dub | Header + bottom text |

---

## 5. Data model

Extend `ViralRemake` (names indicative):

| Field | Type | Notes |
|---|---|---|
| `mediaVideoKey` | string? | Persist downloaded video bytes (today pipeline emphasizes audio extraction; render needs video) |
| `mediaDubAudioKey` | string? | Assembled VI dub or uploaded file |
| `renderMode` | string | `audio_only` \| `banner_audio` |
| `bannerJson` | json? | `{ header: string, bottom: string }` |
| `renderOutputKey` | string? | Final MP4 |
| `ttsVoiceId` | string? | Preset id |
| `ttsCostUsd` | float? | Usage tracking |
| `pipelinePhase` | enum+ | Add `tts`, `rendering`, `render_ready` (keep `ready` for package-ready; define UX mapping in plan) |

Upload path: store under remake-scoped object key; set `mediaDubAudioKey`; mark dub source `upload` vs `tts` in json meta if needed.

---

## 6. Jobs & APIs

### Jobs

| Job | Trigger | Behavior |
|---|---|---|
| `remix_tts` | After translate (optional auto) or “Tạo audio VI” | Segment TTS + fit + assemble; skip synth if upload present |
| `remix_render` | “Render preview” / export MP4 | FFmpeg mux per `renderMode`; write `renderOutputKey` |

### HTTP (illustrative)

| Method | Path | Purpose |
|---|---|---|
| `PATCH` | `/viral/remix/:id` | Update `renderMode`, `bannerJson`, `ttsVoiceId` |
| `POST` | `/viral/remix/:id/tts` | Enqueue `remix_tts` |
| `POST` | `/viral/remix/:id/dub-audio` | Upload override |
| `POST` | `/viral/remix/:id/banners/generate` | LLM sensational header/bottom |
| `POST` | `/viral/remix/:id/render` | Enqueue `remix_render` |
| `GET` | `/viral/remix/:id/render` | Stream/download MP4 (policy gate) |

ZIP export stays; optionally include MP4 when `renderOutputKey` exists (plan may choose “separate download only” for MVP).

---

## 7. Segment sync algorithm

Input: `sourceTranscriptTranslated.segments[]` with `startSec` / `endSec` / `text` (timing from original STT).

For each segment:

1. `targetDur = endSec - startSec`  
2. TTS `text` → audio duration `d`  
3. If `d < targetDur` → pad silence to `targetDur`  
4. If `d > targetDur` → increase playback speed up to configured max (default **1.25×**)  
5. If still too long → LLM shorten text (preserve meaning) → re-TTS → repeat once  
6. If still failing → mark segment `fitFailed` for UI; do not silently desync whole timeline  

Assemble: place each fitted clip at `startSec` on a timeline of `videoDurationSec` (silence elsewhere).

Upload override: skip per-segment TTS; warn if duration differs materially from video; still allow render.

---

## 8. Letterbox banners

- Extend canvas height (or add bars) so **source frames are not covered**  
- Draw `header` / `bottom` with fixed studio typography (plan picks font/size/safe margins)  
- Sensational tone: short, punchy VI lines; max length enforced in UI + render truncate  
- Generate via small LLM prompt from translated transcript excerpt; always editable after  

---

## 9. Remake Studio UX

New **Video output** section:

1. Render mode radio  
2. TTS voice preset  
3. Upload audio replace  
4. Banner fields (visible iff `banner_audio`) + Generate hooks  
5. Actions: Create VI audio → Render preview → video player → Download MP4  
6. Pipeline badge includes `tts` / `rendering` / `render_ready`  
7. Failed segment list when fit fails  

Policy: Download MP4 requires same approve gate as ZIP (`approved_for_export`) unless product later softens preview-only without download.

---

## 10. Errors & ops

| Case | Behavior |
|---|---|
| TTS provider down | Job fail + retry; keep prior dub if any |
| Segment fit fail | Surface in UI; allow edit text / re-TTS one segment |
| FFmpeg fail | Phase `failed` with message; package data intact |
| Long media | Low worker concurrency; existing media TTL cleanup extended to video/dub/render keys |
| Cost | Track `ttsCostUsd` + render time metrics via `usage_events` where applicable |

Env knobs (indicative): `REMIX_TTS_PROVIDER`, `REMIX_TTS_VOICE`, `REMIX_TTS_MAX_SPEED`, `REMIX_RENDER_CONCURRENCY`, `REMIX_ALLOW_MEDIA_DOWNLOAD` (already related).

---

## 11. Testing

- Unit: fit util (pad / speed / shorten path), letterbox layout math, banner truncation  
- Fake `TtsAdapter` + stub FFmpeg for CI  
- Processor specs: tts → render chain  
- Optional e2e: fake remake → dub → MP4 magic bytes / ffprobe duration  

---

## 12. Effort

| Slice | Estimate |
|---|---|
| TTS segment + upload | ~1–1.5 weeks |
| Render `audio_only` | ~1 week |
| Letterbox + AI banners editable | ~1 week |
| Studio UI + polish | ~0.5–1 week |
| **MVP total** | **~3.5–5 weeks** |

Ship gate: `audio_only` usable in studio before starting `banner_audio`.

---

## 13. Relation to prior Phase B notes

Older Phase B emphasized burn-in VN subs + overlay banners. This design:

- Keeps FFmpeg worker approach  
- Replaces overlay/full-SRT focus with **dub + letterbox**  
- Treats full SRT burn-in as **out of MVP** (timing data remains available for a later slice)

---

## 14. Open questions (resolve in implementation plan)

1. Default live TTS vendor (Azure / Google / ElevenLabs / VN local) for first preset  
2. Whether package-ready (`pipelinePhase=ready`) auto-enqueues `remix_tts` or waits for explicit button  
3. Exact letterbox height % and brand typography tokens  
4. Preview without approve vs download-only gate  
5. `bannerJson` vs legacy `packageJson.banners` — **default: independent**. Letterbox copy lives only in `bannerJson`; packaging banners stay optional/legacy and are not the render source.  
6. TTS input column — **always** `sourceTranscriptTranslated` segments (STT timings), never package subtitle cues.  
7. `mediaVideoKey` — download job must persist video bytes before `audio_only` render (prerequisite slice).  
8. Per-segment re-TTS API — MVP may re-run full `POST …/tts`; plan may add segment-scoped endpoint later.  
9. Phase state — prefer separate `renderPhase` (or render substates only after package `ready`) to avoid badge confusion.  
10. ZIP — MVP: MP4 via dedicated download; ZIP may omit MP4 unless plan explicitly includes it.

Defaults if unspecified in plan: **explicit TTS button** (no auto), **approve required for MP4 download**, preview stream allowed for `render_ready` editors.
