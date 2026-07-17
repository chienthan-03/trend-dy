# Remix Dub + Letterbox Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors produce an MP4 from a remake with Vietnamese dub audio (segment-synced TTS or upload) and optional letterbox header/bottom banners — without rebuilding the video from b-roll.

**Architecture:** Extend the existing remix BullMQ pipeline with `remix_tts` + on-demand `remix_render`. Persist source video bytes, assemble a dub track fitted to STT segment windows, mux with FFmpeg (`spawn` pattern already in `remix-audio.util.ts`). Keep package ZIP export; add gated MP4 download. Use separate `renderPhase` so package `pipelinePhase=ready` stays clear.

**Tech Stack:** NestJS, Prisma, BullMQ, FFmpeg CLI, Vitest, Next.js Remake Studio, `@factory/shared` types, existing ObjectStorage

**Spec:** [docs/superpowers/specs/2026-07-17-remix-dub-render-design.md](../specs/2026-07-17-remix-dub-render-design.md)

**Plan defaults (from spec §14):**
- Explicit “Tạo audio VI” button — do **not** auto-enqueue TTS after translate
- MP4 **download** requires `approved_for_export`; in-studio preview stream allowed at `render_ready`
- `bannerJson` independent of `packageJson.banners`
- TTS input = `sourceTranscriptTranslated` only
- ZIP omits MP4 in MVP (dedicated MP4 download)
- Live TTS = OpenAI-compatible `/audio/speech` via `REMIX_TTS_API_URL` (fallback `AI_GATEWAY_URL`) + `REMIX_TTS_API_KEY` / gateway key; `REMIX_TTS_MODE=fake|live`

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/remix-types.ts` | `RemixRenderMode`, `RemixRenderPhase`, `RemixBannerJson`, pipeline phase additions if needed |
| `prisma/schema.prisma` | New columns on `ViralRemake` |
| `apps/api/src/modules/remix/remix-storage.service.ts` | Keys for video / dub / render; put/get/delete |
| `apps/api/src/modules/remix/remix-config.ts` | TTS/render env knobs |
| `apps/api/src/modules/remix/tts/tts.adapter.ts` | Interface + factory |
| `apps/api/src/modules/remix/tts/fake-tts.adapter.ts` | Deterministic silence/tone buffers for tests |
| `apps/api/src/modules/remix/tts/http-tts.adapter.ts` | Live OpenAI-compatible speech |
| `apps/api/src/modules/remix/tts/segment-fit.ts` | Pad / speed / fail per segment |
| `apps/api/src/modules/remix/tts/assemble-dub.ts` | Place fitted clips on timeline |
| `apps/api/src/modules/remix/tts/shorten-segment.ts` | Optional LLM shorten helper for fit retry |
| `apps/api/src/modules/remix/remix-render.service.ts` | FFmpeg audio replace + letterbox |
| `apps/api/src/ai/prompts/remix.banners.v1.ts` | LLM sensational header/bottom |
| `apps/api/src/workers/processors/remix.processor.ts` | `remix_tts`, `remix_render` handlers; persist `mediaVideoKey` on download |
| `apps/api/src/modules/remix/remix.service.ts` | enqueue TTS/render, update fields, upload dub |
| `apps/api/src/modules/remix/remix.controller.ts` | New endpoints |
| `apps/api/src/modules/remix/dto/*` | Update + upload DTOs |
| `apps/api/src/modules/remix/remix-media-cleanup.service.ts` | Delete video/dub/render keys |
| `apps/api/src/modules/usage/ai-job-types.ts` | Budget `remix_tts` (and optionally banner generate) |
| `apps/web/src/components/remix/video-output-panel.tsx` | New UI panel |
| `apps/web/src/app/(app)/remix/[remakeId]/page.tsx` | Wire panel |
| `apps/web/src/lib/api-client.ts` | Client methods |
| `.env.example` | Document new env vars |
| `docs/superpowers/plans/remix-dub-render-smoke-checklist.md` | Manual QA |

---

### Task 1: Shared types + Prisma columns + `renderPhase`

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Modify: `prisma/schema.prisma`
- Modify: `.env.example` (stub section for later tasks)
- Test: extend any existing shared/API type import tests if present; otherwise cover via Task 2 service tests

- [ ] **Step 1: Add shared types**

```ts
export const REMIX_RENDER_MODES = ["audio_only", "banner_audio"] as const;
export type RemixRenderMode = (typeof REMIX_RENDER_MODES)[number];

export const REMIX_RENDER_PHASES = [
  "idle",
  "tts",
  "tts_ready",
  "rendering",
  "render_ready",
  "failed",
] as const;
export type RemixRenderPhase = (typeof REMIX_RENDER_PHASES)[number];

export type RemixBannerJson = {
  header: string;
  bottom: string;
};

export type RemixDubSource = "tts" | "upload";
```

Keep `REMIX_PIPELINE_PHASES` as-is for package pipeline (do **not** overload with render states).

- [ ] **Step 2: Prisma migration fields on `ViralRemake`**

```prisma
  mediaVideoKey          String?  @map("media_video_key")
  mediaDubAudioKey       String?  @map("media_dub_audio_key")
  dubSource              String?  @map("dub_source") // tts | upload
  renderMode             String   @default("audio_only") @map("render_mode")
  renderPhase            String   @default("idle") @map("render_phase")
  bannerJson             Json?    @map("banner_json")
  renderOutputKey        String?  @map("render_output_key")
  ttsVoiceId             String?  @map("tts_voice_id")
  ttsCostUsd             Float?   @map("tts_cost_usd")
  ttsFitFailedIndexes    Int[]    @default([]) @map("tts_fit_failed_indexes")
  renderError            String?  @map("render_error")
```

Also add to shared types:

```ts
export type RemixTtsFitFailure = {
  indexes: number[];
};
```

`GET /viral/remix/:id` must return `ttsFitFailedIndexes` (and other new fields) for the Studio panel.

- [ ] **Step 3: Run migration**

```bash
cd /c/Publish/mock-duyn && pnpm exec prisma migrate dev --name remix_dub_render
```

Expected: migration applied; client generated.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/remix-types.ts prisma/
git commit -m "feat(remix): add dub/render schema and shared types"
```

---

### Task 2: Storage keys + persist `mediaVideoKey` on download

**Files:**
- Modify: `apps/api/src/modules/remix/remix-storage.service.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.ts` (`handleDownloadMedia`)
- Modify: `apps/api/src/modules/remix/remix-media-cleanup.service.ts`
- Test: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`
- Test: `apps/api/src/modules/remix/remix-media-cleanup.service.spec.ts` (create if missing)

- [ ] **Step 1: Extend storage service**

Add:

```ts
videoKey(remakeId: string): string {
  return `remix/${remakeId}/source-video.mp4`;
}
dubAudioKey(remakeId: string): string {
  return `remix/${remakeId}/dub-audio.mp3`;
}
renderKey(remakeId: string): string {
  return `remix/${remakeId}/render.mp4`;
}
```

Plus `putVideo` / `getVideo` / `putDub` / `getDub` / `putRender` / `getRender` / deletes (mirror `putAudio`).

- [ ] **Step 2: Failing test — download persists video key**

In `remix.processor.full-script.spec.ts`, after `handleDownloadMedia`, assert Prisma update includes `mediaVideoKey` matching storage put.

- [ ] **Step 3: Implement — in `handleDownloadMedia`, before extract audio**

```ts
const mediaVideoKey = await this.remixStorage.putVideo(
  remakeId,
  downloaded.buffer,
  downloaded.contentType.startsWith("video/")
    ? downloaded.contentType
    : "video/mp4",
);
// ... extract audio as today ...
data: { mediaVideoKey, mediaAudioKey, mediaExpiresAt, pipelinePhase: "transcribing" }
```

- [ ] **Step 4: Cleanup deletes video/dub/render keys when expired**

Query remakes with `mediaExpiresAt < now` and any of the media keys set; null all keys after delete.

- [ ] **Step 5: Run tests**

```bash
cd apps/api && pnpm test -- remix.processor.full-script remix-media-cleanup
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(remix): persist source video and extend media cleanup"
```

---

### Task 3: Segment fit util (TDD)

**Files:**
- Create: `apps/api/src/modules/remix/tts/segment-fit.ts`
- Create: `apps/api/src/modules/remix/tts/segment-fit.spec.ts`
- Modify: `apps/api/src/modules/remix/remix-config.ts` — `getTtsMaxSpeed()` default `1.25`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { planSegmentFit } from "./segment-fit";

describe("planSegmentFit", () => {
  it("pads when audio shorter than window", () => {
    const plan = planSegmentFit({ audioDurationSec: 2, targetDurationSec: 5, maxSpeed: 1.25 });
    expect(plan).toEqual({ action: "pad", padSec: 3, speed: 1 });
  });

  it("speeds up when slightly longer", () => {
    const plan = planSegmentFit({ audioDurationSec: 5, targetDurationSec: 4, maxSpeed: 1.25 });
    expect(plan.action).toBe("speed");
    expect(plan.speed).toBeCloseTo(1.25, 2);
  });

  it("requests shorten when beyond max speed", () => {
    const plan = planSegmentFit({ audioDurationSec: 10, targetDurationSec: 4, maxSpeed: 1.25 });
    expect(plan.action).toBe("shorten");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/api && pnpm test -- segment-fit.spec.ts
```

- [ ] **Step 3: Implement `planSegmentFit`**

Pure function returning `{ action: "pad" | "speed" | "shorten" | "ok"; speed: number; padSec?: number }`.

- [ ] **Step 4: Add FFmpeg helpers in same module or `segment-fit-ffmpeg.ts`**

`applyPad(buffer, padSec)`, `applyTempo(buffer, speed)` using existing `runFfmpeg` pattern (extract shared `runFfmpeg` from `remix-audio.util.ts` if needed — prefer export helper rather than duplicate).

- [ ] **Step 5: Tests PASS + commit**

```bash
git commit -m "feat(remix): add TTS segment fit planner and ffmpeg pad/tempo"
```

---

### Task 4: TTS adapter (fake + HTTP)

**Files:**
- Create: `apps/api/src/modules/remix/tts/tts.adapter.ts`
- Create: `apps/api/src/modules/remix/tts/fake-tts.adapter.ts`
- Create: `apps/api/src/modules/remix/tts/http-tts.adapter.ts`
- Create: `apps/api/src/modules/remix/tts/tts.adapter.spec.ts`
- Modify: `apps/api/src/modules/remix/remix-config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Interface**

```ts
export type TtsSynthesizeInput = {
  text: string;
  voiceId: string;
};

export type TtsSynthesizeResult = {
  buffer: Buffer;
  contentType: "audio/mpeg";
  durationSec: number;
  costUsd: number;
};

export interface TtsAdapter {
  synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult>;
}

export const createTtsAdapter = async (): Promise<TtsAdapter> => {
  const mode = process.env.REMIX_TTS_MODE ?? "fake";
  if (mode === "fake") return new FakeTtsAdapter();
  if (mode === "live") {
    const { HttpTtsAdapter } = await import("./http-tts.adapter");
    return new HttpTtsAdapter();
  }
  throw new Error(`Unknown REMIX_TTS_MODE "${mode}"`);
};
```

- [ ] **Step 2: Fake adapter**

Generate short MP3 via ffmpeg sine/`anullsrc` or reuse `buildMinimalWav` converted to mp3; duration ≈ `max(0.4, text.length * 0.05)` so fit tests are realistic.

- [ ] **Step 3: HTTP adapter**

`POST {base}/audio/speech` with `{ model, voice, input }` (OpenAI shape); measure duration with ffprobe or parse; cost from `REMIX_TTS_COST_PER_1K_CHARS_USD` env.

- [ ] **Step 4: Tests for factory + fake synthesize returns buffer**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): add pluggable TTS adapter (fake + HTTP speech)"
```

---

### Task 5: Assemble dub + `remix_tts` job

**Files:**
- Create: `apps/api/src/modules/remix/tts/assemble-dub.ts`
- Create: `apps/api/src/modules/remix/tts/assemble-dub.spec.ts`
- Create: `apps/api/src/modules/remix/tts/shorten-segment.ts` (LLM via existing `completeText` / gateway; fake-friendly)
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts` — `enqueueTts(id)`
- Modify: `apps/api/src/modules/remix/remix.controller.ts` — `POST :id/tts`
- Modify: `apps/api/src/modules/usage/ai-job-types.ts` — include `remix_tts`
- Test: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` (new cases)

- [ ] **Step 1: `assembleDubTimeline`**

Input: array of `{ startSec, endSec, fittedMp3Buffer }`, `totalDurationSec`  
Output: single MP3 buffer (ffmpeg concat/`adelay`/`amix` or generate silence track + overlay — pick one approach and document in code comment). Prefer: build filter_complex with `aevalsrc` silence of total duration + `adelay` each clip.

- [ ] **Step 2: `handleTts` processor**

1. Require `sourceTranscriptTranslated`  
2. If `dubSource === "upload"` && `mediaDubAudioKey` → set `renderPhase=tts_ready`, return  
3. Else for each segment: synthesize → plan fit → apply pad/speed → on `shorten`: call shorten once → re-TTS → if still fail collect `fitFailedIndexes`  
4. Assemble → `putDub` → update:
   - `mediaDubAudioKey`, `dubSource=tts`, `ttsCostUsd`
   - `ttsFitFailedIndexes` = collected indexes (empty array if none)
   - `renderPhase=tts_ready` even with partial fit failures (warn via indexes); only `renderPhase=failed` + `renderError` on hard fail (no transcript / TTS provider down / assemble crash)
5. `totalDurationSec` for assemble = `remake.videoDurationSec` (set during STT); if null, use last segment `endSec`
6. Do **not** change package `pipelinePhase`

- [ ] **Step 2b: Fix shared processor `catch` for dub/render jobs**

Today `RemixProcessor.process` catch sets `status: "failed"` + `pipelinePhase: "failed"` for **any** job error. Change it so:

```ts
if (job.name === "remix_tts" || job.name === "remix_render") {
  await this.prisma.viralRemake.update({
    where: { id: remakeId },
    data: {
      renderPhase: "failed",
      renderError: message.slice(0, 500),
      // do NOT touch status / pipelinePhase — package stays intact
    },
  });
} else {
  // existing package-pipeline failure behavior
}
```

Still rethrow (or let BullMQ see failure) so retries work per spec §10.

- [ ] **Step 3: PATCH support for audio_only MVP + enqueue TTS**

Extend `UpdateRemixDto` / `updateRemake` **in this task** (not Task 8) to accept:

- `renderMode?: "audio_only" | "banner_audio"`
- `ttsVoiceId?: string`
- `bannerJson?: { header: string; bottom: string }` (store even before banner render ships)

```ts
async enqueueTts(id: string) {
  // 400 if no translated transcript
  await this.prisma.viralRemake.update({
    where: { id },
    data: {
      renderPhase: "tts",
      renderError: null,
      ttsFitFailedIndexes: [],
    },
  });
  return this.jobsService.enqueue({
    type: "remix_tts",
    payload: { remakeId: id },
    idempotencyKey: `remix_tts:${id}:${Date.now()}`,
  });
}
```

Optional: `POST /tts` body `{ voiceId?: string }` overrides `ttsVoiceId` for that run.

- [ ] **Step 4: Tests with `REMIX_TTS_MODE=fake`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): assemble segment-synced dub via remix_tts job"
```

---

### Task 6: Upload dub override

**Files:**
- Modify: `apps/api/src/modules/remix/remix.controller.ts` — multipart `POST :id/dub-audio`
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/web` later; API tests now
- Test: `apps/api/src/modules/remix/remix.service.spec.ts`

- [ ] **Step 1: Failing test — upload sets dubSource upload and tts_ready**

- [ ] **Step 2: Implement**

Accept `audio/mpeg` / `audio/wav` / `audio/mp4` up to `REMIX_DUB_MAX_UPLOAD_MB` (default 30). Convert wav→mp3 if needed. Store `mediaDubAudioKey`, `dubSource=upload`, `renderPhase=tts_ready`, clear `ttsFitFailedIndexes`. Clear previous render output (`renderOutputKey=null`). If upload duration differs from `videoDurationSec` by >10%, return warning in JSON (`durationMismatch: true`) but **do not** block.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(remix): allow uploading dub audio override"
```

---

### Task 7: Render `audio_only` (FFmpeg) + `remix_render` job + MP4 download

**Files:**
- Create: `apps/api/src/modules/remix/remix-render.service.ts`
- Create: `apps/api/src/modules/remix/remix-render.service.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts` / `remix.controller.ts`
- Modify: `apps/api/src/modules/remix/remix-policy.guard.ts` — reuse `canExport` for download
- Test: processor + service specs

- [ ] **Step 1: `RemixRenderService.renderAudioOnly(video, dub) → mp4 buffer`**

FFmpeg: `-i video -i dub -c:v copy -map 0:v:0 -map 1:a:0 -shortest` (or `-c:a aac`). Fake mode (`REMIX_RENDER_MODE=fake`): return minimal mp4 fixture bytes or skip ffmpeg.

- [ ] **Step 2: `handleRender`**

Require `mediaVideoKey` + `mediaDubAudioKey`. Branch on `renderMode` (Task 8 implements banner branch; for now if `banner_audio` throw clear error “banner_audio not implemented yet” **or** implement Task 8 first).

On success:

```ts
const renderOutputKey = await this.remixStorage.putRender(remakeId, mp4);
await this.prisma.viralRemake.update({
  where: { id: remakeId },
  data: {
    renderOutputKey,
    renderPhase: "render_ready",
    renderError: null,
  },
});
```

Hard failures go through the Task 5 Step 2b catch (`renderPhase=failed` only).

- [ ] **Step 3: API**

```ts
async enqueueRender(id: string) {
  // 400 if missing mediaVideoKey or mediaDubAudioKey
  // 400 if renderMode=banner_audio before Task 8 lands (or implement Task 8 first)
  await this.prisma.viralRemake.update({
    where: { id },
    data: { renderPhase: "rendering", renderError: null },
  });
  return this.jobsService.enqueue({
    type: "remix_render",
    payload: { remakeId: id },
    idempotencyKey: `remix_render:${id}:${Date.now()}`,
  });
}
```

- `POST /viral/remix/:id/render` → enqueue  
- `GET /viral/remix/:id/render` → stream file  
  - If `?download=1` → require `canExport`  
  - Else preview → allow when `renderPhase=render_ready` and session can read remake  

Register `RemixRenderService` in `remix.module.ts` and inject into `RemixProcessor` (update processor test constructors).

- [ ] **Step 4: Tests PASS**

```bash
cd apps/api && pnpm test -- remix-render remix.processor
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): render audio_only MP4 and gated download"
```

---

### Task 8: Letterbox banners + generate hooks + banner render path

**Files:**
- Create: `apps/api/src/ai/prompts/remix.banners.v1.ts` (+ spec)
- Modify: `apps/api/src/modules/remix/remix-render.service.ts` — `renderBannerAudio`
- Modify: `apps/api/src/modules/remix/remix.service.ts` — `generateBanners` (PATCH fields already in Task 5)
- Modify: `apps/api/src/modules/remix/remix.controller.ts` — `POST :id/banners/generate`
- Modify: gateway fake completion for banner prompt if needed

Note: `renderMode` / `bannerJson` / `ttsVoiceId` PATCH already shipped in Task 5. This task only adds generate + FFmpeg letterbox path and removes the Task 7 “banner not implemented” guard.

- [ ] **Step 1: Prompt returns `{ header, bottom }` max ~40 chars each, sensational VI**

- [ ] **Step 2: Letterbox FFmpeg**

Defaults: top/bottom bar height = **10% of source height each** (env `REMIX_LETTERBOX_RATIO=0.10`).  
Filter sketch: `pad=iw:ih+2*bar:0:bar:color=black`, `drawtext` for header/bottom (font from `REMIX_RENDER_FONT_PATH` or ffmpeg default). Escape text for drawtext.

- [ ] **Step 3: Wire `handleRender` for `banner_audio`**

- [ ] **Step 4: Tests for prompt parse + render service with fake mode**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): letterbox banners and AI hook generation"
```

---

### Task 9: Remake Studio Video output UI

**Files:**
- Create: `apps/web/src/components/remix/video-output-panel.tsx`
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/remix/pipeline-status-badge.tsx` (optional: show `renderPhase` chip)

- [ ] **Step 1: API client methods**

Extend remake type with `renderPhase`, `renderError`, `renderMode`, `bannerJson`, `dubSource`, `ttsVoiceId`, `ttsFitFailedIndexes`, `mediaDubAudioKey`, `renderOutputKey`.

Methods: `enqueueTts`, `uploadDubAudio`, `generateBanners`, `enqueueRender`, `getRenderUrl(id, { download })`, `update` for mode/banners/voice.

- [ ] **Step 2: Panel UI**

- Radio: Chỉ audio VI / Banner + audio VI  
- Voice select (2 presets from env-documented ids)  
- Upload audio  
- Banner fields + Generate (disabled unless `banner_audio`)  
- Buttons: Tạo audio VI · Render preview · Download MP4 (disabled unless approved)  
- `<video src={previewUrl} controls />` when `render_ready`  
- Show `renderError` / note about fit failures if API returns them  

- [ ] **Step 3: Poll remake while `renderPhase` in `tts|rendering`**

- [ ] **Step 4: Manual smoke against fake TTS/render locally**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): Remake Studio video output panel for dub/render"
```

---

### Task 10: Env docs + smoke checklist + final verification

**Files:**
- Modify: `.env.example`
- Create: `docs/superpowers/plans/remix-dub-render-smoke-checklist.md`

- [x] **Step 1: Document env**

```env
REMIX_TTS_MODE=fake
REMIX_TTS_API_URL=
REMIX_TTS_API_KEY=
REMIX_TTS_MODEL=tts-1
REMIX_TTS_VOICE=alloy
REMIX_TTS_MAX_SPEED=1.25
REMIX_TTS_COST_PER_1K_CHARS_USD=0.015
REMIX_RENDER_MODE=fake
REMIX_LETTERBOX_RATIO=0.10
REMIX_RENDER_FONT_PATH=
REMIX_DUB_MAX_UPLOAD_MB=30
FFMPEG_PATH=ffmpeg
```

- [x] **Step 2: Smoke checklist**

Paste link → translate ready → Tạo audio VI → preview audio_only → generate banners → banner_audio render → approve → download MP4 → ZIP still works without MP4.

- [x] **Step 3: Run full relevant tests**

```bash
cd apps/api && pnpm test -- remix
```

- [x] **Step 4: Commit**

```bash
git commit -m "docs: dub/render env example and smoke checklist"
```

---

## Out of scope (do not implement in this plan)

- B-roll / text-card remake  
- Lip-sync / voice clone  
- Auto TTS after translate  
- Full SRT burn-in  
- MP4 inside ZIP  
- Replacing Just One  

---

## Execution note

Ship gate: **Tasks 1–7 + 9 (audio_only path)** must work before treating Task 8 as required for MVP demo. Task 8 can follow immediately in the same plan once audio_only is green.
