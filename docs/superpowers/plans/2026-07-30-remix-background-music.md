# Remix Background Music (BGM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors pick a curated background music track (with preview) and volume per remake; render outputs VI dub + looped BGM with original video audio muted.

**Architecture:** Six MP3s + `manifest.json` under `apps/api/assets/remix/bgm/`. `RemixBgmService` loads manifest and streams previews. Persist `bgmTrackId` + `bgmVolume` on `ViralRemake`. `RemixRenderService` optionally `amix` dub + looped BGM. Studio `BgmPicker` lists tracks with «Nghe thử» before radio select; PATCH invalidates render only.

**Tech Stack:** NestJS, Prisma, FFmpeg, Vitest, Next.js Remake Studio, `@factory/shared`

**Spec:** [docs/superpowers/specs/2026-07-30-remix-background-music-design.md](../specs/2026-07-30-remix-background-music-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/assets/remix/bgm/manifest.json` | Track catalog (id, label, file) |
| `apps/api/assets/remix/bgm/*.mp3` | Six BGM files (renamed by id) |
| `packages/shared/src/remix-types.ts` | `REMIX_BGM_TRACK_IDS`, `RemixBgmTrack` |
| `apps/api/src/modules/remix/remix-bgm.service.ts` | Load manifest, resolve files, list tracks |
| `apps/api/src/modules/remix/remix-bgm.service.spec.ts` | Manifest + validation tests |
| `apps/api/src/modules/remix/remix-bgm-mix.ts` | `buildBgmMixFilterComplex`, default volume |
| `apps/api/src/modules/remix/remix-bgm-mix.spec.ts` | Filter expression tests |
| `apps/api/src/modules/remix/remix-config.ts` | Optional `getBgmDefaultVolume()` |
| `prisma/schema.prisma` + migration | `bgmTrackId`, `bgmVolume` columns |
| `apps/api/src/modules/remix/dto/update-remix.dto.ts` | PATCH fields + validation |
| `apps/api/src/modules/remix/remix.service.ts` | Persist BGM fields + `invalidateRenderOnly` |
| `apps/api/src/modules/remix/remix.service.spec.ts` | Invalidation tests |
| `apps/api/src/modules/remix/remix.controller.ts` | `GET /bgm`, `GET /bgm/:id/preview` (before `:id`) |
| `apps/api/src/modules/remix/remix.module.ts` | Register `RemixBgmService` |
| `apps/api/src/modules/remix/remix-render.service.ts` | Optional BGM in ffmpeg graph |
| `apps/api/src/modules/remix/remix-render.service.spec.ts` | Fake mode + filter wiring |
| `apps/api/src/workers/processors/remix.processor.ts` | Pass BGM into render |
| `apps/api/src/workers/processors/remix.processor.spec.ts` | Render with BGM |
| `apps/web/src/lib/api-client.ts` | Types, `listBgm`, `getBgmPreviewUrl`, PATCH fields |
| `apps/web/src/components/remix/bgm-picker.tsx` | Preview UI + volume slider |
| `apps/web/src/components/remix/video-output-panel.tsx` | Mount `BgmPicker` |

---

### Task 1: Ops assets + manifest

**Files:**
- Create: `apps/api/assets/remix/bgm/manifest.json`
- Create: `apps/api/assets/remix/bgm/*.mp3` (six files)

- [ ] **Step 1: Create manifest**

```json
{
  "tracks": [
    { "id": "bad-style-time-back", "label": "Bad Style — Time Back", "file": "bad-style-time-back.mp3" },
    { "id": "asphyxia", "label": "Asphyxia (逆時針向)", "file": "asphyxia.mp3" },
    { "id": "xomu-lanterns", "label": "Xomu — Lanterns", "file": "xomu-lanterns.mp3" },
    { "id": "late-night-melancholy", "label": "Late Night Melancholy", "file": "late-night-melancholy.mp3" },
    { "id": "else-paris", "label": "Else — Paris", "file": "else-paris.mp3" },
    { "id": "shiverr-whize", "label": "Shiverr — Whize", "file": "shiverr-whize.mp3" }
  ]
}
```

- [ ] **Step 2: Copy and rename MP3s**

From ops Downloads (adjust paths if different):

```bash
BGM_DIR="apps/api/assets/remix/bgm"
mkdir -p "$BGM_DIR"
cp "/c/Users/hampe/Downloads/Bad Style - Time Back 【Tiktok Song】 [6utRlET4V6A].mp3" "$BGM_DIR/bad-style-time-back.mp3"
cp "/c/Users/hampe/Downloads/逆時針向 - Asphyxia [kSJ0Nqfhiec].mp3" "$BGM_DIR/asphyxia.mp3"
cp "/c/Users/hampe/Downloads/Xomu - Lanterns [L17njonbcT0].mp3" "$BGM_DIR/xomu-lanterns.mp3"
cp "/c/Users/hampe/Downloads/Rude Boy White Cherry - Late Night Melancholy (Official Video).mp3" "$BGM_DIR/late-night-melancholy.mp3"
cp "/c/Users/hampe/Downloads/Else - Paris.mp3" "$BGM_DIR/else-paris.mp3"
cp "/c/Users/hampe/Downloads/Shiverr - Whize _ Nhạc nền kinh dị gây ám ảnh Tiktok [7YgntHOCdpk].mp3" "$BGM_DIR/shiverr-whize.mp3"
```

- [ ] **Step 3: Verify files**

```bash
ls -lh apps/api/assets/remix/bgm/
```

Expected: 6 mp3 files + manifest.json, each mp3 ~3–5 MB.

- [ ] **Step 4: Commit** (when user approves commit)

```bash
git add apps/api/assets/remix/bgm/
git commit -m "chore(remix): add curated BGM asset library"
```

---

### Task 2: Shared BGM types

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Modify: `packages/shared/src/index.ts` (if exports are explicit)

- [ ] **Step 1: Add types**

In `remix-types.ts` after `RemixDubSource`:

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

export const REMIX_BGM_DEFAULT_VOLUME = 0.3;
```

- [ ] **Step 2: Build shared package**

Run: `pnpm --filter @factory/shared build`

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/remix-types.ts packages/shared/src/index.ts
git commit -m "feat(shared): remix BGM track ids and types"
```

---

### Task 3: BGM mix filter helper

**Files:**
- Create: `apps/api/src/modules/remix/remix-bgm-mix.ts`
- Create: `apps/api/src/modules/remix/remix-bgm-mix.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { buildBgmMixFilterComplex, resolveBgmVolume } from "./remix-bgm-mix";

describe("buildBgmMixFilterComplex", () => {
  it("includes volume and amix with duration=first", () => {
    const filter = buildBgmMixFilterComplex(0.3);
    expect(filter).toContain("[2:a]volume=0.3[bgm]");
    expect(filter).toContain("[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]");
  });
});

describe("resolveBgmVolume", () => {
  it("defaults null to 0.3", () => {
    expect(resolveBgmVolume(null)).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-bgm-mix.spec.ts`

- [ ] **Step 3: Implement**

```ts
import { REMIX_BGM_DEFAULT_VOLUME } from "@factory/shared";

export const resolveBgmVolume = (persisted: number | null | undefined): number => {
  if (persisted == null) return REMIX_BGM_DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, persisted));
};

export const buildBgmMixFilterComplex = (volume: number): string =>
  `[2:a]volume=${volume}[bgm];[1:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/remix-bgm-mix.ts apps/api/src/modules/remix/remix-bgm-mix.spec.ts
git commit -m "feat(remix): BGM amix filter helper"
```

---

### Task 4: RemixBgmService

**Files:**
- Create: `apps/api/src/modules/remix/remix-bgm.service.ts`
- Create: `apps/api/src/modules/remix/remix-bgm.service.spec.ts`
- Modify: `apps/api/src/modules/remix/remix.module.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("RemixBgmService", () => {
  it("lists 6 tracks with preview paths", async () => {
    const tracks = await service.listTracks();
    expect(tracks).toHaveLength(6);
    expect(tracks[0].previewUrl).toContain("/viral/remix/bgm/");
    expect(tracks[0].previewUrl).toContain("/preview");
  });

  it("reads buffer for valid track id", async () => {
    const buffer = await service.readTrackBuffer("else-paris");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("throws for unknown track id", async () => {
    await expect(service.readTrackBuffer("unknown")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-bgm.service.spec.ts`

- [ ] **Step 3: Implement service**

Resolve assets dir relative to compiled source or use `join(process.cwd(), "apps/api/assets/remix/bgm")` — match how other API assets are resolved in this repo (check `remix-config` / font path pattern).

```ts
@Injectable()
export class RemixBgmService {
  listTracks(): RemixBgmTrack[] { /* parse manifest, attach previewUrl */ }
  assertTrackId(id: string): RemixBgmTrackId { /* validate against REMIX_BGM_TRACK_IDS */ }
  readTrackBuffer(trackId: RemixBgmTrackId): Promise<Buffer> { /* readFile */ }
  getPreviewStream(trackId: RemixBgmTrackId): { stream: ReadStream; size: number } { /* createReadStream */ }
}
```

`previewUrl` format: `/api/v1/viral/remix/bgm/${id}/preview` (web prefixes `API_BASE`).

- [ ] **Step 4: Register in `remix.module.ts`**

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/remix/remix-bgm.service.ts apps/api/src/modules/remix/remix-bgm.service.spec.ts apps/api/src/modules/remix/remix.module.ts
git commit -m "feat(remix): RemixBgmService for manifest and preview"
```

