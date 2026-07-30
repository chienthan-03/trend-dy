# Remix Background Music (BGM) — Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-30  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [Remix Dub + Letterbox Render](./2026-07-17-remix-dub-render-design.md)  
**Approach:** A — manifest + repo assets; per-remake track + volume; preview before select; original video audio muted when BGM enabled.

**Problem trigger:** Editors want TikTok-style remix output with a **chosen background music bed** under VI narration, without relying on (often messy) original Douyin soundtrack. They need to **listen before picking** so the mood matches the clip.

---

## 1. Problem

Today render replaces the video soundtrack with **VI dub only** (`renderAudioOnly` / `renderBannerAudio` map `0:v` + dub, no original audio). There is:

- No curated BGM library  
- No per-remake music selection  
- No preview/listen UI  
- No volume control for a music bed under narration  

Editors manually add music in CapCut after export — slow and inconsistent.

---

## 2. Goals / non-goals

### Goals

- Fixed library of **6 tracks** (files provided by ops; stored in repo assets)  
- Per-remake **track selection** + **volume slider** (0–100%)  
- **Preview / nghe thử** each track in Remake Studio **before** selecting (explicit play button; not auto-play on radio select)  
- Render: **VI dub + looped BGM** at configured volume; **original video audio off**  
- Loop BGM to full video/dub duration  
- `bgmTrackId = null` → behavior unchanged (dub only, no BGM)  
- Changing track or volume **invalidates render only** (no re-TTS)  
- Works for `audio_only` and `banner_audio`; upload-dub path still dub + optional BGM  
- API list + stream preview for web  

### Non-goals (MVP)

- User upload of custom BGM  
- MinIO / dynamic CMS for tracks  
- Fade-out at end of video  
- Live volume on preview (slider affects render only in MVP)  
- Stem separation / keeping original Douyin music  
- Per-remake duck of dub vs BGM (fixed mix via volume slider only)  
- BGM on export ZIP beyond rendered MP4  

---

## 3. Product decisions (locked)

| Decision | Value |
|---|---|
| Library size | 6 fixed tracks (see §4) |
| Original video audio | **Off** when BGM selected (output = dub + BGM only) |
| No BGM | `bgmTrackId = null` → dub only (current behavior) |
| Loop | `stream_loop` + `amix duration=first` — BGM loops to match dub/video |
| Volume range | `0.0–1.0` linear; UI 0–100% |
| Default volume | `0.3` (30%) when `bgmVolume` null |
| Preview | **Required** — «Nghe thử» per row; one track playing at a time; radio select does **not** auto-play |
| Persistence | `ViralRemake.bgmTrackId` nullable; `ViralRemake.bgmVolume` nullable float |
| Invalidation | Track or volume change → clear `renderOutputKey`, `renderPhase → tts_ready` if dub exists, else `idle`; **do not** clear dub |
| Upload dub | Same BGM rules; original video audio still off when BGM set |
| Auth | Preview stream same session guard as other remix routes |

---

## 4. Track catalog

Assets path: `apps/api/assets/remix/bgm/`

| ID | UI label | Source file (ops copy) |
|---|---|---|
| `bad-style-time-back` | Bad Style — Time Back | `Bad Style - Time Back 【Tiktok Song】 [6utRlET4V6A].mp3` |
| `asphyxia` | Asphyxia (逆時針向) | `逆時針向 - Asphyxia [kSJ0Nqfhiec].mp3` |
| `xomu-lanterns` | Xomu — Lanterns | `Xomu - Lanterns [L17njonbcT0].mp3` |
| `late-night-melancholy` | Late Night Melancholy | `Rude Boy White Cherry - Late Night Melancholy (Official Video).mp3` |
| `else-paris` | Else — Paris | `Else - Paris.mp3` |
| `shiverr-whize` | Shiverr — Whize | `Shiverr - Whize _ Nhạc nền kinh dị gây ám ảnh Tiktok [7YgntHOCdpk].mp3` |

Renamed on disk: `{id}.mp3` (e.g. `bad-style-time-back.mp3`).

`manifest.json` lists `id`, `label`, `file` — single source of truth for API + render.

---

## 5. Data model

### Prisma (`ViralRemake`)

```prisma
bgmTrackId  String? @map("bgm_track_id")
bgmVolume   Float?  @map("bgm_volume") // 0.0–1.0; null → default 0.3 at resolve time
```

### Shared types

```ts
export const REMIX_BGM_TRACK_IDS = [
  "bad-style-time-back",
  "asphyxia",
  "xomu-lanterns",
  "late-night-melancholy",
  "else-paris",
  "shiverr-whize",
] as const;
export type RemixBgmTrackId = (typeof REMIX_BGM_TRACK_IDS)[number];

export type RemixBgmTrack = {
  id: RemixBgmTrackId;
  label: string;
  previewUrl: string;
};
```

### Invalidation helper

