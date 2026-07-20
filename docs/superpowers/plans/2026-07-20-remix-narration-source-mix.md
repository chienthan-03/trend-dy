# Narration vs Source Audio Mix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TTS only reviewer narration; keep original film audio on `source` segments; mix at render with ducking; editors can override roles in Studio.

**Architecture:** Extend `RemixTranscriptSegment` with `role` / `roleSource`. LLM (+ pairing) classifies after translate or on demand. `remix_tts` skips `source` (no sentence-split). `remix_render` for TTS dubs mixes ducked original + dub; upload dub still full-replaces. Role edits clear dub/render.

**Tech Stack:** NestJS, Prisma JSON fields, BullMQ, FFmpeg, Vitest, Next.js Remake Studio, `@factory/shared`, existing `completeText` gateway

**Spec:** [docs/superpowers/specs/2026-07-20-remix-narration-source-mix-design.md](../specs/2026-07-20-remix-narration-source-mix-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/remix-types.ts` | `RemixSegmentRole`, `role` / `roleSource` on segment |
| `prisma/schema.prisma` | Optional `classifyWarning` on `ViralRemake` |
| `apps/api/src/modules/remix/tts/segment-role.ts` | Effective role helpers, merge narration intervals |
| `apps/api/src/modules/remix/tts/duck-envelope.ts` | Build FFmpeg volume filter from narration intervals |
| `apps/api/src/ai/prompts/remix.segment-roles.v1.ts` | Classify prompt + JSON parse |
| `apps/api/src/modules/remix/tts/classify-segments.ts` | Pair ZH/VI, call LLM, apply overwrite rules |
| `apps/api/src/modules/remix/remix-config.ts` | `getDuckGain()` / `REMIX_DUCK_GAIN` |
| `apps/api/src/modules/remix/remix-render.service.ts` | Mix path for TTS; keep replace for upload |
| `apps/api/src/workers/processors/remix.processor.ts` | Lazy classify; TTS skip source; remove split |
| `apps/api/src/modules/remix/remix.service.ts` | classify API, patch roles, invalidate dub |
| `apps/api/src/modules/remix/remix.controller.ts` | Endpoints |
| `apps/web/src/components/remix/remake-transcript-panel.tsx` | Role badges + toggle + re-classify |
| `apps/web/src/lib/api-client.ts` | Client methods |
| `apps/web/src/app/(app)/remix/[remakeId]/page.tsx` | Wire handlers |
| `.env.example` | `REMIX_DUCK_GAIN` |

---

### Task 1: Shared types + helpers

**Files:**
- Modify: `packages/shared/src/remix-types.ts`
- Create: `apps/api/src/modules/remix/tts/segment-role.ts`
- Create: `apps/api/src/modules/remix/tts/segment-role.spec.ts`
- Modify: `packages/shared/src/index.ts` (export if needed)

- [ ] **Step 1: Extend shared segment type**

```ts
export type RemixSegmentRole = "narration" | "source";
export type RemixSegmentRoleSource = "auto" | "manual";

export type RemixTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  role?: RemixSegmentRole;
  roleSource?: RemixSegmentRoleSource;
};
```

- [ ] **Step 2: Failing tests for helpers**

```ts
// segment-role.spec.ts
it("effectiveRole defaults to narration", () => {
  expect(effectiveRole({})).toBe("narration");
  expect(effectiveRole({ role: "source" })).toBe("source");
});

it("mergeNarrationIntervals merges overlap and drops zero-length", () => {
  expect(
    mergeNarrationIntervals([
      { startSec: 0, endSec: 1, role: "narration" },
      { startSec: 0.8, endSec: 2, role: "narration" },
      { startSec: 3, endSec: 3, role: "narration" },
      { startSec: 4, endSec: 5, role: "source" },
    ]),
  ).toEqual([{ startSec: 0, endSec: 2 }]);
});
```

- [ ] **Step 3: Implement `segment-role.ts`**

```ts
export const effectiveRole = (seg: { role?: RemixSegmentRole }): RemixSegmentRole =>
  seg.role === "source" ? "source" : "narration";

export const mergeNarrationIntervals = (
  segments: Array<{ startSec: number; endSec: number; role?: RemixSegmentRole }>,
): Array<{ startSec: number; endSec: number }> => {
  const raw = segments
    .filter((s) => effectiveRole(s) === "narration" && s.endSec > s.startSec)
    .map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
    .sort((a, b) => a.startSec - b.startSec);
  const out: Array<{ startSec: number; endSec: number }> = [];
  for (const iv of raw) {
    const last = out[out.length - 1];
    if (!last || iv.startSec > last.endSec) out.push({ ...iv });
    else last.endSec = Math.max(last.endSec, iv.endSec);
  }
  return out;
};
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx vitest run src/modules/remix/tts/segment-role.spec.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/remix-types.ts packages/shared/src/index.ts \
  apps/api/src/modules/remix/tts/segment-role.ts \
  apps/api/src/modules/remix/tts/segment-role.spec.ts
