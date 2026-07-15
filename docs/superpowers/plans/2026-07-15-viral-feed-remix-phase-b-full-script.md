# Viral Feed & Remix Factory — Phase B (Full Script) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase B.1 — download Douyin video audio, run STT (Whisper), and generate a **full Vietnamese recap script** aligned to the entire spoken content of the video, with **timed SRT** from STT segments and export handoff files.

**Architecture:** Extend the existing `remix` BullMQ pipeline after `remix_fetch_detail`. When `REMIX_SCRIPT_MODE=full` and `REMIX_ALLOW_MEDIA_DOWNLOAD=true`, chain `remix_download_media` → `remix_stt` → `remix_generate` using prompt `remix.package.v2` (transcript-aware). Store temp audio in MinIO (7-day TTL). Reuse `OBJECT_STORAGE` from Import module. FFmpeg extracts mono 16kHz WAV for Whisper. Fake adapters for local dev (no real download/STT).

**Tech Stack:** NestJS · Prisma · BullMQ · MinIO (S3) · FFmpeg CLI · OpenAI Whisper API · Vercel AI SDK (`completeText`) · Next.js · Vitest

**Spec:** `docs/superpowers/specs/2026-07-14-viral-feed-remix-factory.md` (§4.2, §10 Phase B weeks 1–2)

---

## Scope boundary

**In Phase B.1 (this plan):**

- Env flags: `REMIX_ALLOW_MEDIA_DOWNLOAD`, `REMIX_SCRIPT_MODE`, `REMIX_STT_*`, `REMIX_MEDIA_TTL_DAYS`
- Prisma fields on `viral_remakes` for transcript + media keys
- Job types: `remix_download_media`, `remix_stt`
- Media download adapter (HTTP from `playUrl`; fake for dev)
- FFmpeg audio extraction utility
- STT gateway (`transcribeAudio`) with fake + live modes
- Prompt `remix.package.v2` — full script from transcript segments
- SRT builder from STT timestamps
- Remake Studio UI: transcript panel, pipeline progress, script mode badge
- Export zip adds `transcript-source.txt`, `transcript-source.srt`, richer `script.txt`
- TTL cleanup cron/worker for expired media blobs
- Tests + E2E for full-script happy path

**Out (Phase B.2 — separate plan later):**

- FFmpeg/Remotion **video render** (preview MP4, banners burned in)
- Preview video player in Remake Studio
- TTS Vietnamese voice

**Exit criteria:** Editor triggers 3 real Douyin links with `REMIX_SCRIPT_MODE=full` → gets VN narration covering **≥90% of video duration** (manual spot-check), SRT cues aligned to STT segments, export zip includes full script + timed subs.

---

## Pipeline comparison

### Phase A (current — caption-only)

```
remix_resolve → remix_fetch_detail → remix_generate (remix.package.v1)
```

Input to LLM: `caption` + `title` only → short guessed script.

### Phase B.1 (full script — this plan)

```
remix_resolve → remix_fetch_detail
    → remix_download_media   (if script_mode=full && allow_download)
    → remix_stt
    → remix_generate         (remix.package.v2, transcript input)
```

Input to LLM: **full source transcript** (segmented) + caption/title as context → long recap narration + timed VN subtitles.

### Backward compatibility

| `REMIX_SCRIPT_MODE` | `REMIX_ALLOW_MEDIA_DOWNLOAD` | Behavior |
|---|---|---|
| `caption` (default) | any | Phase A flow unchanged |
| `full` | `false` | **Reject trigger** with clear error at API |
| `full` | `true` | Full pipeline |

---

## File structure (additions)

