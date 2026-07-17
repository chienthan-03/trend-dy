# Remix Dub + Render Smoke Checklist

Manual verification for the dub/render pipeline (Vietnamese TTS, audio-only and banner+letterbox MP4, gated download).

**Plan:** [2026-07-17-remix-dub-render.md](./2026-07-17-remix-dub-render.md)

---

## Prerequisites

- [ ] **Infrastructure:** Postgres, Redis, MinIO (or S3) running (`docker compose up -d`).
- [ ] **Processes:** API (`pnpm dev:api`), worker (`pnpm dev:worker`), web (`pnpm dev:web`).
- [ ] **Tools:** `ffmpeg` on PATH (`ffmpeg -version`).
- [ ] **Environment** (from `.env.example`):

```env
REMIX_ENABLED=true
REMIX_SCRIPT_MODE=full
REMIX_ALLOW_MEDIA_DOWNLOAD=true
REMIX_STT_MODE=fake
REMIX_TRANSLATE_MODE=fake
REMIX_TTS_MODE=fake
REMIX_RENDER_MODE=fake
REMIX_DUB_MAX_UPLOAD_MB=30
FFMPEG_PATH=ffmpeg
```

For live TTS/render, set `REMIX_TTS_MODE=live`, `REMIX_RENDER_MODE` unset (or not `fake`), and provide `REMIX_TTS_API_URL` / `REMIX_TTS_API_KEY` (or `AI_GATEWAY_*`).

---

## Smoke test steps

Run in order after logging into Remake Studio.

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | **Paste link** — Viral Feed → paste Douyin URL → **Chế biến** | Remake created; pipeline runs through translate | |
| 2 | **Translate ready** — open remake in Studio | `sourceTranscriptTranslated` populated; package pipeline `ready` (or translate step complete) | |
| 3 | **Tạo audio VI** — Video output panel → **Tạo audio VI** | `renderPhase` → `tts` → `tts_ready`; dub audio stored | |
| 4 | **Preview audio_only** — mode **Chỉ audio VI** → **Render preview** | `renderPhase` → `rendering` → `render_ready`; `<video>` preview plays MP4 with VI dub | |
| 5 | **Generate banners** — switch to **Banner + audio VI** → **Generate** | `bannerJson` has `header` + `bottom` (VI hooks) | |
| 6 | **banner_audio render** — **Render preview** again | New MP4 with letterbox bars + banner text + VI audio | |
| 7 | **Approve** — complete policy checklist → **Phê duyệt** | `approved_for_export` true | |
| 8 | **Download MP4** — **Download MP4** (requires approve) | MP4 downloads; plays with dub (and banners if banner mode) | |
| 9 | **ZIP still works without MP4** — **Xuất file** / export package | ZIP downloads; contains transcript/SRT/banners as before; **no** `render.mp4` inside ZIP | |

---

## Spot checks

- [ ] `renderPhase` chip / badge reflects `tts`, `tts_ready`, `rendering`, `render_ready`, or `failed`.
- [ ] If segment fit fails, `ttsFitFailedIndexes` surfaced in UI (warning, not hard block).
- [ ] Upload dub override: optional MP3 upload sets `dubSource=upload` and skips TTS.
- [ ] Usage logs record `remix_tts` cost when live TTS is enabled.

---

## Automated tests (API)

```bash
cd apps/api && pnpm test -- remix
```

All remix-scoped unit/integration specs should pass. Known pre-existing e2e failures (if any) are noted in the plan verification commit message.