git commit -m "feat(shared): segment role types and narration interval helpers"
```

---

### Task 2: Classify segments (prompt + apply rules)

**Files:**
- Create: `apps/api/src/ai/prompts/remix.segment-roles.v1.ts`
- Create: `apps/api/src/ai/prompts/remix.segment-roles.v1.spec.ts`
- Create: `apps/api/src/modules/remix/tts/classify-segments.ts`
- Create: `apps/api/src/modules/remix/tts/classify-segments.spec.ts`

- [ ] **Step 1: Failing parse tests**

Assert: valid JSON `{ roles: [{ index, role }] }` maps 1:1; wrong length throws; unknown role throws.

- [ ] **Step 2: Implement prompt + `parseSegmentRolesJson`**

System: classify each line as `narration` (reviewer) vs `source` (film dialogue/SFX speech). Return only JSON array matching input indexes.

- [ ] **Step 3: Failing apply-rules tests**

```ts
it("reclassify skips manual roles", () => {
  const next = applyClassifiedRoles({
    segments: [
      { text: "a", startSec: 0, endSec: 1, role: "source", roleSource: "manual" },
      { text: "b", startSec: 1, endSec: 2 },
    ],
    classified: [
      { index: 0, role: "narration" },
      { index: 1, role: "source" },
    ],
    mode: "reclassify",
  });
  expect(next[0].role).toBe("source");
  expect(next[0].roleSource).toBe("manual");
  expect(next[1].role).toBe("source");
  expect(next[1].roleSource).toBe("auto");
});

it("lazy only fills null roles", () => {
  const next = applyClassifiedRoles({
    segments: [
      { text: "a", startSec: 0, endSec: 1, role: "source", roleSource: "auto" },
      { text: "b", startSec: 1, endSec: 2 },
    ],
    classified: [
      { index: 0, role: "narration" },
      { index: 1, role: "source" },
    ],
    mode: "lazy",
  });
  expect(next[0].role).toBe("source"); // already set — untouched
  expect(next[1].role).toBe("source");
  expect(next[1].roleSource).toBe("auto");
});
```

- [ ] **Step 4: Implement `applyClassifiedRoles` + `classifyTranslatedSegments`**

`classifyTranslatedSegments({ source, translated, mode, completeText })`:

1. If `source.segments.length !== translated.segments.length` → return `{ ok: false, warning: "..." }`  
2. Call LLM with paired lines  
3. Parse; on failure `{ ok: false, warning }`  
4. Apply rules; return `{ ok: true, segments }`

Use `LLM_MODE=fake` path: heuristic — if source text has CJK and translated is very short relative to window, prefer `source`; else `narration` (deterministic for tests).

- [ ] **Step 5: Run tests + commit**

```bash
cd apps/api && npx vitest run src/ai/prompts/remix.segment-roles.v1.spec.ts \
  src/modules/remix/tts/classify-segments.spec.ts
git add apps/api/src/ai/prompts/remix.segment-roles.v1.ts \
  apps/api/src/ai/prompts/remix.segment-roles.v1.spec.ts \
  apps/api/src/modules/remix/tts/classify-segments.ts \
  apps/api/src/modules/remix/tts/classify-segments.spec.ts