```
packages/shared/src/
  remix-types.ts              # + RemixTranscriptV1, RemixScriptMode, new job types
  remix-srt.ts                # secToSrtTimestamp, buildSrtFromSegments
  remix-policy.ts             # (optional) overlap vs transcript

prisma/
  schema.prisma               # + transcript/media fields on ViralRemake
  migrations/

apps/api/src/
  ai/
    gateway.ts                # + transcribeAudio()
    prompts/
      remix.package.v2.ts     # transcript-aware prompt + schema
      remix.package.v2.spec.ts
  modules/remix/
    remix-media.adapter.ts    # download playUrl → Buffer
    adapters/
      fake-remix-media.adapter.ts
      http-remix-media.adapter.ts
    remix-audio.util.ts       # FFmpeg extract WAV
    remix-audio.util.spec.ts
    remix-transcript.service.ts
    remix-media-cleanup.service.ts
    remix.module.ts           # import OBJECT_STORAGE from ImportModule
  workers/processors/
    remix.processor.ts        # + handleDownloadMedia, handleStt
  modules/jobs/job-type-to-queue.ts   # (no change — remix_* already mapped)
  modules/usage/ai-job-types.ts       # + remix_stt

apps/web/src/
  components/remix/
    remake-transcript-panel.tsx
    pipeline-status-badge.tsx
  app/(app)/remix/[remakeId]/page.tsx  # integrate transcript + progress
  lib/api-client.ts                    # + transcript types
```

---

### Task 1: Shared types — transcript, script mode, job types

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Create: `packages/shared/src/remix-srt.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Extend remix job types**

```ts
// packages/shared/src/remix-types.ts
export const REMIX_JOB_TYPES = [
  "remix_resolve",
  "remix_fetch_detail",
  "remix_download_media",
  "remix_stt",
  "remix_generate",
] as const;

export const REMIX_SCRIPT_MODES = ["caption", "full"] as const;
export type RemixScriptMode = (typeof REMIX_SCRIPT_MODES)[number];

export const REMIX_PIPELINE_PHASES = [
  "pending",
  "resolving",
  "fetching_detail",
  "downloading_media",
  "transcribing",
  "generating",
  "ready",
  "failed",
] as const;
export type RemixPipelinePhase = (typeof REMIX_PIPELINE_PHASES)[number];

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type RemixTranscriptV1 = {
  version: 1;
  language: string;          // detected source lang, e.g. "zh"
  durationSec: number;
  segments: RemixTranscriptSegment[];
  fullText: string;          // joined segments
  provider: string;          // "openai" | "fake"
  model: string;             // "whisper-1"
};

// Extend RemixPackageV1 subtitles with timing source (v2 compatible)
export type RemixSubtitlesV2 = RemixPackageV1["subtitles"] & {
  timing_source: "estimated" | "stt";
};
```

- [ ] **Step 2: Add SRT helpers**

```ts
// packages/shared/src/remix-srt.ts
export const secToSrtTimestamp = (sec: number): string => {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const remainder = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(remainder, 3)}`;
};

export const buildSrtFromSegments = (
  segments: Array<{ startSec: number; endSec: number; text: string }>,
): string => {
  if (segments.length === 0) return "";
  return `${segments
    .map(
      (seg, i) =>
        `${i + 1}\n${secToSrtTimestamp(seg.startSec)} --> ${secToSrtTimestamp(seg.endSec)}\n${seg.text.trim()}`,
    )
    .join("\n\n")}\n`;
};
```

- [ ] **Step 3: Add env vars to `.env.example`**

```env
# Phase B — Full script (STT)
REMIX_SCRIPT_MODE=caption          # caption | full
REMIX_ALLOW_MEDIA_DOWNLOAD=false     # must true for full
REMIX_MEDIA_TTL_DAYS=7
REMIX_STT_MODE=fake                  # fake | live
REMIX_STT_MODEL=whisper-1
REMIX_MAX_MEDIA_MB=50
FFMPEG_PATH=ffmpeg
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @factory/shared build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/remix-types.ts packages/shared/src/remix-srt.ts packages/shared/src/index.ts .env.example
git commit -m "feat(remix): add transcript types and SRT helpers for Phase B"
```

---

### Task 2: Prisma schema — transcript + media fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260715100000_add_remix_transcript_media/migration.sql`

- [ ] **Step 1: Add fields to `ViralRemake`**

```prisma
model ViralRemake {
  // ... existing fields ...
  scriptMode         String    @default("caption") @map("script_mode")
  pipelinePhase      String    @default("pending") @map("pipeline_phase")
  sourceTranscript   Json?     @map("source_transcript")
  mediaAudioKey      String?   @map("media_audio_key")
  mediaExpiresAt     DateTime? @map("media_expires_at")
  videoDurationSec   Float?    @map("video_duration_sec")
  sttCostUsd         Float?    @map("stt_cost_usd")

  @@index([mediaExpiresAt])
}
```

