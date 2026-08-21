# Douyin yt-dlp paste-link Implementation Plan

> **For agentic workers:** Use executing-plans. Do not commit unless the user asks.

**Goal:** Paste Douyin share URLs download via yt-dlp (with cookies) instead of Just One API.

**Architecture:** New `ytdlp-video.provider` + `YtdlpDouyinVideoAdapter`. Factory picks ytdlp when `DOUYIN_VIDEO_PROVIDER=ytdlp` and adapter is not fake. Download uses `sourceUrl`, not CDN `playUrl`. Ranking stays Just One.

**Tech Stack:** Node spawn, yt-dlp CLI, Vitest, Nest remix processor.

---

### Task 1: Cookie args + JSON map + provider

**Files:**
- Create: `apps/api/src/modules/remix/adapters/live/ytdlp-video.provider.ts`
- Test: `apps/api/src/modules/remix/adapters/live/ytdlp-video.provider.spec.ts`

- [ ] Tests first: cookie flags, map `-j` JSON, auth hint, `isYtdlpVideoProvider`
- [ ] Implement provider (injectable runner for spawn in tests)

### Task 2: Adapter factory

**Files:**
- Modify: `apps/api/src/modules/remix/douyin-video.adapter.ts`
- Create: `apps/api/src/modules/remix/adapters/live/ytdlp-douyin-video.adapter.ts`
- Test: `apps/api/src/modules/remix/douyin-video.adapter.spec.ts`

### Task 3: Download + redownload

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Test: `apps/api/src/modules/remix/remix.service.spec.ts`
- Test: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

### Task 4: Env docs

**Files:** `.env.example`, `.gitignore` (`secrets/`), `.env` (local provider vars only)
