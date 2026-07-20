# Remix Narration vs Source Audio Mix — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-20  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md)  
**Supersedes (partial):** Parent design’s `audio_only` / `banner_audio` wording that **fully replaces** the soundtrack with VI dub. For the **TTS** path, output is a **mix**: original audio on `source` windows, VI TTS on `narration` windows. The **upload-dub** path still fully replaces audio (roles ignored).  

**Problem trigger:** TTS was reading film character dialogue in the reviewer voice, rushing timing vs the source video.

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
- Allow editors to **override** role per segment in Remake Studio (**manual overrides survive re-classify**)  
- **TTS only** `narration` segments (segment-synced to STT timings)  
- **Render mix:** original video audio outside / on `source` windows; VI TTS on `narration` windows (duck original under TTS)  
- Works for both `audio_only` and `banner_audio` when `dubSource === "tts"`  
- Re-classify action without re-running full STT  

### Non-goals (MVP)

- Speaker diarization models / multi-speaker ID  
- Voice cloning  
- Perfect music stem separation  
- Role metadata in ZIP export  
- Upload-dub path: keep **full replace** (ignore roles) as today  

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Source windows | **Keep original audio** |
| Narration windows | VI TTS |
| Classification | Automatic + manual override |
| Default if `role` unset | `narration` |
| Sentence re-split before TTS | **Disabled** on this path (must ship with role skip; do not leave `splitSegmentsForTts` always-on) |
| Upload dub override | Full track replace; roles ignored at render |
| Ducking | Original lowered only during **narration** intervals; **everywhere else** original at 1.0 (including gaps between cues) |
| Duck gain | Env `REMIX_DUCK_GAIN` default `0.2` (linear) |
| Role change | Invalidates dub + render (force re-TTS before Render) |

---

## 4. Data model

```ts
export type RemixSegmentRole = "narration" | "source";
export type RemixSegmentRoleSource = "auto" | "manual";

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  /** Absent → treat as narration for TTS/render */
  role?: RemixSegmentRole;
  /** Absent → treat as auto for re-classify eligibility */
  roleSource?: RemixSegmentRoleSource;
};
```

- **Source of truth for TTS/render:** `ViralRemake.sourceTranscriptTranslated`.  
- Do **not** read roles from `sourceTranscript` for TTS/render (optional debug stamp only).  
- No Prisma migration (JSON field).

Optional remake field `classifyWarning: string | null` (Prisma optional string or reuse a JSON soft-warning slot). Classify API returns the same warning for Studio toast; **persist on remake** so GET remake shows it after refresh.

---

## 5. Classification

### When

- After translate succeeds **or** lazily on first `remix_tts` for segments with `role == null`.  
- Explicit **Re-classify** API/UI.

### Pairing

- Classify using **paired** `sourceTranscript[i]` + `sourceTranscriptTranslated[i]` (same index).  
- If segment **counts differ**, reject classify with `classifyWarning` (same as bad LLM parse).  
- Persist `role` / `roleSource: "auto"` only on **translated** segments.

### Overwrite rules

| Action | Touches |
|---|---|
| Lazy fill | Only segments with `role == null` |
| Re-classify | Only `roleSource !== "manual"` (and null) |
| Editor toggle | Sets `role` + `roleSource: "manual"` |

### Failure

- LLM wrong count / bad indexes → **reject entire parse**; leave roles unchanged; set `classifyWarning`.  
- Do not partial-apply silently.  
- Unset roles still behave as narration at TTS time.

### Re-STT / re-translate

- Clears roles on translated transcript (and clears dub + render keys / phases as existing regenerate paths do).

---

## 6. TTS job (`remix_tts`) — ordered steps

1. Load translated transcript.  
2. Ensure roles: lazy-classify only `role == null` segments.  
3. **Do not** call `splitSegmentsForTts` on this path.  
4. For each **persisted** translated segment (stable Studio index `i`):
   - Effective role = `segment.role ?? "narration"`.  
   - `narration` → synthesize + fit into `[startSec, endSec]`; on fit failure record **`i`** in `ttsFitFailedIndexes`.  
   - `source` → skip (silence on dub for that window).  
5. Assemble dub (adelay + amix `normalize=0` + loudnorm on **dub only**).  
6. Persist `mediaDubAudioKey`, `ttsCostUsd`, `ttsFitFailedIndexes`, `renderPhase=tts_ready`.

If **all** segments are `source`: dub ≈ silence; still `tts_ready` (render will ≈ original audio).

---

## 7. Render mix

### When `dubSource === "upload"`

- **Full audio replace** with uploaded dub (current behavior).  
- **Do not** apply role envelope even if roles exist.

### When `dubSource === "tts"` (or tts-produced key)

1. Video + original audio.  
2. Dub MP3 (TTS in narration windows, silence elsewhere).  
3. Narration intervals from translated roles (`role ?? "narration"`); merge adjacent/overlapping intervals; ignore zero-length.  
4. Duck original to `REMIX_DUCK_GAIN` **only** on those intervals; else gain `1.0`.  
5. `amix` ducked original + dub (`normalize=0`). **No** post-mix loudnorm (preserve duck).  
6. Mux with picture (`audio_only`) or after letterbox filters (`banner_audio`).

### Edge cases

| Case | Behavior |
|---|---|
| No audio stream on video | Fail render with clear error |
| All `source` | Mix ≈ original |
| All `narration` | Original continuously ducked under TTS |
| STT missed a spoken line | Original may still leak in gaps (accepted MVP risk) |

---

## 8. Invalidation

Any of the following **always** clears `mediaDubAudioKey` and `renderOutputKey`, and sets `renderPhase` to `idle`:

- Segment role toggle  
- Successful classify / re-classify that changes any role  
- Re-translate / re-STT  

Studio: disable **Render preview** until TTS has produced `tts_ready` / `render_ready` again after role edits.

---

## 9. API / UI

### API

- Update segment roles (PATCH remake transcript or `PATCH .../transcript/roles`) with invalidation.  
- `POST .../classify-segments` → re-classify per overwrite rules; returns transcript + optional `warning`.  
- Existing TTS / render endpoints unchanged in shape.

### Remake Studio

- Per line: badge **Review** | **Giữ gốc**; toggle → manual.  
- **Phân loại lại**.  
- Hint: “Chỉ đọc dòng Review; dòng Giữ gốc giữ tiếng gốc.”  
- Show `classifyWarning` if present.

---

## 10. Testing

- Unit: role effective default; re-classify skips manual; envelope builder; TTS skips `source`; fit failure indexes = persisted indices.  
- Integration: `source`-only window keeps original energy when dub silent; upload path ignores envelope.  
- UI/API: role toggle invalidates dub.

---

## 11. Rollout (single ship)

1. Shared types (`role`, `roleSource`)  
2. Classify + overwrite rules + warning  
3. TTS skip `source` + **remove default sentence-split** on TTS path  
4. Render mix + duck + upload bypass  
5. Studio badges + re-classify + invalidation  

Restart API/worker; editors: Phân loại (or first TTS) → Tạo audio VI → Render preview.