- [ ] **Step 2: Generate migration**

Run: `pnpm prisma migrate dev --name add_remix_transcript_media`
Expected: migration applied

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat(remix): persist transcript and media keys on viral_remakes"
```

---

### Task 3: Config guards — script mode validation

**Files:**
- Create: `apps/api/src/modules/remix/remix-config.ts`
- Create: `apps/api/src/modules/remix/remix-config.spec.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/modules/remix/remix-config.spec.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getRemixScriptMode, assertFullScriptAllowed } from "./remix-config";

describe("remix-config", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });
  afterEach(() => {
    process.env = env;
  });

  it("defaults to caption mode", () => {
    delete process.env.REMIX_SCRIPT_MODE;
    expect(getRemixScriptMode()).toBe("caption");
  });

  it("rejects full mode without media download", () => {
    process.env.REMIX_SCRIPT_MODE = "full";
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "false";
    expect(() => assertFullScriptAllowed()).toThrow(/REMIX_ALLOW_MEDIA_DOWNLOAD/);
  });

  it("allows full mode when download enabled", () => {
    process.env.REMIX_SCRIPT_MODE = "full";
    process.env.REMIX_ALLOW_MEDIA_DOWNLOAD = "true";
    expect(() => assertFullScriptAllowed()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter api test apps/api/src/modules/remix/remix-config.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/api/src/modules/remix/remix-config.ts
import { ServiceUnavailableException } from "@nestjs/common";
import type { RemixScriptMode } from "@factory/shared";

export const getRemixScriptMode = (): RemixScriptMode => {
  const raw = process.env.REMIX_SCRIPT_MODE?.trim().toLowerCase();
  return raw === "full" ? "full" : "caption";
};

export const isMediaDownloadAllowed = (): boolean => {
  const raw = process.env.REMIX_ALLOW_MEDIA_DOWNLOAD?.trim().toLowerCase();
  return raw === "true" || raw === "1";
};

export const assertFullScriptAllowed = (): void => {
  if (getRemixScriptMode() !== "full") return;
  if (!isMediaDownloadAllowed()) {
    throw new ServiceUnavailableException(
      "REMIX_SCRIPT_MODE=full requires REMIX_ALLOW_MEDIA_DOWNLOAD=true",
    );
  }
};

export const getMediaTtlDays = (): number => {
  const n = Number(process.env.REMIX_MEDIA_TTL_DAYS ?? "7");
  return Number.isFinite(n) && n > 0 ? n : 7;
};

export const getMaxMediaMb = (): number => {
  const n = Number(process.env.REMIX_MAX_MEDIA_MB ?? "50");
  return Number.isFinite(n) && n > 0 ? n : 50;
};
```

- [ ] **Step 4: Call `assertFullScriptAllowed()` in `RemixService.triggerRemix`**

At start of `triggerRemix`, after `isRemixEnabled()` check:

```ts
assertFullScriptAllowed();
```

Set `scriptMode` on create:

```ts
scriptMode: getRemixScriptMode(),
pipelinePhase: "pending",
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/remix/remix-config.ts apps/api/src/modules/remix/remix-config.spec.ts apps/api/src/modules/remix/remix.service.ts
git commit -m "feat(remix): guard full-script mode behind media download flag"
```

---

### Task 4: Media download adapter

**Files:**
- Create: `apps/api/src/modules/remix/remix-media.adapter.ts`
- Create: `apps/api/src/modules/remix/adapters/fake-remix-media.adapter.ts`
- Create: `apps/api/src/modules/remix/adapters/http-remix-media.adapter.ts`
- Create: `apps/api/src/modules/remix/remix-media.adapter.spec.ts`

- [ ] **Step 1: Define interface**

```ts
// apps/api/src/modules/remix/remix-media.adapter.ts
export type DownloadedMedia = {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
};

export interface RemixMediaAdapter {
  downloadFromPlayUrl(playUrl: string, videoId: string): Promise<DownloadedMedia>;
}

export const createRemixMediaAdapter = async (): Promise<RemixMediaAdapter> => {
  if (!isMediaDownloadAllowed()) {
    throw new Error("Media download is disabled");
  }
  const mode = process.env.REMIX_MEDIA_ADAPTER?.trim() ?? "http";
  if (mode === "fake") {
    const { FakeRemixMediaAdapter } = await import("./adapters/fake-remix-media.adapter");
    return new FakeRemixMediaAdapter();
  }
  const { HttpRemixMediaAdapter } = await import("./adapters/http-remix-media.adapter");
  return new HttpRemixMediaAdapter();
};
```

- [ ] **Step 2: Fake adapter — deterministic tiny MP4 header bytes**

```ts
// fake-remix-media.adapter.ts
// Returns a minimal valid-enough buffer for FFmpeg fake path OR
// skip FFmpeg in fake mode by returning pre-built WAV fixture from disk.
// Prefer: embed small base64 WAV fixture (~1s silence) keyed by videoId hash.
```

- [ ] **Step 3: HTTP adapter**

```ts
// http-remix-media.adapter.ts
// fetch(playUrl, { redirect: "follow", signal: AbortSignal.timeout(120_000) })
// Enforce REMIX_MAX_MEDIA_MB via Content-Length or post-download size check
// Return buffer + contentType
```

- [ ] **Step 4: Unit tests**

- Fake returns buffer > 0
- HTTP adapter rejects oversized (mock fetch)
- `createRemixMediaAdapter` throws when download disabled

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(remix): add pluggable media download adapter"
```

---

### Task 5: FFmpeg audio extraction

**Files:**
- Create: `apps/api/src/modules/remix/remix-audio.util.ts`
- Create: `apps/api/src/modules/remix/remix-audio.util.spec.ts`

- [ ] **Step 1: Write failing test for fake path**

When `FFMPEG_PATH=fake` or `REMIX_STT_MODE=fake`, `extractAudioWav(input: Buffer)` returns input unchanged if already WAV, or uses embedded fixture.

- [ ] **Step 2: Implement FFmpeg spawn**

```ts
// remix-audio.util.ts
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const extractAudioWav = async (videoBuffer: Buffer): Promise<Buffer> => {
  if (process.env.REMIX_STT_MODE === "fake") {
    // Return fixture WAV for tests
    return readFixtureWav();
  }

  const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
  const dir = await mkdtemp(join(tmpdir(), "remix-audio-"));
  const inputPath = join(dir, "input.bin");
  const outputPath = join(dir, "output.wav");

  try {
    await writeFile(inputPath, videoBuffer);
    await runFfmpeg(ffmpeg, [
      "-y", "-i", inputPath,
      "-vn", "-ac", "1", "-ar", "16000",
      "-f", "wav", outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
```

- [ ] **Step 3: Document FFmpeg prerequisite in plan handoff**

Dev machine: `ffmpeg` on PATH or set `FFMPEG_PATH`.
CI: install `ffmpeg` in worker image or skip integration tests with `REMIX_STT_MODE=fake`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): extract 16kHz mono WAV via FFmpeg"
```

---

### Task 6: STT gateway — `transcribeAudio`

**Files:**
- Create: `apps/api/src/ai/stt.ts`
- Create: `apps/api/src/ai/stt.spec.ts`
- Modify: `apps/api/src/ai/gateway.ts` (re-export or delegate)
- Modify: `apps/api/src/modules/usage/ai-job-types.ts`

- [ ] **Step 1: Define result type**

```ts
// apps/api/src/ai/stt.ts
import type { RemixTranscriptV1 } from "@factory/shared";

export type TranscribeAudioResult = {
  transcript: RemixTranscriptV1;
  costUsd: number;
};

export const transcribeAudio = async (
  wavBuffer: Buffer,
  opts?: { languageHint?: string },
): Promise<TranscribeAudioResult> => { /* ... */ };
```

- [ ] **Step 2: Fake mode — deterministic transcript from buffer hash**

Generate 8–12 segments spanning `durationSec` (from env `REMIX_FAKE_DURATION_SEC=60` default) with Chinese placeholder lines. Good enough for UI + LLM pipeline tests.

- [ ] **Step 3: Live mode — OpenAI Whisper**

```ts
const form = new FormData();
form.append("file", new Blob([wavBuffer]), "audio.wav");
form.append("model", process.env.REMIX_STT_MODEL ?? "whisper-1");
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "segment");

const res = await fetch(`${baseUrl}/audio/transcriptions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
});
// Map segments → RemixTranscriptV1
```

- [ ] **Step 4: Cost estimate**

`sttCostUsd = (durationSec / 60) * 0.006` (Whisper approximate; store in usage_events)

- [ ] **Step 5: Add `remix_stt` to `isAiBudgetedJobType`**

- [ ] **Step 6: Tests**

- Fake returns valid `RemixTranscriptV1`
- Parser maps Whisper verbose_json fixture

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(remix): add Whisper STT gateway with fake mode"
```

---

### Task 7: Wire OBJECT_STORAGE into RemixModule

**Files:**
- Modify: `apps/api/src/modules/remix/remix.module.ts`
- Modify: `apps/api/src/modules/import/import.module.ts` (ensure export if not already)
- Create: `apps/api/src/modules/remix/remix-storage.service.ts`

- [ ] **Step 1: Import `ImportModule` in `RemixModule`**

```ts
@Module({
  imports: [PrismaModule, JobsModule, AuthModule, ImportModule],
  // ...
})
```

- [ ] **Step 2: RemixStorageService**

```ts
@Injectable()
export class RemixStorageService {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  audioKey(remakeId: string): string {
    return `remix/${remakeId}/source-audio.wav`;
  }

  async putAudio(remakeId: string, wav: Buffer): Promise<string> {
    const key = this.audioKey(remakeId);
    await this.storage.putObject(key, wav, "audio/wav");
    return key;
  }

  async getAudio(key: string): Promise<Buffer> {
    return this.storage.getObject(key);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(remix): store temp audio in object storage"
```

---

### Task 8: LLM prompt `remix.package.v2` (transcript-aware)

**Files:**
- Create: `apps/api/src/ai/prompts/remix.package.v2.ts`
- Create: `apps/api/src/ai/prompts/remix.package.v2.spec.ts`
- Modify: `apps/api/src/modules/prompts/prompts.service.ts` (seed v2 template)

- [ ] **Step 1: Schema — extend v1**

Key additions to output:

```ts
subtitles: {
  format: "srt",
  timing_source: "stt",  // required when transcript input
  cues: [{ start, end, text }]  // must align to source segment count ±20%
}
transform_notes: {
  input_mode: "transcript_full",
  source_duration_sec: number,
  // ...existing fields
}
script: {
  narration: string,  // MUST cover full video — target chars ≈ duration_sec * 12 (VN speech rate)
  duration_estimate_sec: number,  // ≈ source_duration_sec
  sections: [...]  // one section per ~30–60s of source
}
```

- [ ] **Step 2: Prompt rules (add to system)**

```
- Bạn nhận TRANSCRIPT đầy đủ của video (có timestamp từng đoạn).
- Viết narration tiếng Việt recap TOÀN BỘ nội dung video, không bỏ sót đoạn quan trọng.
- Không dịch word-by-word; viết lại theo phong cách kể chuyện.
- subtitles.cues phải bám timing STT (start/end giữ nguyên hoặc chỉnh nhẹ ≤500ms).
- subtitles.timing_source = "stt".
- Độ dài narration tối thiểu: source_duration_sec * 10 ký tự.
```

- [ ] **Step 3: `buildRemixPromptV2` input**

```ts
export type RemixPromptV2Input = {
  caption: string;
  title: string;
  genre: string;
  locale: string;
  transcript: RemixTranscriptV1;
};
```

User message includes:

```
Transcript segments (JSON):
${JSON.stringify(transcript.segments)}

Full text:
${transcript.fullText}

Duration: ${transcript.durationSec}s
```

- [ ] **Step 4: Seed prompt in PromptsService on startup** (mirror v1 pattern)

- [ ] **Step 5: Tests**

- Parser accepts v2 output with `timing_source: "stt"`
- Prompt includes all segments

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(remix): add transcript-aware remix.package.v2 prompt"
```

---

### Task 9: RemixProcessor — download + STT handlers

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/worker.main.ts` (verify RemixProcessor providers include new services)

- [ ] **Step 1: After `handleFetchDetail`, branch on script mode**

```ts
// In handleFetchDetail, after saving snapshot:
const scriptMode = remake.scriptMode ?? getRemixScriptMode();

if (scriptMode === "full") {
  await this.jobsService.enqueue({
    type: "remix_download_media",
    payload: { remakeId },
  });
  await this.prisma.viralRemake.update({
    where: { id: remakeId },
    data: { pipelinePhase: "downloading_media" },
  });
} else {
  await this.jobsService.enqueue({
    type: "remix_generate",
    payload: { remakeId },
  });
}
```

- [ ] **Step 2: `handleDownloadMedia`**

```ts
private async handleDownloadMedia(jobId: string, payload: { remakeId: string }) {
  const remake = await this.remixService.getRemake(payload.remakeId);
  const snapshot = remake.sourceSnapshot as Record<string, unknown>;
  const playUrl = typeof snapshot.playUrl === "string" ? snapshot.playUrl : null;
  if (!playUrl) throw new Error("No playUrl in source snapshot");

  const mediaAdapter = await createRemixMediaAdapter();
  const downloaded = await mediaAdapter.downloadFromPlayUrl(playUrl, remake.externalVideoId);
  const wav = await extractAudioWav(downloaded.buffer);
  const key = await this.remixStorage.putAudio(remake.id, wav);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + getMediaTtlDays());

  await this.prisma.viralRemake.update({
    where: { id: remake.id },
    data: {
      mediaAudioKey: key,
      mediaExpiresAt: expiresAt,
      pipelinePhase: "transcribing",
    },
  });

  await this.jobsService.enqueue({
    type: "remix_stt",
    payload: { remakeId: remake.id },
  });
}
```

- [ ] **Step 3: `handleStt`**

```ts
private async handleStt(jobId: string, payload: { remakeId: string }) {
  const remake = await this.remixService.getRemake(payload.remakeId);
  if (!remake.mediaAudioKey) throw new Error("No media audio key");

  const wav = await this.remixStorage.getAudio(remake.mediaAudioKey);
  const { transcript, costUsd } = await transcribeAudio(wav);

  await this.prisma.viralRemake.update({
    where: { id: remake.id },
    data: {
      sourceTranscript: transcript as Prisma.InputJsonValue,
      videoDurationSec: transcript.durationSec,
      sttCostUsd: costUsd,
      pipelinePhase: "generating",
    },
  });

  await this.prisma.usageEvent.create({
    data: { jobId, provider: transcript.provider, model: transcript.model, costUsd },
  });

  await this.jobsService.enqueue({
    type: "remix_generate",
    payload: { remakeId: remake.id },
  });
}
```

- [ ] **Step 4: Update `handleGenerate` to pick v1 vs v2**

```ts
const scriptMode = remake.scriptMode ?? "caption";
const transcript = remake.sourceTranscript as RemixTranscriptV1 | null;

if (scriptMode === "full") {
  if (!transcript) throw new Error("Full script mode requires sourceTranscript");
  const template = await this.promptsService.getActiveTemplate("remix.package.v2");
  const { user } = buildRemixPromptV2({ caption, title, genre, locale, transcript });
  // ... completeText, parseRemixPackageV2Json
} else {
  // existing v1 path
}
```

On success: `pipelinePhase: "ready"`, `status: "ready"`.

- [ ] **Step 5: Update fake Douyin adapter to include `playUrl`**

```ts
// fake-douyin-video.adapter.ts — add:
playUrl: `https://example.test/fake/${videoId}/play.mp4`,
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(remix): chain download → STT → generate for full script mode"
```

---

### Task 10: Regenerate respects script mode

**Files:**
- Modify: `apps/api/src/modules/remix/remix.service.ts`

- [ ] **Step 1: `regenerate` re-enqueues correct job**

```ts
async regenerate(id: string): Promise<TriggerRemixResult> {
  const remake = await this.getRemake(id);
  const scriptMode = remake.scriptMode ?? getRemixScriptMode();

  // If transcript exists, only re-run generate (cheaper)
  const jobType =
    scriptMode === "full" && remake.sourceTranscript
      ? "remix_generate"
      : scriptMode === "full"
        ? "remix_download_media"  // full re-pipeline
        : "remix_generate";

  // ...enqueue jobType, set status running, pipelinePhase accordingly
}
```

- [ ] **Step 2: Add `retranscribe(id)` optional endpoint** (re-run STT only, keep media)

`POST /remix/:id/retranscribe` → enqueue `remix_stt` if `mediaAudioKey` exists.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(remix): regenerate and retranscribe for full script mode"
```

---

### Task 11: Export — full script + source SRT

**Files:**
- Modify: `apps/api/src/modules/remix/remix-export.service.ts`
- Modify: `apps/api/src/modules/remix/remix-export.service.spec.ts`

- [ ] **Step 1: Include transcript files when present**

```ts
// In createZipStream, accept optional transcript
if (transcript) {
  archive.append(transcript.fullText, { name: "transcript-source.txt" });
  archive.append(buildSrtFromSegments(transcript.segments), {
    name: "transcript-source.srt",
  });
}
archive.append(pkg.script.narration, { name: "script-full.txt" });
// Keep script.txt as alias for backward compat
```

- [ ] **Step 2: Validate full-script export has `timing_source: "stt"`** (warning only)

- [ ] **Step 3: Tests**

- Zip contains `transcript-source.srt` when transcript present
- SRT cue count matches segment count

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): export source transcript and full script in zip"
```

---

### Task 12: REST API — transcript endpoint

**Files:**
- Modify: `apps/api/src/modules/remix/remix.controller.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: `GET /remix/:id/transcript`**

Returns `RemixTranscriptV1 | null` + `pipelinePhase` + `videoDurationSec`.

- [ ] **Step 2: `POST /remix/:id/retranscribe`**

Admin/editor only; requires existing `mediaAudioKey`.

- [ ] **Step 3: Include `scriptMode` and `pipelinePhase` in list/get responses** (already on model — expose in API client types)

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): expose transcript and pipeline status via API"
```

---

### Task 13: Remake Studio UI — transcript panel + progress

**Files:**
- Create: `apps/web/src/components/remix/remake-transcript-panel.tsx`
- Create: `apps/web/src/components/remix/pipeline-status-badge.tsx`
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`
- Modify: `apps/web/src/components/remix/remake-editor.tsx`

- [ ] **Step 1: Pipeline status badge**

Show phases with Vietnamese labels:

| Phase | Label |
|---|---|
| `downloading_media` | Đang tải video… |
| `transcribing` | Đang nhận dạng giọng nói… |
| `generating` | AI đang viết script… |
| `ready` | Sẵn sàng |

Poll `api.remix.get` every 3s while not `ready`/`failed`.

- [ ] **Step 2: Transcript panel** (read-only)

- Collapsible "Transcript gốc (STT)"
- Show `fullText` + segment list with timestamps
- Badge: `Script mode: Đầy đủ (STT)` vs `Caption only`
- Duration: `videoDurationSec`

- [ ] **Step 3: Editor hints**

When `timing_source === "stt"`, subtitle preview label: "Phụ đề (timing từ STT)".

Show narration char count vs target (`duration * 10`).

- [ ] **Step 4: Re-run AI button tooltip**

"Chạy lại AI từ transcript" when full mode + transcript exists.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): Remake Studio transcript panel and pipeline progress"
```

---

### Task 14: Media TTL cleanup

**Files:**
- Create: `apps/api/src/modules/remix/remix-media-cleanup.service.ts`
- Modify: `apps/api/src/workers/worker.main.ts` or add cron in API bootstrap

- [ ] **Step 1: Daily job `remix_cleanup_media`**

```ts
// Find viral_remakes where mediaExpiresAt < now() AND mediaAudioKey IS NOT NULL
// Delete S3 object, set mediaAudioKey = null (keep sourceTranscript)
```

- [ ] **Step 2: Register repeatable BullMQ job** (every 24h) or run on worker startup schedule

- [ ] **Step 3: Test**

- Expired remake → key cleared, transcript preserved

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(remix): TTL cleanup for temp audio blobs"
```