---

### Task 5: Prisma columns

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via Prisma

- [ ] **Step 1: Add columns to `ViralRemake`**

```prisma
bgmTrackId  String? @map("bgm_track_id")
bgmVolume   Float?  @map("bgm_volume")
```

- [ ] **Step 2: Migrate**

Run: `pnpm exec prisma migrate dev --name add_viral_remake_bgm_fields`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add viral_remakes bgm_track_id and bgm_volume"
```

---

### Task 6: PATCH + render-only invalidation

**Files:**
- Modify: `apps/api/src/modules/remix/dto/update-remix.dto.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/api/src/modules/remix/remix.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

```ts
it("persists bgmTrackId and invalidates render only when track changes", async () => {
  // existing: mediaDubAudioKey set, renderOutputKey set, renderPhase render_ready
  await service.updateRemake("remake_1", { bgmTrackId: "else-paris" });
  expect(prisma.viralRemake.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        bgmTrackId: "else-paris",
        renderOutputKey: null,
        renderPhase: "tts_ready",
        mediaDubAudioKey: expect.anything(), // NOT cleared
      }),
    }),
  );
});

it("does not invalidate when bgm fields unchanged", async () => {
  // same bgmTrackId + bgmVolume → no renderOutputKey clear
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix.service.spec.ts -t "bgm"

- [ ] **Step 3: Update DTO**

```ts
import { REMIX_BGM_TRACK_IDS } from "@factory/shared";

