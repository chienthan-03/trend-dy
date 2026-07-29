# Remix TTS Audio Mode UI — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-29  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Remix Narration vs Source Audio Mix](./2026-07-20-remix-narration-source-mix-design.md), [Hybrid TTS Timing](./2026-07-24-hybrid-tts-timing-design.md)  
**Approach:** B — expose `replace` | `mix` on Remake Studio Video output panel (per-remake), with env as default; no stem separation; no duck slider (defer to later).

**Problem trigger:** Editors lose background music on render because the pipeline defaults to full soundtrack replace (`REMIX_TTS_AUDIO_MODE=replace`), and the Studio UI never surfaces mix mode or the “must re-TTS after mode change” rule.

---

## 1. Problem

Today:

1. `getTtsAudioMode()` is **env-only**. Local `.env` often omits `REMIX_TTS_AUDIO_MODE` → default `replace`.
2. UI labels (“Chỉ audio VI”) imply “Vietnamese audio” but do **not** mean “keep original music.”
3. Switching to mix requires restarting workers + re-running TTS; nothing in Studio explains this.

Editors want a **“đủ dùng”** result: VI narration with ducked original bed (music + faint source voice under TTS), without Demucs/stem separation.

---

## 2. Goals / non-goals

### Goals

- Per-remake **TTS audio mode**: `replace` | `mix`, editable in Video output panel
- Env `REMIX_TTS_AUDIO_MODE` remains the **default for new remakes** (and for remakes with null persisted mode)
- Changing mode **invalidates** dub + render (force **Tạo audio VI** before Render)
- Clear Vietnamese copy: what mix keeps, what it does not (no perfect music-only stem)
- Render/TTS workers read **remake field first**, then fall back to env
- Config + short usage note in `.env.example`

### Non-goals

- Stem separation / vocal remover
- Per-remake duck gain slider (keep global `REMIX_DUCK_GAIN`)
- Changing upload-dub behavior (still full replace; mode ignored when `dubSource === "upload"`)
- Changing segment role classification UX beyond a short cross-link hint

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Quality bar | “Đủ dùng” — original under TTS via duck; source voice may leak |
| Persistence | `ViralRemake.ttsAudioMode` nullable string: `replace` \| `mix` \| null |
| Null meaning | Resolve as `getTtsAudioMode()` from env at TTS/render time |
| New remake default | Leave **null** so ops can flip env without backfilling rows |
| UI radio PATCH | Always persist explicit `"replace"` \| `"mix"` (never write null from radios). Null remains API/ops-only “follow env.” |
| UI default display | Show resolved effective mode (persisted ?? env) via `effectiveTtsAudioMode` on remake DTO |
| Mode change invalidation | Reuse existing `invalidateDubAndRenderData` (same as role toggle): clears dub + render + `dubSource` as that helper already does |
| Upload dub | Ignore `ttsAudioMode`; always full replace |
| Duck gain | Env only (`REMIX_DUCK_GAIN`). Do **not** change code default in this work — today `getDuckGain()` defaults to `0`; operators set `0.2` in `.env` for “đủ dùng.” |
| Hybrid timing | Unchanged: hybrid only when effective mode is `replace` |

---

## 4. Data model

```prisma
ttsAudioMode String? @map("tts_audio_mode") // replace | mix | null → env
```

Shared type:

```ts
export const REMIX_TTS_AUDIO_MODES = ["replace", "mix"] as const;
export type RemixTtsAudioMode = (typeof REMIX_TTS_AUDIO_MODES)[number];
```

API:

- `GET` remake includes `ttsAudioMode` (nullable) + optional `effectiveTtsAudioMode` for UI (or client resolves via cost/config endpoint — prefer server field `effectiveTtsAudioMode` on remake DTO to avoid duplicating env on web).
- `PATCH` remake accepts `ttsAudioMode?: "replace" | "mix" | null` (null = clear override → follow env).

---

## 5. Worker resolution

```ts
const effectiveMode =
  remake.ttsAudioMode === "mix" || remake.ttsAudioMode === "replace"
    ? remake.ttsAudioMode
    : getTtsAudioMode();
```

- **TTS (`handleTts`)**: use `effectiveMode` instead of bare `getTtsAudioMode()` for skip-source / hybrid gates.
- **Render (`handleRender`)**: `dubSource === "tts" && effectiveMode === "mix"` → mix path; else full replace.

---

## 6. UI (Video output panel)

### Control

Radio group (in addition to existing `audio_only` / `banner_audio`):

| Value | Label (VI) |
|---|---|
| `replace` | Thay toàn bộ audio |
| `mix` | Giữ nhạc nền (mix) |

Disabled while TTS/render pending.

### Hint (under radios)

- **replace:** “Chỉ còn giọng VI — mất nhạc/SFX gốc.”
- **mix:** “Giữ audio gốc dưới lời VI (duck). Tiếng gốc có thể còn lí nhí. Không tách riêng nhạc. Cần **Tạo audio VI** lại sau khi đổi mode hoặc đổi Review/Giữ gốc.”

When `dubSource === "upload"`: hide or disable mode radios; show “Audio tải lên luôn thay toàn bộ track.”

### Gating

- **Render preview** disabled unless `renderPhase` is `tts_ready` or `render_ready` (existing) **and** after mode change the phase is reset to `idle` so Render stays blocked until TTS.

### Transcript panel

One-line reminder near role badges when effective mode is `mix`: “Mix: chỉ đọc dòng Review; Giữ gốc giữ tiếng gốc + nhạc.”

---

## 7. Invalidation matrix

| Action | Behavior |
|---|---|
| PATCH `ttsAudioMode` when value **changes** | Spread `invalidateDubAndRenderData` (same helper as role toggle) |
| Role toggle / re-classify | Unchanged (existing helper) |
| PATCH banner / `renderMode` only | Unchanged (render-only wipe → `tts_ready` if dub exists) |
| PATCH `ttsAudioMode` to same value | No-op invalidation |

---

## 8. Config / docs

`.env.example` — keep sample default **`replace`** (current); document mix as the music-bed option:

```env
# replace (default) = full VI soundtrack; mix = keep original under narration (duck)
REMIX_TTS_AUDIO_MODE=replace
# Linear gain for original under TTS narration windows when mode=mix (code default 0)
# REMIX_DUCK_GAIN=0.2
```

Local “đủ dùng” ops tip (not a code default change): set `REMIX_TTS_AUDIO_MODE=mix` and `REMIX_DUCK_GAIN=0.2` in `.env`, or pick mix in Studio.

Usage (smoke):

1. Pick **Giữ nhạc nền (mix)** in UI (or set env `mix` with null remake field)
2. Classify Review / Giữ gốc
3. Tạo audio VI → Render preview
4. Expect: music under VI on Review windows; full original on Giữ gốc

---

## 9. Testing

- Unit: effective mode resolution (null → env; explicit overrides env)
- Service: PATCH mode change clears dub + render keys
- Processor: TTS skips `source` only when effective `mix`; render calls `renderAudioMix` vs `renderAudioOnly` accordingly
- Upload path: mix field set but still full replace
- UI: radios call PATCH; Render disabled at `idle` after mode flip

---

## 10. Out of scope / later

- Duck gain slider per remake
- Stem separation
- Auto-suggest mix for movie-recap genres