---

### Task 15: Integration tests + E2E

**Files:**
- Modify: `apps/api/src/modules/remix/remix.e2e.spec.ts`
- Create: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 1: E2E full-script happy path (fake adapters)**

Env for test:

```env
REMIX_SCRIPT_MODE=full
REMIX_ALLOW_MEDIA_DOWNLOAD=true
REMIX_STT_MODE=fake
REMIX_MEDIA_ADAPTER=fake
DOUYIN_ADAPTER=fake
LLM_MODE=fake
```

Flow:

1. `POST /remix/trigger` with share URL
2. Wait for jobs: `remix_resolve` → `remix_fetch_detail` → `remix_download_media` → `remix_stt` → `remix_generate`
3. Assert `sourceTranscript` populated
4. Assert `packageJson.script.narration.length` > 200
5. Assert `subtitles.timing_source === "stt"`
6. Approve + export → zip contains `transcript-source.srt`

- [ ] **Step 2: E2E rejects full mode without download flag**

- [ ] **Step 3: Run full API test suite**

Run: `pnpm --filter api test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "test(remix): E2E coverage for full-script pipeline"
```

---

### Task 16: Ops handoff + smoke checklist

**Files:**
- Create: `docs/superpowers/plans/phase-b-full-script-smoke-checklist.md`
- Modify: `docs/superpowers/specs/2026-07-14-viral-feed-remix-factory.md` (add link to plan — optional one line)

