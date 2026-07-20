# Narration vs Source Audio Mix Smoke Checklist

Manual verification for segment role classification, narration-only TTS, duck-mixed render, and upload-dub full replace.

**Plan:** [2026-07-20-remix-narration-source-mix.md](./2026-07-20-remix-narration-source-mix.md)

---

## Prerequisites

- [ ] **Infrastructure:** Postgres, Redis, MinIO (or S3) running (`docker compose up -d`).
- [ ] **Processes:** API (`pnpm dev:api`), worker (`pnpm dev:worker`), web (`pnpm dev:web`).
- [ ] **Tools:** `ffmpeg` on PATH (`ffmpeg -version`).
- [ ] **Test content:** A Douyin remake whose transcript mixes reviewer narration and in-film dialogue (commentary + quoted film lines).
- [ ] **Environment** (from `.env.example`):

```env
REMIX_ENABLED=true
REMIX_SCRIPT_MODE=full
REMIX_ALLOW_MEDIA_DOWNLOAD=true
REMIX_STT_MODE=fake
REMIX_TRANSLATE_MODE=fake
REMIX_TTS_MODE=fake
REMIX_RENDER_MODE=fake
REMIX_DUCK_GAIN=0.2
REMIX_DUB_MAX_UPLOAD_MB=30
FFMPEG_PATH=ffmpeg
```

For live TTS/render, set `REMIX_TTS_MODE=live`, `REMIX_RENDER_MODE` unset (or not `fake`), and provide `REMIX_TTS_API_URL` / `REMIX_TTS_API_KEY` (or `AI_GATEWAY_*`). `REMIX_DUCK_GAIN` controls how far the original audio ducks under narration windows (default `0.2`, range `0.05`–`1`).

---

## Smoke test steps

Run in order after logging into Remake Studio.

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | **Remake with mixed content** — Viral Feed → paste Douyin URL (review + film dialogue) → **Chế biến** | Remake created; translate ready; transcript has both reviewer lines and in-film dialogue | |
| 2 | **Phân loại lại** — Transcript panel → **Phân loại lại** | Classification completes; at least some segments show role `source` (film dialogue); others `narration` (reviewer) | |
| 3 | **Toggle one line manual** — click role badge on one segment to flip `narration` ↔ `source` | Segment updates; badge shows manual override (`roleSource=manual`) | |
| 4 | **Re-classify preserves manual** — **Phân loại lại** again | Auto-classified segments may change; the manually toggled segment keeps its manual role | |
| 5 | **Tạo audio VI** — Video output panel → **Tạo audio VI** | `renderPhase` → `tts` → `tts_ready`; dub audio contains only narration segments spoken (no TTS on `source` lines) | |
| 6 | **Render with mix** — **Render preview** (audio_only or banner mode) | Output MP4: film dialogue keeps original voice; reviewer lines are VI TTS; pacing not rushed (no sentence-split on `source`) | |
| 7 | **Upload dub full replace** — upload custom MP3 dub → **Render preview** | Render uses uploaded audio as full replace (no duck-mix of original); same behavior as pre-mix upload path | |

---

## Spot checks

- [ ] Role badges visible per segment (`narration` / `source`); manual overrides distinguishable from auto.
- [ ] `classifyWarning` surfaced in UI when classification is partial or low-confidence.
- [ ] Editing roles clears stale dub/render (user must re-run TTS/render).
- [ ] `REMIX_DUCK_GAIN` affects duck depth under narration windows when using TTS dub (live render).
- [ ] Usage logs record `remix_tts` only for narration segment character counts.

---

## Automated tests (API)

```bash
cd apps/api && pnpm test -- remix
```

All remix-scoped unit/integration specs should pass, including `segment-role`, `classify-segments`, and render mix paths.