```ts
export const invalidateRenderOnly = (hasDub: boolean) => ({
  renderOutputKey: null,
  renderPhase: hasDub ? "tts_ready" : "idle",
  renderError: null,
});
```

Apply when `bgmTrackId` or `bgmVolume` changes (including null ↔ set).

---

## 6. API

| Method | Path | Response |
|---|---|---|
| `GET` | `/viral/remix/bgm` | `{ tracks: RemixBgmTrack[] }` |
| `GET` | `/viral/remix/bgm/:trackId/preview` | `audio/mpeg` stream, `Cache-Control: public, max-age=86400` |
| `PATCH` | `/viral/remix/:id` | Accept `bgmTrackId?: RemixBgmTrackId \| null`, `bgmVolume?: number \| null` |

**Route ordering:** Register `GET bgm` and `GET bgm/:trackId/preview` **before** `GET :id` in `RemixController`.

`previewUrl` in list response: `/api/v1/viral/remix/bgm/{id}/preview` (relative path for web).

**Validation:**

- `bgmTrackId`: must be known ID or `null`  
- `bgmVolume`: `0 ≤ v ≤ 1` or `null` (clear override → default at render)

---

## 7. Render (FFmpeg)

Current pipeline already drops original audio (maps video + dub only). With BGM:

```text
-i video.mp4
-i dub.mp3
-stream_loop -1 -i bgm.mp3
-filter_complex "[2:a]volume={bgmVolume}[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]"
-map 0:v:0 -map [aout] -shortest
```

- `bgmVolume = remake.bgmVolume ?? getBgmDefaultVolume()` (default `0.3`)  
- Shared helper `buildBgmMixFilterComplex(volume)` for unit tests  
- `RemixRenderService.renderAudioOnly` / `renderBannerAudio` accept optional `bgm?: { buffer: Buffer; volume: number }`  
- `handleRender` loads BGM buffer from `RemixBgmService` when `bgmTrackId` set  
- `REMIX_RENDER_MODE=fake`: ignore BGM (existing minimal MP4 fixtures)

Banner path: same audio filter graph; video filter unchanged.

---

## 8. UI (Remake Studio — Video output panel)

New fieldset **«Nhạc nền»** (below TTS settings, above Banner):

```
( ) Không dùng nhạc nền

( ) Bad Style — Time Back          [Nghe thử]
( ) Asphyxia (逆時針向)              [Nghe thử]
...
```

- Fetch `GET /viral/remix/bgm` on mount  
- **Nghe thử:** toggles `<audio>` / play-pause; stopping previous track when another plays  
- Radio PATCH on select (including «Không dùng» → `bgmTrackId: null`)  
- Volume slider 0–100%, step 5%; label shows e.g. `30%`; PATCH on change (debounced ~300ms)  
- Hint: «Bấm Nghe thử để chọn nhạc. Audio gốc video sẽ tắt — output chỉ còn giọng VI + nhạc nền. Volume áp dụng khi render.»  
- Highlight selected row  

Optional: `BgmPicker.tsx` component to keep `video-output-panel.tsx` focused.

---

## 9. Error handling

| Case | Behavior |
|---|---|
| Unknown `bgmTrackId` on PATCH | `400 Bad Request` |
| BGM file missing on disk | Render fails; `renderError` set with clear message |
| Preview requested for unknown ID | `404` |
| Dub missing | Render still locked (existing rule) |
| `bgmTrackId` null | Render without BGM mix (current behavior) |

---

## 10. Testing

- `RemixBgmService`: manifest load, resolve path, validate IDs  
- `buildBgmMixFilterComplex`: volume in expression  
- Controller: `GET /bgm` returns 6 tracks; preview returns `audio/mpeg`  
- `updateRemake`: BGM field change invalidates render only; same value no-op  
- `RemixRenderService` / processor: with BGM → ffmpeg args include `amix`; without → unchanged  
- Web: smoke — list loads, preview URL plays (manual QA checklist)

---

## 11. Ops / assets onboarding

1. Copy 6 MP3s from ops machine into `apps/api/assets/remix/bgm/` with `{id}.mp3` names  
2. Commit assets + `manifest.json` (large binaries — ensure git LFS or team policy allows)  
3. No env vars required beyond existing `FFMPEG_PATH` / `REMIX_RENDER_MODE`

Optional env (defer unless needed):

```env
# REMIX_BGM_DEFAULT_VOLUME=0.3
# REMIX_BGM_ASSETS_DIR=...  # override manifest root for local dev
```

---

## 12. Acceptance criteria

- [ ] Editor can **nghe thử** each of 6 tracks before selecting  
- [ ] Selected track + volume persist on remake  
- [ ] Render MP4 = VI dub + looped BGM at volume; no original Douyin audio  
- [ ] Changing track/volume does not require «Tạo audio VI» again  
- [ ] «Không dùng nhạc nền» restores dub-only render  
- [ ] `banner_audio` mode includes BGM in output  
