# Remix TTS Audio Mode UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors pick per-remake `replace` vs `mix` TTS audio mode in Remake Studio so mix keeps original music under VI narration without editing `.env` or stem separation.

**Architecture:** Add nullable `ViralRemake.ttsAudioMode`. Resolve effective mode as remake field if set, else `getTtsAudioMode()` from env. PATCH from Studio radios always writes explicit `replace`|`mix` and reuses `invalidateDubAndRenderData`. Workers (`handleTts` / `handleRender`) use the resolver instead of bare env. API responses used by Studio attach `effectiveTtsAudioMode`.

**Tech Stack:** NestJS, Prisma, BullMQ, Vitest, Next.js Remake Studio, `@factory/shared`

**Spec:** [docs/superpowers/specs/2026-07-29-remix-tts-audio-mode-ui-design.md](../specs/2026-07-29-remix-tts-audio-mode-ui-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/remix-types.ts` | `REMIX_TTS_AUDIO_MODES`, `RemixTtsAudioMode` |
| `apps/api/src/modules/remix/remix-config.ts` | `resolveEffectiveTtsAudioMode(persisted)` |
| `apps/api/src/modules/remix/remix-config.spec.ts` | Unit tests for resolver |
| `prisma/schema.prisma` + migration | `ttsAudioMode` nullable column |
| `apps/api/src/modules/remix/dto/update-remix.dto.ts` | PATCH `ttsAudioMode` |
| `apps/api/src/modules/remix/remix.service.ts` | Persist + invalidate on mode change; enrich helper |
| `apps/api/src/modules/remix/remix.service.spec.ts` | updateRemake invalidation tests |
| `apps/api/src/modules/remix/remix.controller.ts` | Return enriched remake on GET/PATCH |
| `apps/api/src/workers/processors/remix.processor.ts` | Use effective mode in TTS + render |
| `apps/api/src/workers/processors/remix.processor.spec.ts` | Render/TTS with remake override |
| `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` | Adjust env-only assumptions where remake field matters |
| `apps/web/src/lib/api-client.ts` | Types + PATCH field |
| `apps/web/src/components/remix/video-output-panel.tsx` | Radios + hints + disable when upload |
| `apps/web/src/components/remix/remake-transcript-panel.tsx` | Mix reminder line |
| `apps/web/src/app/(app)/remix/[remakeId]/page.tsx` | Pass effective mode into transcript panel |
| `.env.example` | Clarify replace vs mix (+ commented duck tip) |

---

### Task 1: Shared type + effective-mode resolver

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Modify: `apps/api/src/modules/remix/remix-config.ts`
- Modify: `apps/api/src/modules/remix/remix-config.spec.ts`

- [ ] **Step 1: Write failing resolver tests**

In `remix-config.spec.ts`, add:

```ts
describe("resolveEffectiveTtsAudioMode", () => {
  it("returns replace when persisted is replace", () => {
    process.env.REMIX_TTS_AUDIO_MODE = "mix";
    expect(resolveEffectiveTtsAudioMode("replace")).toBe("replace");
  });

  it("returns mix when persisted is mix", () => {
    process.env.REMIX_TTS_AUDIO_MODE = "replace";
    expect(resolveEffectiveTtsAudioMode("mix")).toBe("mix");
  });

  it("falls back to env when persisted is null", () => {
    process.env.REMIX_TTS_AUDIO_MODE = "mix";
    expect(resolveEffectiveTtsAudioMode(null)).toBe("mix");
  });

  it("falls back to env replace when persisted is garbage", () => {
    process.env.REMIX_TTS_AUDIO_MODE = "replace";
    expect(resolveEffectiveTtsAudioMode("weird")).toBe("replace");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (symbol missing)**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-config.spec.ts`

- [ ] **Step 3: Add shared type + resolver**

In `packages/shared/src/remix-types.ts` (near render modes):

```ts
export const REMIX_TTS_AUDIO_MODES = ["replace", "mix"] as const;
export type RemixTtsAudioMode = (typeof REMIX_TTS_AUDIO_MODES)[number];
```

In `remix-config.ts` (near `getTtsAudioMode`):

```ts
import type { RemixTtsAudioMode } from "@factory/shared";

export const resolveEffectiveTtsAudioMode = (
  persisted: string | null | undefined,
): RemixTtsAudioMode => {
  if (persisted === "mix" || persisted === "replace") return persisted;
  return getTtsAudioMode();
};
```

Optionally make local `TtsAudioMode` in `remix-config.ts` an alias of shared `RemixTtsAudioMode` to avoid two identical unions.

Export from shared package index if needed (same pattern as `REMIX_RENDER_MODES`).

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix-config.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/remix-types.ts apps/api/src/modules/remix/remix-config.ts apps/api/src/modules/remix/remix-config.spec.ts
git commit -m "feat(remix): resolve effective TTS audio mode from remake or env"
```

---

### Task 2: Prisma column

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via Prisma

- [ ] **Step 1: Add field to `ViralRemake`**

After `dubSource` (or near render/tts fields):

```prisma
ttsAudioMode String? @map("tts_audio_mode") // replace | mix | null → env
```

- [ ] **Step 2: Generate migration**

Run: `pnpm exec prisma migrate dev --name add_viral_remake_tts_audio_mode`

Expected: migration SQL adds nullable `tts_audio_mode` column; Prisma client regenerates.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add viral_remakes.tts_audio_mode"
```

---

### Task 3: PATCH updateRemake + invalidation

**Files:**
- Modify: `apps/api/src/modules/remix/dto/update-remix.dto.ts`
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/api/src/modules/remix/remix.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

In `describe("RemixService.updateRemake")` — mock **`prisma.viralRemake.findUnique`** (not `findUniqueOrThrow`; that is what `getRemake` uses today):

```ts
it("persists ttsAudioMode and invalidates dub/render when mode changes", async () => {
  prisma.viralRemake.findUnique.mockResolvedValue({
    ...baseRemake,
    id: "remake_1",
    ttsAudioMode: null,
    mediaDubAudioKey: "remix/remake_1/dub.mp3",
    renderOutputKey: "remix/remake_1/out.mp4",
    dubSource: "tts",
    renderPhase: "render_ready",
  });
  prisma.viralRemake.update.mockResolvedValue({ id: "remake_1" });

  await service.updateRemake("remake_1", { ttsAudioMode: "mix" });

  expect(prisma.viralRemake.update).toHaveBeenCalledWith({
    where: { id: "remake_1" },
    data: expect.objectContaining({
      ttsAudioMode: "mix",
      ...invalidateDubAndRenderData,
    }),
  });
});

it("does not invalidate when ttsAudioMode is unchanged", async () => {
  prisma.viralRemake.findUnique.mockResolvedValue({
    ...baseRemake,
    id: "remake_1",
    ttsAudioMode: "mix",
    mediaDubAudioKey: "remix/remake_1/dub.mp3",
    renderOutputKey: "remix/remake_1/out.mp4",
    dubSource: "tts",
    renderPhase: "render_ready",
  });

  await service.updateRemake("remake_1", { ttsAudioMode: "mix" });

  expect(prisma.viralRemake.update).toHaveBeenCalledWith({
    where: { id: "remake_1" },
    data: expect.objectContaining({
      ttsAudioMode: "mix",
    }),
  });
  const data = prisma.viralRemake.update.mock.calls[0][0].data;
  expect(data.mediaDubAudioKey).toBeUndefined();
  expect(data.renderPhase).toBeUndefined();
});

it("allows clearing ttsAudioMode to null (follow env)", async () => {
  prisma.viralRemake.findUnique.mockResolvedValue({
    ...baseRemake,
    id: "remake_1",
    ttsAudioMode: "mix",
    mediaDubAudioKey: null,
    renderOutputKey: null,
    dubSource: null,
    renderPhase: "idle",
  });

  await service.updateRemake("remake_1", { ttsAudioMode: null });

  expect(prisma.viralRemake.update).toHaveBeenCalledWith({
    where: { id: "remake_1" },
    data: expect.objectContaining({
      ttsAudioMode: null,
      ...invalidateDubAndRenderData,
    }),
  });
});
```

Adapt `baseRemake` to whatever fixture the describe already uses (mirror `ttsVoiceId` tests).

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter api exec vitest run src/modules/remix/remix.service.spec.ts -t "ttsAudioMode"`

- [ ] **Step 3: Extend DTO + updateRemake**

DTO:

```ts
import { REMIX_TTS_AUDIO_MODES } from "@factory/shared";
import type { RemixTtsAudioMode } from "@factory/shared";

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsIn([...REMIX_TTS_AUDIO_MODES])
  ttsAudioMode?: RemixTtsAudioMode | null;
```

Note: to accept JSON `null`, use the same `@ValidateIf` pattern as `ttsMaxSpeed`. If class-validator rejects null, match existing null-clear pattern exactly.

In `updateRemake`:

```ts
if (dto.ttsAudioMode !== undefined) {
  data.ttsAudioMode = dto.ttsAudioMode;
}

const modeChanged =
  dto.ttsAudioMode !== undefined &&
  dto.ttsAudioMode !== existing.ttsAudioMode;

const invalidatesRender =
  (dto.renderMode !== undefined && dto.renderMode !== existing.renderMode) ||
  dto.bannerJson !== undefined;

if (modeChanged) {
  // Full wipe wins — do NOT also run the banner/renderMode soft wipe,
  // which can set renderPhase back to tts_ready from a stale mediaDubAudioKey.
  Object.assign(data, invalidateDubAndRenderData);
} else if (invalidatesRender && existing.renderOutputKey) {
  data.renderOutputKey = null;
  data.renderPhase = existing.mediaDubAudioKey ? "tts_ready" : "idle";
  data.renderError = null;
}
```

Replace the existing standalone `invalidatesRender` block with this branching so mode+banner in one PATCH cannot resurrect `tts_ready` after dub clear.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/remix/dto/update-remix.dto.ts apps/api/src/modules/remix/remix.service.ts apps/api/src/modules/remix/remix.service.spec.ts
git commit -m "feat(api): persist ttsAudioMode and invalidate dub on change"
```

---

### Task 4: Enrich API remake responses

**Files:**
- Modify: `apps/api/src/modules/remix/remix.service.ts`
- Modify: `apps/api/src/modules/remix/remix.controller.ts`

- [ ] **Step 1: Add enrich helper on service**

```ts
import { resolveEffectiveTtsAudioMode } from "./remix-config";

export type ViralRemakeApi = ViralRemake & {
  effectiveTtsAudioMode: "replace" | "mix";
};

enrichRemake(remake: ViralRemake): ViralRemakeApi {
  return {
    ...remake,
    effectiveTtsAudioMode: resolveEffectiveTtsAudioMode(remake.ttsAudioMode),
  };
}
```

- [ ] **Step 2: Wire controller GET + PATCH**

```ts
@Get(":id")
async getRemake(@Param("id") id: string) {
  return this.remixService.enrichRemake(await this.remixService.getRemake(id));
}

@Patch(":id")
async updateRemake(@Param("id") id: string, @Body() body: UpdateRemixDto) {
  return this.remixService.enrichRemake(
    await this.remixService.updateRemake(id, body),
  );
}
```

Do **not** change worker `getRemake` call sites — they keep raw Prisma rows and call `resolveEffectiveTtsAudioMode` themselves.

**Required:** enrich remake-shaped controller responses that `[remakeId]/page.tsx` merges into `remake` state. At minimum: GET, PATCH, classifySegments, updateSegmentRoles, approve, reject. Prefer a thin `enrichRemake` at the controller (or service) boundary so new remake endpoints do not drop the field.

Do **not** require enriching `enqueueTts` / `uploadDub` / `enqueueRender` / `generateBanners` — those return job/partial/banner payloads; optimistic UI spreads keep existing `effectiveTtsAudioMode`.

- [ ] **Step 3: Smoke-typecheck / quick unit if easy**

Optional: unit test `enrichRemake` with null → env mix.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/remix/remix.service.ts apps/api/src/modules/remix/remix.controller.ts
git commit -m "feat(api): expose effectiveTtsAudioMode on remake GET/PATCH"
```

---

### Task 5: Workers use effective mode

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.spec.ts`
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts` (as needed)

- [ ] **Step 1: Write / extend failing processor tests**

In `remix.processor.spec.ts`:

1. Remake `dubSource: "tts"`, `ttsAudioMode: "mix"`, env `REMIX_TTS_AUDIO_MODE=replace` → `renderAudioMix` called.
2. Remake `ttsAudioMode: "replace"`, env `mix` → `renderAudioOnly` (full replace), not mix.
3. Remake `ttsAudioMode: null`, env `mix` → mix (fallback).
4. Remake `ttsAudioMode: "mix"` but `dubSource: "upload"` → still `renderAudioOnly` / banner replace (ignore mode).

Mirror TTS skip-source coverage in full-script spec: remake `ttsAudioMode: "mix"` with env replace should skip `source` roles.

- [ ] **Step 2: Run — expect FAIL (still env-only)**

- [ ] **Step 3: Patch processor**

Import `resolveEffectiveTtsAudioMode`.

In `handleTts`:

```ts
const audioMode = resolveEffectiveTtsAudioMode(remake.ttsAudioMode);
```

Replace every `getTtsAudioMode()` in that handler with `audioMode` (skip-source filter, hybrid/sequential gates).

In `handleRender`:

```ts
const audioMode = resolveEffectiveTtsAudioMode(remake.ttsAudioMode);
if (remake.dubSource === "tts" && audioMode === "mix") {
  // mix path unchanged
} else {
  // full replace
}
```

- [ ] **Step 4: Run processor specs — expect PASS**

Run:
- `pnpm --filter api exec vitest run src/workers/processors/remix.processor.spec.ts`
- `pnpm --filter api exec vitest run src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/processors/remix.processor.ts apps/api/src/workers/processors/remix.processor.spec.ts apps/api/src/workers/processors/remix.processor.full-script.spec.ts
git commit -m "feat(worker): use remake ttsAudioMode for TTS and render mix"
```

---

### Task 6: Web Video output panel UI

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/remix/video-output-panel.tsx`

- [ ] **Step 1: Extend client types**

```ts
import type { RemixTtsAudioMode } from "@factory/shared";

// on ViralRemake:
ttsAudioMode: RemixTtsAudioMode | null;
effectiveTtsAudioMode: RemixTtsAudioMode;

// update payload:
ttsAudioMode?: RemixTtsAudioMode | null;
```

- [ ] **Step 2: Add radios + hints in VideoOutputPanel**

State:

```ts
const [ttsAudioMode, setTtsAudioMode] = useState<RemixTtsAudioMode>(
  remake.effectiveTtsAudioMode ?? remake.ttsAudioMode ?? "replace",
);
```

Sync from remake in existing `useEffect` that mirrors `renderMode`.

Handler (mirror `handleModeChange` for renderMode):

```ts
const handleTtsAudioModeChange = async (mode: RemixTtsAudioMode) => {
  setPending("tts-audio-mode");
  try {
    const updated = await api.remix.update(remake.id, { ttsAudioMode: mode });
    setTtsAudioMode(updated.effectiveTtsAudioMode);
    onRemakeChange(updated);
    onInfo(
      mode === "mix"
        ? "Đã chọn giữ nhạc nền — tạo lại audio VI trước khi render."
        : "Đã chọn thay toàn bộ audio — tạo lại audio VI trước khi render.",
    );
  } catch (error) {
    onError(getErrorMessage(error));
  } finally {
    setPending(null);
  }
};
```

UI block (new fieldset or under “Chế độ xuất”):

- Radios: `Thay toàn bộ audio` / `Giữ nhạc nền (mix)`
- Hint text per selection (from spec §6)
- Disable while `pending` for this control **or** `renderPhase` is `tts` / `rendering` (busier than current renderMode radios if those only use `pending === "mode"` — follow spec §6)
- If `remake.dubSource === "upload"`: disable radios + message “Audio tải lên luôn thay toàn bộ track.”

Existing Render button already gates on `tts_ready` / `render_ready`; after mode change invalidate → `idle` → Render stays disabled until TTS. No extra gate needed if invalidation works.

- [ ] **Step 3: Manual sanity in browser (optional during implement)**

With `pnpm run dev`: open a remake, flip to mix, confirm remake `renderPhase` → idle and dub key cleared; Create VI then Render.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/components/remix/video-output-panel.tsx
git commit -m "feat(web): TTS audio mode radios on video output panel"
```

---

### Task 7: Transcript mix hint + page wire

**Files:**
- Modify: `apps/web/src/components/remix/remake-transcript-panel.tsx`
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`

- [ ] **Step 1: Add prop + one-line hint**

```ts
effectiveTtsAudioMode?: "replace" | "mix";
```

Near role badges / classify controls, when `effectiveTtsAudioMode === "mix"`:

```tsx
<p className="text-xs text-gray-500">
  Mix: chỉ đọc dòng Review; Giữ gốc giữ tiếng gốc + nhạc.
</p>
```

- [ ] **Step 2: Pass from page**

```tsx
effectiveTtsAudioMode={remake.effectiveTtsAudioMode}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/remix/remake-transcript-panel.tsx apps/web/src/app/(app)/remix/[remakeId]/page.tsx
git commit -m "feat(web): mix-mode hint on transcript role panel"
```

---

### Task 8: `.env.example` + smoke checklist note

**Files:**
- Modify: `.env.example`
- Optional Create: `docs/superpowers/plans/remix-tts-audio-mode-ui-smoke-checklist.md` (short)

- [ ] **Step 1: Update `.env.example` comments**

Keep `REMIX_TTS_AUDIO_MODE=replace`. Clarify mix + Studio override. Keep `REMIX_DUCK_GAIN=0` as code default; add comment that `0.2` is the “đủ dùng” ops tip (do not change code default).

- [ ] **Step 2: Short smoke checklist (optional but recommended)**

| Step | Action | Expect |
|------|--------|--------|
| 1 | UI → Giữ nhạc nền (mix) | `ttsAudioMode=mix`; dub cleared; phase idle |
| 2 | Classify Review/Giữ gốc | Roles stick |
| 3 | Tạo audio VI | TTS skips source when mix |
| 4 | Render | Mix path; music under VI on Review windows |

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/superpowers/plans/remix-tts-audio-mode-ui-smoke-checklist.md
git commit -m "docs: TTS audio mode env notes and smoke checklist"
```

---

## Execution notes

- Do **not** change `getDuckGain()` default (`0`).
- Upload dub path must ignore `ttsAudioMode`.
- Hybrid timing remains gated on effective `replace` only.
- Prefer TDD order in Tasks 1, 3, 5; UI tasks can be implemented then manually verified.
