# Remix Narration vs Source Audio Mix — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-20  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md)  
**Problem trigger:** Editors reported quiet/continuous TTS and, more critically, TTS reading **film character dialogue** in the reviewer voice, causing rushed timing vs the source video.

---

## 1. Problem

Full-script STT on Douyin movie-review clips captures:

1. **Reviewer narration** — should become Vietnamese TTS  
2. **In-film dialogue / SFX / music beds with speech** — should **keep original audio**

Today every translated segment is TTS’d and the render **replaces** the whole soundtrack. That:

- Speaks character lines in the reviewer voice  
- Packs too much speech into windows that were sparse dialogue → **sounds faster than the source**  
- Breaks the “same picture, natural rhythm” product promise  

---

## 2. Goals / non-goals

### Goals

- Auto-**classify** each transcript segment as `narration` | `source`  
- Allow editors to **override** role per segment in Remake Studio  
- **TTS only** `narration` segments (segment-synced to STT timings)  
- **Render mix:** original video audio in `source` windows; VI TTS in `narration` windows (with light ducking of original under TTS)  
- Works for both `audio_only` and `banner_audio` render modes  
- Re-classify action without re-running full STT  

### Non-goals (MVP)

- Speaker diarization models / multi-speaker ID  
- Voice cloning  
- Perfect music stem separation  
- Changing ZIP package export semantics beyond optional role metadata  
- Upload-dub path: keep **full replace** (ignore roles) as today  

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Source windows | **Keep original audio** (user choice #1) |
| Narration windows | VI TTS (existing providers) |
| Classification | **Automatic + manual override** (Approach A) |
| Default if unclassified | `narration` (safe for non-review content) |
| Sentence re-split before TTS | **Off by default** for this flow (was causing wrong breaks); optional later |
| Upload dub override | Full track replace; roles ignored |
| Ducking | Original audio lowered under narration windows; full level on `source` |

---

## 4. Data model

Extend shared transcript segment:

```ts
export type RemixSegmentRole = "narration" | "source";

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  /** Absent / undefined → treat as narration */
  role?: RemixSegmentRole;
};
```

- Persist on `ViralRemake.sourceTranscriptTranslated` (JSON).  
- Optionally stamp the same `role` onto `sourceTranscript` by index for debugging; **source of truth for TTS/render = translated transcript**.  
- No Prisma migration required (JSON field already exists).

---

## 5. Classification

### When

- After translate succeeds (hook in `remix_translate` completion **or** lazy on first `remix_tts` if any segment lacks `role`).  
- Explicit **Re-classify** API/UI action overwrites roles (respect: only auto-filled ones vs all — MVP: overwrite all auto; manual flag optional later; MVP simpler: overwrite all then editor re-fixes).

### How (MVP)

1. Light heuristics (optional pre-hints): residual Chinese-heavy text, very short exclamations, etc.  
2. One LLM call (batch by index) with system rules:
   - `narration` = reviewer explaining / summarizing  
   - `source` = in-universe character dialogue, on-screen film speech, non-reviewer lines  
3. Write `role` onto each segment; log counts.

### Cost / failure

- On classify failure: leave unset (= narration) and surface warning; do not fail the whole remake.  
- Budget: use existing remix LLM model / small batch size.

---

## 6. TTS job (`remix_tts`)

1. Load translated transcript.  
2. Ensure roles (run classify if missing).  
3. For each segment:
   - `narration` → synthesize + fit into `[startSec, endSec]` (existing pad/speed/shorten).  
   - `source` → **skip**; leave silence on dub track for that window.  
4. Assemble dub timeline (adelay + amix + loudnorm) as today.  
5. Persist `mediaDubAudioKey`, `ttsCostUsd`, fit failures (indices among **narration** attempts).

Do **not** sentence-split narration by default in this path (revisit only if STT cues are single mega-segments).

---

## 7. Render mix

Replace “discard original audio” with a **two-track mix**:

Inputs:

- Video file (picture + original audio)  
- Dub MP3 (TTS in narration windows, silence elsewhere)  
- Role timeline from translated transcript (list of narration intervals)

FFmpeg sketch:

1. Extract/map original audio.  
2. Build a **volume envelope** (or `volume` + `enable`/`between`) so original is:
   - `duckGain` (e.g. 0.15–0.25) during narration intervals  
   - `1.0` during source / non-narration  
3. `amix` ducked original + dub (`normalize=0`), then optional loudnorm.  
4. Mux with video (`audio_only`) or after letterbox video filter (`banner_audio`).

Upload-dub path: if `dubSource === "upload"`, keep current full audio replace (no role mix).

---

## 8. API / UI

### API

- `PATCH` remake / transcript update: allow updating segment `role` (or dedicated `PATCH .../transcript/roles`).  
- `POST .../classify-segments` → re-run classification, return updated remake/transcript.  
- Existing `POST .../tts` and `POST .../render` consume stored roles.

### Remake Studio

- Transcript panel (or Video output adjacent list): each line shows badge **Review** | **Giữ gốc**; click to toggle.  
- Action **Phân loại lại**.  
- Copy near TTS: “Chỉ đọc dòng Review; dòng Giữ gốc dùng tiếng gốc.”

---

## 9. Testing

- Unit: classify parser; volume envelope builder from intervals; TTS skips `source`.  
- Integration: render mix keeps energy in a `source`-only window when dub is silent there.  
- Spec/UI: role toggle round-trips via API.

---

## 10. Rollout

1. Shared type + classify + TTS skip  
2. Render mix + ducking  
3. Studio role UI + re-classify  
4. Soft-disable default sentence-split for live TTS path  

No DB migration. Restart API/worker after deploy; editors re-run **Phân loại** (or first TTS) then **Tạo audio VI** + **Render preview**.