@IsOptional()
@ValidateIf((_o, v) => v != null)
@IsIn([...REMIX_BGM_TRACK_IDS])
bgmTrackId?: RemixBgmTrackId | null;

@IsOptional()
@ValidateIf((_o, v) => v != null)
@IsNumber()
@Min(0)
@Max(1)
bgmVolume?: number | null;
```

- [ ] **Step 4: Update `updateRemake`**

Add `invalidateRenderOnly` helper (export from service or small util):

```ts
const invalidateRenderOnly = (hasDub: boolean) => ({
  renderOutputKey: null,
  renderPhase: hasDub ? "tts_ready" : "idle",
  renderError: null,
});
```

When `bgmTrackId` or `bgmVolume` changes (compare to existing), spread `invalidateRenderOnly(Boolean(existing.mediaDubAudioKey))`.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/remix/dto/update-remix.dto.ts apps/api/src/modules/remix/remix.service.ts apps/api/src/modules/remix/remix.service.spec.ts
git commit -m "feat(api): persist remake BGM fields with render-only invalidation"
```

---

### Task 7: BGM list + preview endpoints

**Files:**
- Modify: `apps/api/src/modules/remix/remix.controller.ts`

- [ ] **Step 1: Add routes BEFORE `@Get(':id')`**

```ts
@Get("bgm")
listBgmTracks() {
  return { tracks: this.remixBgmService.listTracks() };
}

@Get("bgm/:trackId/preview")
async streamBgmPreview(
  @Param("trackId") trackId: string,
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
) {
  const id = this.remixBgmService.assertTrackId(trackId);
  const { stream, size } = this.remixBgmService.getPreviewStream(id);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Accept-Ranges", "bytes");
  // optional: reuse parseBytesRange from same file for Range support
  return new StreamableFile(stream);
}
```