- [ ] **Step 1: Smoke checklist**

```markdown
## Phase B.1 smoke (full script)

Prerequisites:
- [ ] MinIO running (`pnpm dev:infra` or docker-compose)
- [ ] FFmpeg installed (`ffmpeg -version`)
- [ ] `.env`: REMIX_SCRIPT_MODE=full, REMIX_ALLOW_MEDIA_DOWNLOAD=true
- [ ] `.env`: REMIX_STT_MODE=live, OPENAI_API_KEY set (or gateway)
- [ ] `.env`: DOUYIN_ADAPTER=live, DOUYIN_API_TOKEN set

Steps:
1. Paste real Douyin link → Chế biến
2. Jobs page shows download → STT → generate
3. Remake Studio shows transcript gốc + script dài
4. Approve → Export zip has transcript-source.srt + script-full.txt
5. Spot-check: narration covers end of video (compare last STT segment)
```

- [ ] **Step 2: Cost expectations**

| Step | Approx cost (3-min video) |
|---|---|
| STT Whisper | ~$0.018 |
| LLM generate v2 | ~$0.05–0.15 |
| Just One API | per existing plan |

- [ ] **Step 3: Commit**

```bash
git commit -m "docs(remix): Phase B full-script smoke checklist"
```

---

## Policy & compliance notes (implement in Task 9)