git commit -m "feat(remix): classify transcript segments as narration or source"
```

---

### Task 3: Prisma `classifyWarning` + service classify / patch roles + invalidation

**Files:**
- Modify: `prisma/schema.prisma` — `classifyWarning String? @map("classify_warning")`  
- Migration: `prisma/migrations/YYYYMMDDHHMMSS_remix_segment_classify_warning/migration.sql`  
- Modify: `apps/api/src/modules/remix/remix.service.ts`  
- Modify: `apps/api/src/modules/remix/remix.controller.ts`  
- Modify: `apps/api/src/modules/remix/dto/*` as needed  
- Test: `apps/api/src/modules/remix/remix.service.spec.ts`

- [ ] **Step 1: Migration**

```sql
ALTER TABLE "viral_remakes" ADD COLUMN "classify_warning" TEXT;
```

Run: `pnpm exec prisma migrate dev --name remix_segment_classify_warning` (or add SQL + generate)

- [ ] **Step 2: Failing service tests**

- `classifySegments(id, { mode: "reclassify" })` updates translated JSON roles; **if any role changed** → clear `mediaDubAudioKey`, `renderOutputKey`, `renderPhase: "idle"`, `dubSource: null`; if no role changed → leave dub/render untouched  
- Classify parse failure → roles unchanged, `classifyWarning` set, dub/render untouched  
- `updateSegmentRoles(id, [{ index, role }])` sets `roleSource: "manual"`, always invalidate dub/render as above  
- `retranslate` / `retranscribe` wipe translated transcript **and** invalidate dub/render (same fields)

Shared helper used everywhere:

```ts
const invalidateDubAndRenderData = {
  mediaDubAudioKey: null,
  renderOutputKey: null,
  renderPhase: "idle",
  dubSource: null,
} as const;
```

- [ ] **Step 3: Implement service methods + controller**

- `POST /viral/remix/:id/classify-segments` body `{ mode?: "lazy" | "reclassify" }` default reclassify  
- `PATCH /viral/remix/:id/transcript/roles` body `{ roles: { index: number, role: "narration" | "source" }[] }`  
- Update `retranslate` / `retranscribe` to spread `invalidateDubAndRenderData` when clearing transcript state

- [ ] **Step 4: Tests pass + commit**

```bash
git commit -m "feat(remix): classify API and role patch with dub invalidation"
```

---

### Task 4: TTS skips `source` + remove sentence-split

**Files:**
- Modify: `apps/api/src/workers/processors/remix.processor.ts` (`handleTts`, optionally call lazy classify after translate)  
- Modify: `apps/api/src/workers/processors/remix.processor.full-script.spec.ts`

- [ ] **Step 1: Update TTS tests**

- Given segments `[narration, source, narration]`, `synthesize` called twice only  
- `ttsFitFailedIndexes` uses persisted indexes  
- **No** `splitSegmentsForTts` import/call in `handleTts`  
- Lazy classify invoked when any `role == null` (mock `classifyTranslatedSegments`)

- [ ] **Step 2: Implement**

```ts
// handleTts — upload early-return MUST stay before lazy classify
if (remake.dubSource === "upload" && remake.mediaDubAudioKey) {
  // existing early return — no LLM classify
  return;
}

let translated = remake.sourceTranscriptTranslated as RemixTranscriptV1;
if (translated.segments.some((s) => s.role == null)) {
  const result = await classifyTranslatedSegments({ ..., mode: "lazy" });
  if (result.ok) {
    translated = { ...translated, segments: result.segments };
    await prisma.viralRemake.update({
      data: {
        sourceTranscriptTranslated: translated,
        classifyWarning: null,
      },
    });
  } else {
    await prisma.viralRemake.update({
      data: { classifyWarning: result.warning },
    });
  }
}

for (let i = 0; i < translated.segments.length; i++) {
  const segment = translated.segments[i]!;
  if (effectiveRole(segment) === "source") continue;
  // synthesize + fit; on fail fitFailedIndexes.push(i)
}
// assemble as today — source windows simply have no clips (silence on bed)
```

Post-translate auto-classify is **optional** (spec allows lazy-on-TTS only); do not require it in MVP.

- [ ] **Step 3: Run processor tests + commit**

```bash
cd apps/api && npx vitest run src/workers/processors/remix.processor.full-script.spec.ts
git commit -m "fix(remix): TTS only narration segments; drop sentence split"
```

---

### Task 5: Duck envelope + render mix

**Files:**
- Create: `apps/api/src/modules/remix/tts/duck-envelope.ts`  
- Create: `apps/api/src/modules/remix/tts/duck-envelope.spec.ts`  
- Modify: `apps/api/src/modules/remix/remix-config.ts` — `getDuckGain()`  
- Modify: `apps/api/src/modules/remix/remix-render.service.ts`  
- Modify: `apps/api/src/modules/remix/remix-render.service.spec.ts`  
- Modify: `apps/api/src/workers/processors/remix.processor.ts` (`handleRender`)  
- Modify: `apps/api/src/workers/processors/remix.processor.spec.ts`  
- Modify: `.env.example`

- [ ] **Step 1: Failing duck filter tests**

```ts
it("builds volume enable expressions for narration windows", () => {
  const filter = buildDuckVolumeFilter({
    intervals: [{ startSec: 1, endSec: 2 }, { startSec: 5, endSec: 6 }],
    duckGain: 0.2,
  });
  // e.g. volume=0.2:enable='between(t,1,2)+between(t,5,6)':eval=frame,volume=1:enable='not(...)' 
  // OR single expression: volume='if(between(t,1,2)+between(t,5,6),0.2,1)'
  expect(filter).toContain("0.2");
  expect(filter).toContain("between(t,1,2)");
});
```

Prefer one `volume` expr: `volume='if(BETWEEN,DUCK,1)'` with OR of betweens; if no intervals → `volume=1`.

- [ ] **Step 2: Implement envelope + `getDuckGain` (clamp 0.05–1, default 0.2)**

- [ ] **Step 3: Extend render service**

```ts
async renderAudioMix(
  videoBuffer: Buffer,
  dubAudioBuffer: Buffer,
  narrationIntervals: Array<{ startSec: number; endSec: number }>,
): Promise<Buffer>

async renderBannerAudioMix(
  videoBuffer: Buffer,
  dubAudioBuffer: Buffer,
  banners: RemixBannerJson,
  narrationIntervals: Array<{ startSec: number; endSec: number }>,
): Promise<Buffer>
```

FFmpeg sketch (`audio_only` mix):

```
-i video -i dub
-filter_complex "[0:a]VOLUME_EXPR[orig];[orig][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]"
-map 0:v:0 -map [aout] -c:v copy -c:a aac -shortest
```

If video has no audio → throw clear Error.  
Fake render mode: still return fixtures (tests).

Keep `renderAudioOnly` for **upload** path.

- [ ] **Step 4: Wire `handleRender` + failing processor tests**

```ts
if (remake.dubSource === "upload") {
  // existing full replace (renderAudioOnly / renderBannerAudio)
} else {
  const translated = remake.sourceTranscriptTranslated as RemixTranscriptV1;
  const intervals = mergeNarrationIntervals(translated?.segments ?? []);
  // renderAudioMix / renderBannerAudioMix — no post-amix loudnorm
}
```

Update `remix.processor.spec.ts`:

- `dubSource: "upload"` → calls `renderAudioOnly` / `renderBannerAudio` (no mix, no intervals arg)  
- `dubSource: "tts"` → calls `renderAudioMix` / `renderBannerAudioMix` with merged narration intervals  
- Mock new mix methods on render service double  
- Assert mix filter graph / args do **not** include post-mix `loudnorm`

- [ ] **Step 5: Tests + commit**

```bash
cd apps/api && npx vitest run src/modules/remix/tts/duck-envelope.spec.ts \
  src/modules/remix/remix-render.service.spec.ts \
  src/workers/processors/remix.processor.spec.ts
git commit -m "feat(remix): mix original audio with TTS dub and duck narration windows"
```

---

### Task 6: Remake Studio UI

**Files:**
- Modify: `apps/web/src/components/remix/remake-transcript-panel.tsx`  
- Modify: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`  
- Modify: `apps/web/src/lib/api-client.ts`  
- Modify: `apps/web/src/components/remix/video-output-panel.tsx` (hint + disable render if no dub after role change — already gated by keys)

- [ ] **Step 1: API client**

```ts
classifySegments: (id, body?: { mode?: "lazy" | "reclassify" }) =>
  apiFetch(`/viral/remix/${id}/classify-segments`, { method: "POST", body: JSON.stringify(body ?? {}) }),
updateSegmentRoles: (id, roles: { index: number; role: "narration" | "source" }[]) =>
  apiFetch(`/viral/remix/${id}/transcript/roles`, { method: "PATCH", body: JSON.stringify({ roles }) }),
```

Extend `ViralRemake` with `classifyWarning?: string | null`.

- [ ] **Step 2: Transcript panel**

On **translated** view only:

- Each row: badge button toggles Review / Giữ gốc (`aria-pressed`)  
- Toolbar: **Phân loại lại**, hint text  
- Show `classifyWarning` alert if passed as prop  

Callbacks: `onToggleRole(index, role)`, `onClassify()`, `classifyPending`

- [ ] **Step 3: Page wiring**

After toggle/classify: refresh remake + transcript; show info that TTS must be re-run.

- [ ] **Step 4: Manual smoke (no e2e required)**

Checklist in commit message or short note under plan smoke section.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): narration/source role badges and re-classify in Remake Studio"
```

---

### Task 7: Env docs + smoke checklist

**Files:**
- Modify: `.env.example`  
- Create or append: `docs/superpowers/plans/remix-narration-source-mix-smoke-checklist.md`

- [ ] **Step 1: Document `REMIX_DUCK_GAIN=0.2`**

- [ ] **Step 2: Smoke checklist**

1. Remake with mixed review + film dialogue  
2. Phân loại lại → some `source`  
3. Toggle one line manual  
4. Re-classify → manual unchanged  
5. Tạo audio VI → only narration spoken  
6. Render → film lines keep original voice; review is VI; not rushed  
7. Upload dub still full replace  

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: narration/source mix env and smoke checklist"
```

---

## Manual verification (after all tasks)

1. Restart API + worker  
2. Run smoke checklist  
3. Confirm Analytics: classify may use LLM tokens; render still no chat tokens  

---

## Out of scope

- Changing ZIP contents  
- Re-enabling `splitSegmentsForTts` on live TTS path  
- Diarization models  