Inject `RemixBgmService` in controller constructor.

- [ ] **Step 2: Manual smoke**

With API running and session cookie:

```bash
curl -s -b cookies.txt http://localhost:3001/api/v1/viral/remix/bgm | jq '.tracks | length'
# expect 6

curl -sI -b cookies.txt http://localhost:3001/api/v1/viral/remix/bgm/else-paris/preview
# expect Content-Type: audio/mpeg
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/remix/remix.controller.ts
git commit -m "feat(api): BGM catalog list and preview stream"
```

---

### Task 8: Render service — mix dub + BGM

**Files:**
- Modify: `apps/api/src/modules/remix/remix-render.service.ts`
- Modify: `apps/api/src/modules/remix/remix-render.service.spec.ts`

- [ ] **Step 1: Extend render method signatures**

```ts
type BgmMixInput = { buffer: Buffer; volume: number };

async renderAudioOnly(
  videoBuffer: Buffer,
  dubAudioBuffer: Buffer,
  bgm?: BgmMixInput,
): Promise<Buffer>

async renderBannerAudio(
  videoBuffer: Buffer,
  dubAudioBuffer: Buffer,
  banners: RemixBannerJson,
  bgm?: BgmMixInput,
): Promise<Buffer>
```

- [ ] **Step 2: Implement ffmpeg branch when `bgm` present**

`renderAudioOnlyWithFfmpeg`:

```ts
await writeFile(bgmPath, bgm.buffer);
const filter = buildBgmMixFilterComplex(bgm.volume);
await runFfmpeg(ffmpeg, [
  "-y", "-i", videoPath, "-i", audioPath,
  "-stream_loop", "-1", "-i", bgmPath,
  "-filter_complex", filter,
  "-map", "0:v:0", "-map", "[aout]",
  "-c:v", "copy", "-c:a", "aac",
  "-movflags", "+faststart", "-shortest", "-f", "mp4", outputPath,
]);
```

`renderBannerAudioWithFfmpeg`: same audio inputs/filter; keep existing `-filter:v` for letterbox (video filter separate from audio — use `-filter_complex` for audio + `-filter:v` for video, or combine carefully).

**NestJS/ffmpeg note:** For banner mode, use:

```text
-filter_complex "[2:a]volume=...[bgm];[1:a][bgm]amix=...[aout]"
-filter:v "pad=...,drawtext=..."
-map 0:v:0 -map [aout]
```

- [ ] **Step 3: Fake mode unchanged**

When `REMIX_RENDER_MODE=fake`, return fixtures without reading BGM.

- [ ] **Step 4: Run render service tests**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-render.service.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/remix-render.service.ts apps/api/src/modules/remix/remix-render.service.spec.ts
git commit -m "feat(remix): mix looped BGM under dub at render"
```

---

### Task 9: Worker handleRender

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.spec.ts`

- [ ] **Step 1: Write failing processor test**

Mock remake with `bgmTrackId: "else-paris"`, `bgmVolume: 0.25` → `renderAudioOnly` called with `bgm` arg.

- [ ] **Step 2: Update `handleRender`**

```ts
let bgm: BgmMixInput | undefined;
if (remake.bgmTrackId) {
  const trackId = this.remixBgmService.assertTrackId(remake.bgmTrackId);
  const buffer = await this.remixBgmService.readTrackBuffer(trackId);
  bgm = { buffer, volume: resolveBgmVolume(remake.bgmVolume) };
}

const renderedBuffer =
  remake.renderMode === "banner_audio"
    ? await this.remixRender.renderBannerAudio(videoBuffer, dubBuffer, banners, bgm)
    : await this.remixRender.renderAudioOnly(videoBuffer, dubBuffer, bgm);
```

Inject `RemixBgmService` into processor (export from RemixModule).

- [ ] **Step 3: Run processor tests**