- Media download **off by default** (`REMIX_ALLOW_MEDIA_DOWNLOAD=false`).
- Full script mode **requires explicit admin opt-in** (both env flags).
- Audio blobs TTL **7 days**; transcript JSON kept for editor reference.
- `usage_policy=blocked` viral items still cannot trigger remix (existing guard).
- Policy checklist unchanged — editor still confirms rewrite + no re-upload.
- Add automated warning if `literalOverlapRatio(transcript.fullText, narration) > 0.5` (advisory).

---

## Risk register

| Risk | Mitigation |
|---|---|
| `playUrl` expired / geo-blocked | Surface clear error in `remix_download_media`; retry button |
| FFmpeg not installed | Startup health check log warning; fake mode for dev |
| Whisper cost on long videos | `REMIX_MAX_MEDIA_MB` + duration cap (e.g. 10 min) |
| LLM output too short vs transcript | v2 prompt min-length rule + UI char count warning |
| Douyin ToS | Metadata + temp audio only; TTL; no permanent video archive |

---

## Timeline estimate

| Week | Tasks |
|---|---|
| 1 | Tasks 1–7 (types, schema, download, FFmpeg, STT, storage) |
| 2 | Tasks 8–11 (prompt v2, processor chain, export) |
| 3 | Tasks 12–16 (API, UI, cleanup, tests, docs) |

**Total: ~3 weeks** for Phase B.1 (full script). Phase B.2 (video render) adds ~2–3 weeks per spec.

---

## Phase B.2 preview (not in this plan)

When full script is stable, next plan covers:

- `remix_render` job (FFmpeg: hook card + burn subs + banners)
- Preview player in Remake Studio
- Export zip includes `preview.mp4`

---

*Plan complete. Do not start Phase B.2 until Phase B.1 exit criteria met.*