Run: `pnpm --filter api exec vitest run src/workers/processors/remix.processor.spec.ts -t "bgm"

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/processors/remix.processor.ts apps/api/src/workers/processors/remix.processor.spec.ts
git commit -m "feat(worker): pass remake BGM into render"
```

---

### Task 10: Web API client

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Extend `ViralRemake`**

```ts
bgmTrackId?: RemixBgmTrackId | null;
bgmVolume?: number | null;
```

- [ ] **Step 2: Extend `remix.update` body**

```ts
bgmTrackId?: RemixBgmTrackId | null;
bgmVolume?: number | null;
```

- [ ] **Step 3: Add BGM helpers**

```ts
listBgm: () => apiFetch<{ tracks: RemixBgmTrack[] }>("/viral/remix/bgm"),
getBgmPreviewUrl: (trackId: RemixBgmTrackId) =>
  `${API_BASE}/viral/remix/bgm/${trackId}/preview`,
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts
git commit -m "feat(web): api client for remix BGM"
```

---

### Task 11: BgmPicker UI (preview + select + volume)

**Files:**
- Create: `apps/web/src/components/remix/bgm-picker.tsx`
- Modify: `apps/web/src/components/remix/video-output-panel.tsx`

- [ ] **Step 1: Create `BgmPicker`**

Props: `remake`, `onRemakeUpdated`, `onInfo`, `onError`, `disabled?`

Behavior:

- `useEffect` → `api.remix.listBgm()`  
- Radio group: «Không dùng nhạc nền» (`null`) + each track  
- Per row: label + button «Nghe thử» / «Dừng»  
- Single `audioRef` — playing new track stops previous  
- Radio change → `api.remix.update(id, { bgmTrackId })` — **no auto-play**  
- Volume slider 0–100, `value = Math.round((remake.bgmVolume ?? 0.3) * 100)`  
- Debounced PATCH `bgmVolume` (divide by 100)  
- Selected row: `ring-1 ring-blue-300 bg-blue-50`  
- Hint text per spec §8  

Accessibility: `aria-label` on radios, play buttons, slider; keyboard focus on rows.

- [ ] **Step 2: Mount in `video-output-panel.tsx`**

Place fieldset after TTS speed controls, before Banner fieldset:

```tsx
<BgmPicker
  remake={remake}
  onRemakeUpdated={onRemakeUpdated}
  onInfo={onInfo}
  onError={onError}
/>
```

- [ ] **Step 3: Manual QA**

1. Open Remake Studio → Video output  
2. Bấm «Nghe thử» trên 2–3 bài — chỉ một bài phát  
3. Chọn bài + chỉnh volume → remake PATCH OK  
4. Render → MP4 có nhạc nền + giọng VI, không audio gốc  

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/remix/bgm-picker.tsx apps/web/src/components/remix/video-output-panel.tsx
git commit -m "feat(web): BGM picker with preview and volume in Remake Studio"
```

---

### Task 12: Final verification

- [ ] **Step 1: API tests**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-bgm src/modules/remix/remix.service.spec.ts src/modules/remix/remix-render.service.spec.ts src/workers/processors/remix.processor.spec.ts`

- [ ] **Step 2: Typecheck web**

Run: `pnpm --filter web exec tsc --noEmit`

- [ ] **Step 3: Lint** (if project script exists)

Run: `pnpm lint` or package-specific lint

---

## Manual test checklist

- [ ] `GET /viral/remix/bgm` returns 6 tracks  
- [ ] Preview URL plays in browser (session cookie)  
- [ ] «Nghe thử» works for all 6 rows; switching stops previous  
- [ ] Select track without preview does not auto-play  
- [ ] Volume slider PATCH persists  
- [ ] Change track/volume clears render preview but keeps dub (`tts_ready`)  
- [ ] Render with BGM: dub audible + music bed at volume  
- [ ] Render without BGM (`null`): dub only (regression)  
- [ ] `banner_audio` + BGM: letterbox + mixed audio  
- [ ] Upload dub + BGM: same mix behavior  

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-30-remix-background-music.md`.

**Execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement task-by-task in one session with checkpoints  

**Spec:** `docs/superpowers/specs/2026-07-30-remix-background-music-design.md` (not committed per user request).
