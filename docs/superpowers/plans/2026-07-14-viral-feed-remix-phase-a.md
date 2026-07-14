# Viral Feed & Remix Factory — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A — Viral Feed card UX + one-click **Chế biến** → Vietnamese remix text package (script, hook, banners, titles, SRT draft) from Douyin viral items or pasted links, with Remake Studio editing, policy checklist, and zip export.

**Architecture:** Extend existing modular monolith. Add `RemixModule` + `remix` BullMQ queue alongside `ViralModule`. `DouyinVideoAdapter` (separate from ranking adapter) resolves share URLs and fetches video detail via Just One API. Worker runs `remix_resolve` → `remix_fetch_detail` → `remix_generate` (LLM structured JSON). Persist to `viral_remakes`. No MP4 download in Phase A.

**Tech Stack:** NestJS · Prisma · BullMQ · Just One API · Vercel AI SDK (`completeText`) · Next.js App Router · Tailwind · Vitest

**Spec:** `docs/superpowers/specs/2026-07-14-viral-feed-remix-factory.md`

---

## Scope boundary

**In Phase A:** `viral_remakes` schema, `DouyinVideoAdapter` (fake + live), remix worker pipeline, remix REST API, policy guard + export zip, Viral Feed card UI, paste-link trigger, Remake Studio, Jobs filter `remix_*`.

**Out (Phase B+):** media download, STT, FFmpeg render, velocity badge snapshots (Phase A.1 optional appendix), auto-publish.

**Exit criteria:** Editor triggers 10 real Douyin links → gets usable VN script + hook without uploading novel files.

---

## File structure (additions)

```
packages/shared/src/
  remix-types.ts              # RemixPackageV1, policy checklist types, job type constants
  remix-policy.ts             # literal overlap, default checklist shape

prisma/
  schema.prisma               # + ViralRemake model, ViralItem.remakes relation
  migrations/

apps/api/src/
  modules/remix/
    remix.module.ts
    remix.controller.ts
    remix.service.ts
    remix-policy.guard.ts
    remix-export.service.ts
    douyin-video.adapter.ts
    adapters/
      fake-douyin-video.adapter.ts
      live/
        justone-video.provider.ts
        live-douyin-video.adapter.ts
    dto/
      trigger-remix.dto.ts
      update-remix.dto.ts
      approve-remix.dto.ts
    remix.service.spec.ts
    remix-policy.guard.spec.ts
    douyin-video.adapter.spec.ts
  ai/prompts/
    remix.package.v1.ts
  workers/processors/
    remix.processor.ts
  queue/queues.ts               # + "remix"
  modules/jobs/job-type-to-queue.ts
  modules/usage/ai-job-types.ts

apps/web/src/
  app/(app)/discovery/page.tsx  # evolve → Viral Feed cards
  app/(app)/remix/[remakeId]/page.tsx
  components/viral/
    viral-card.tsx
    paste-link-bar.tsx
  components/remix/
  lib/api-client.ts             # + api.remix.*
  components/app-shell.tsx      # rename Discovery → Viral Feed

prisma/seed-remix-prompt.ts     # or extend existing seed
```

---

### Task 1: Shared remix types + env vars

**Files:**
- Create: `packages/shared/src/remix-types.ts`
- Create: `packages/shared/src/remix-policy.ts`
- Modify: `packages/shared/src/index.ts` (re-export)
- Modify: `.env.example`

- [ ] **Step 1: Add remix job type constants and package schema types**

```ts
// packages/shared/src/remix-types.ts
export const REMIX_JOB_TYPES = [
  "remix_resolve",
  "remix_fetch_detail",
  "remix_generate",
] as const;
export type RemixJobType = (typeof REMIX_JOB_TYPES)[number];

export const REMIX_STATUSES = ["pending", "running", "ready", "failed", "archived"] as const;
export type RemixStatus = (typeof REMIX_STATUSES)[number];

export const REMIX_USAGE_POLICIES = [
  "research_only",
  "remix_draft",
  "approved_for_export",
  "blocked",
] as const;
export type RemixUsagePolicy = (typeof REMIX_USAGE_POLICIES)[number];

export type RemixPackageV1 = {
  locale: "vi";
  script: {
    narration: string;
    duration_estimate_sec: number;
    sections: Array<{ label: string; text: string }>;
  };
  hook_3s: { spoken: string; on_screen: string; visual_hint: string };
  banners: { top: string; bottom: string; watermark: string };
  packaging: { titles: string[]; description: string; hashtags: string[] };
  subtitles: {
    format: "srt";
    cues: Array<{ start: string; end: string; text: string }>;
  };
  transform_notes: {
    source_language: string;
    rewrite_strategy: string;
    risks: string[];
  };
};

export type RemixPolicyChecklist = {
  scriptRewritten: boolean;
  hookIsNew: boolean;
  hasStudioBrand: boolean;
  voiceWillBeRerecorded: boolean;
  noFullReupload: boolean;
  leadApproved: boolean;
};
```

- [ ] **Step 2: Add policy helpers**

```ts
// packages/shared/src/remix-policy.ts
import type { RemixPolicyChecklist } from "./remix-types";

export const defaultRemixPolicyChecklist = (): RemixPolicyChecklist => ({
  scriptRewritten: false,
  hookIsNew: false,
  hasStudioBrand: false,
  voiceWillBeRerecorded: false,
  noFullReupload: false,
  leadApproved: false,
});

/** Jaccard-like word overlap on normalized tokens — advisory only */
export const literalOverlapRatio = (source: string, target: string): number => {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1),
    );
  const a = tokenize(source);
  const b = tokenize(target);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter += 1;
  return inter / Math.max(a.size, b.size);
};

export const isPolicyChecklistComplete = (c: RemixPolicyChecklist): boolean =>
  c.scriptRewritten &&
  c.hookIsNew &&
  c.hasStudioBrand &&
  c.voiceWillBeRerecorded &&
  c.noFullReupload &&
  c.leadApproved;
```

- [ ] **Step 3: Export from shared package index**

- [ ] **Step 4: Extend `.env.example`**

```env
# Phase A — Remix
REMIX_ENABLED=true
REMIX_DEFAULT_LOCALE=vi
REMIX_LLM_MODEL=openai/gpt-4o-mini
REMIX_STUDIO_BRAND=STUDIO ALPHA
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/remix-types.ts packages/shared/src/remix-policy.ts packages/shared/src/index.ts .env.example
git commit -m "feat: add shared remix types and policy helpers"
```

---

### Task 2: Prisma `ViralRemake` model + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `pnpm prisma migrate dev`

- [ ] **Step 1: Add `ViralRemake` model and relation on `ViralItem` + `Project`**

```prisma
model ViralRemake {
  id               String    @id @default(cuid())
  projectId        String    @map("project_id")
  viralItemId      String?   @map("viral_item_id")
  externalVideoId  String    @map("external_video_id")
  sourceUrl        String?   @map("source_url")
  sourceSnapshot   Json?     @map("source_snapshot")
  genre            String?
  status           String    @default("pending")
  usagePolicy      String    @default("remix_draft") @map("usage_policy")
  packageJson      Json?     @map("package_json")
  policyChecklist  Json?     @map("policy_checklist")
  policyWarnings   String[]  @default([]) @map("policy_warnings")
  editorNotes      String?   @map("editor_notes")
  approvedByUserId String?   @map("approved_by_user_id")
  approvedAt       DateTime? @map("approved_at")
  tokensIn         Int?      @map("tokens_in")
  tokensOut        Int?      @map("tokens_out")
  costUsd          Float?    @map("cost_usd")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  project   Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  viralItem ViralItem? @relation(fields: [viralItemId], references: [id], onDelete: SetNull)

  @@index([projectId, status, createdAt(sort: Desc)])
  @@index([viralItemId])
  @@index([externalVideoId])
  @@map("viral_remakes")
}
```

On `ViralItem` add: `remakes ViralRemake[]`  
On `Project` add: `viralRemakes ViralRemake[]`

- [ ] **Step 2: Run migration**

Run: `pnpm prisma migrate dev --name add_viral_remakes`  
Expected: migration applied, Prisma Client regenerated

- [ ] **Step 3: Commit**

```bash
git add prisma/
git commit -m "feat: add viral_remakes table for remix pipeline"
```

---

### Task 3: `remix` queue registration

**Files:**
- Modify: `apps/api/src/queue/queues.ts`
- Modify: `apps/api/src/modules/jobs/job-type-to-queue.ts`
- Modify: `apps/api/src/modules/jobs/jobs.service.ts` (inject remix queue)
- Modify: `apps/api/src/modules/usage/ai-job-types.ts`

- [ ] **Step 1: Add `remix` to `QUEUE_NAMES`**

```ts
export const QUEUE_NAMES = [
  "import",
  "understand",
  "generate",
  "asset",
  "discovery",
  "remix",
] as const;
```

- [ ] **Step 2: Map `remix_*` job types to `remix` queue**

```ts
// job-type-to-queue.ts — add before throw:
if (type.startsWith("remix_")) {
  return "remix";
}
```

- [ ] **Step 3: Inject `@InjectQueue("remix")` in `JobsService` constructor and add to `this.queues`**

- [ ] **Step 4: Budget `remix_generate` as AI job**

```ts
// ai-job-types.ts
return queue === "understand" || queue === "generate" || type === "remix_generate";
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: register remix BullMQ queue and job routing"
```

---

### Task 4: `DouyinVideoAdapter` (fake + live)

**Files:**
- Create: `apps/api/src/modules/remix/douyin-video.adapter.ts`
- Create: `apps/api/src/modules/remix/adapters/fake-douyin-video.adapter.ts`
- Create: `apps/api/src/modules/remix/adapters/live/justone-video.provider.ts`
- Create: `apps/api/src/modules/remix/adapters/live/live-douyin-video.adapter.ts`
- Test: `apps/api/src/modules/remix/douyin-video.adapter.spec.ts`

- [ ] **Step 1: Write failing tests — fake adapter returns deterministic detail**

```ts
describe("FakeDouyinVideoAdapter", () => {
  it("resolveShareUrl extracts videoId from v.douyin.com link", async () => {
    const adapter = createDouyinVideoAdapter(); // DOUYIN_ADAPTER=fake
    const result = await adapter.resolveShareUrl(
      "https://v.douyin.com/abc123/",
    );
    expect(result.videoId).toBeTruthy();
  });

  it("getVideoDetail returns caption for known fake id", async () => {
    const adapter = createDouyinVideoAdapter();
    const detail = await adapter.getVideoDetail("fake-video-001");
    expect(detail.caption.length).toBeGreaterThan(10);
    expect(detail.title).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter api test douyin-video.adapter.spec.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement interface + factory (mirror `createDouyinAdapter` pattern)**

```ts
// douyin-video.adapter.ts
export type DouyinVideoDetail = {
  videoId: string;
  title: string;
  caption: string;
  authorHandle: string;
  stats: Record<string, number>;
  coverUrl?: string;
  canonicalUrl?: string;
  publishedAt?: Date;
  playUrl?: string;
  rawPayload: unknown;
};

export interface DouyinVideoAdapter {
  resolveShareUrl(shareUrl: string): Promise<{ videoId: string; canonicalUrl?: string }>;
  getVideoDetail(videoId: string): Promise<DouyinVideoDetail>;
}

export const createDouyinVideoAdapter = async (): Promise<DouyinVideoAdapter> => {
  const mode = process.env.DOUYIN_ADAPTER ?? "fake";
  if (mode === "fake") {
    const { FakeDouyinVideoAdapter } = await import("./adapters/fake-douyin-video.adapter");
    return new FakeDouyinVideoAdapter();
  }
  const { LiveDouyinVideoAdapter } = await import("./adapters/live/live-douyin-video.adapter");
  return new LiveDouyinVideoAdapter();
};
```

- [ ] **Step 4: Implement `justone-video.provider.ts`**

Endpoints (reuse token/base URL from ranking provider):
- `GET /api/douyin/share-url-transfer/v1?token=&shareUrl=`
- `GET /api/douyin/get-video-detail/v2?token=&videoId=`

Map response fields → `DouyinVideoDetail` (title, desc/caption, author, stats, cover, aweme_id).

- [ ] **Step 5: Fake adapter — hash share URL to stable `fake-video-xxx` id; fixture captions in Chinese + stats**

- [ ] **Step 6: Run tests — expect PASS**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add DouyinVideoAdapter for share resolve and video detail"
```

---

### Task 5: LLM prompt `remix.package.v1`

**Files:**
- Create: `apps/api/src/ai/prompts/remix.package.v1.ts`
- Modify: `apps/api/src/modules/prompts/prompts.service.ts` seed path OR create `prisma/seed-remix-prompt.ts`
- Test: `apps/api/src/ai/prompts/remix.package.v1.spec.ts`

- [ ] **Step 1: Write failing test — prompt builder includes Vietnamese rewrite rules**

```ts
it("buildRemixPrompt includes non-literal translation rule", () => {
  const { system, user } = buildRemixPrompt({
    caption: "修仙少年意外获得系统",
    title: "系统觉醒",
    genre: "cultivation",
    locale: "vi",
  });
  expect(system).toMatch(/rewrite|viết lại/i);
  expect(user).toContain("修仙少年");
});
```

- [ ] **Step 2: Implement `buildRemixPrompt` + JSON schema description for `RemixPackageV1`**

Non-negotiable system rules (from spec §4.3):
- Vietnamese output
- Recap rewrite, not sentence-by-sentence translation
- Hook ≤ 3s spoken
- Stand-alone output; inspiration only

- [ ] **Step 3: Add `parseRemixPackageJson(raw: string): RemixPackageV1` with zod validation**

- [ ] **Step 4: Seed prompt template row**

```sql
-- prompt_templates: key = 'remix.package.v1', version = '1', is_active = true
```

Run seed script or migration seed on dev startup.

- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "feat: add remix.package.v1 LLM prompt and parser"
```

---

### Task 6: `RemixService` — trigger, CRUD, policy warnings

**Files:**
- Create: `apps/api/src/modules/remix/remix.service.ts`
- Create: `apps/api/src/modules/remix/remix-policy.guard.ts`
- Create: `apps/api/src/modules/remix/dto/trigger-remix.dto.ts`
- Create: `apps/api/src/modules/remix/dto/update-remix.dto.ts`
- Test: `apps/api/src/modules/remix/remix.service.spec.ts`
- Test: `apps/api/src/modules/remix/remix-policy.guard.spec.ts`

- [ ] **Step 1: Failing test — trigger from blocked viral item throws 403**

- [ ] **Step 2: Failing test — trigger creates `viral_remakes` row + enqueues jobs**

```ts
it("triggerRemix enqueues remix_fetch_detail when viralItemId provided", async () => {
  const result = await remixService.triggerRemix({
    projectId: "proj_1",
    viralItemId: "item_1",
  });
  expect(result.remakeId).toBeTruthy();
  expect(jobsService.enqueue).toHaveBeenCalledWith(
    expect.objectContaining({ type: "remix_fetch_detail" }),
  );
});
```

- [ ] **Step 3: Implement `triggerRemix({ projectId, viralItemId?, shareUrl? })`**

Logic:
1. If `!REMIX_ENABLED` → 503
2. Resolve input:
   - `viralItemId` → load item; block if `usagePolicy === 'blocked'`
   - `shareUrl` only → enqueue `remix_resolve` first
3. Create `ViralRemake` status `pending`
4. Enqueue chain via `JobsService.enqueue` (never raw `queue.add`):
   - shareUrl only: `remix_resolve` → processor chains `remix_fetch_detail` → `remix_generate`
   - viralItemId: skip resolve if `externalId` known; use item caption as fallback if detail API fails
5. Optional idempotency: same `viralItemId` + ready remake < 1h → return existing (config flag)

- [ ] **Step 4: Implement `computePolicyWarnings(remake)` — advisory**

| Signal | Warning |
| overlap > 0.7 | Script quá giống caption gốc |
| hook == first caption sentence | Hook chưa được viết mới |
| empty watermark | Thiếu branding |

- [ ] **Step 5: Implement `updateRemake`, `listRemakes`, `getRemake`, `regenerate`, `reject`**

- [ ] **Step 6: `RemixPolicyGuard.canExport(remake)` — requires `approved_for_export` + complete checklist**

- [ ] **Step 7: Tests pass; commit**

```bash
git commit -m "feat: add RemixService with trigger, CRUD, and policy guard"
```

---

### Task 7: `RemixProcessor` worker

**Files:**
- Create: `apps/api/src/modules/remix/remix.module.ts`
- Create: `apps/api/src/workers/processors/remix.processor.ts`
- Modify: `apps/api/src/workers/worker.main.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing integration-style unit test for processor handler (mock adapter + LLM)**

- [ ] **Step 2: Implement `RemixProcessor` on `remix` queue**

Job handlers:

**`remix_resolve`** payload: `{ remakeId, shareUrl }`
- Call `adapter.resolveShareUrl`
- Update `externalVideoId`, `sourceUrl`
- Chain enqueue `remix_fetch_detail`

**`remix_fetch_detail`** payload: `{ remakeId, videoId? }`
- `adapter.getVideoDetail(videoId ?? remake.externalVideoId)`
- Persist `sourceSnapshot` jsonb
- Set status `running`
- Chain enqueue `remix_generate`

**`remix_generate`** payload: `{ remakeId }`
- Load template `remix.package.v1`
- `completeText` via AI gateway with `REMIX_LLM_MODEL`
- Parse JSON → `packageJson`
- Run `computePolicyWarnings` → `policyWarnings`
- Set status `ready`, log tokens + `estimateLlmCostUsd` → `usage_events`
- On failure: status `failed`, `markFailed`

All steps: `markStarted` / `markCompleted` / `markFailed` on jobs table.

- [ ] **Step 3: Register `RemixModule` in API + Worker; add `RemixProcessor` to worker providers**

- [ ] **Step 4: Manual smoke**

Run: `pnpm dev:api` + `pnpm dev:worker`  
POST `/api/v1/viral/remix` with fake adapter → job completes → remake `ready`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add RemixProcessor worker pipeline"
```

---

### Task 8: Remix REST API

**Files:**
- Create: `apps/api/src/modules/remix/remix.controller.ts`
- Modify: `apps/api/src/modules/viral/viral.controller.ts` (shortcut route)
- Modify: `apps/api/src/modules/remix/remix.module.ts`

- [ ] **Step 1: Implement endpoints per spec §7**

| Method | Path |
| POST | `/viral/remix` |
| GET | `/viral/remix` |
| GET | `/viral/remix/:id` |
| PATCH | `/viral/remix/:id` |
| POST | `/viral/remix/:id/approve` |
| POST | `/viral/remix/:id/reject` |
| POST | `/viral/remix/:id/regenerate` |
| GET | `/viral/remix/:id/export` |
| POST | `/viral/items/:id/remix` |

- [ ] **Step 2: `approve` — role gate `admin` only (Phase A); set `usagePolicy=approved_for_export`, `approvedAt`, `approvedByUserId`**

- [ ] **Step 3: `export` — 403 if policy guard fails**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add remix REST API endpoints"
```

---

### Task 9: Export zip service (Phase A: json + srt + txt)

**Files:**
- Create: `apps/api/src/modules/remix/remix-export.service.ts`
- Test: `apps/api/src/modules/remix/remix-export.service.spec.ts`

- [ ] **Step 1: Failing test — export builds zip with `script.txt`, `hook.txt`, `package.srt`, `titles.txt`, `package.json`**

- [ ] **Step 2: Implement SRT builder from `packageJson.subtitles.cues`**

- [ ] **Step 3: Stream zip via `archiver` (reuse pattern from `export_zip` asset processor if exists)**

- [ ] **Step 4: Wire `GET /viral/remix/:id/export` → `Content-Disposition: attachment`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: export remix package as zip (json, srt, txt)"
```

---

### Task 10: API client + types (web)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: Add `ViralRemake` type mirroring API response**

- [ ] **Step 2: Add `api.remix` methods**

```ts
remix: {
  trigger: (body: { projectId: string; viralItemId?: string; shareUrl?: string }) => ...
  list: (params: { projectId: string; status?: string; viralItemId?: string }) => ...
  get: (id: string) => ...
  update: (id: string, body: Partial<...>) => ...
  approve: (id: string) => ...
  reject: (id: string) => ...
  regenerate: (id: string) => ...
  exportUrl: (id: string) => `/api/v1/viral/remix/${id}/export`;
  triggerFromItem: (itemId: string, projectId: string) => ...
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add remix API client methods"
```

---

### Task 11: Viral Feed UI — card layout + Chế biến

**Files:**
- Create: `apps/web/src/components/viral/viral-card.tsx`
- Create: `apps/web/src/components/viral/paste-link-bar.tsx`
- Modify: `apps/web/src/app/(app)/discovery/page.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`

- [ ] **Step 1: Rename nav label `Discovery` → `Viral Feed`**

- [ ] **Step 2: Build `ViralCard` component per spec §3.2**

Props: `item`, `remakeStatus?`, `onRemix`, `onSkip`  
Show: cover, tier badge, trend score, caption, author, stats, genre chip, hashtags  
Actions: **Chế biến** (disabled if `usagePolicy === 'blocked'`), **Bỏ qua**  
Footer: "Đã chế biến" link if remake exists

- [ ] **Step 3: Add `PasteLinkBar` — input + Trigger → `api.remix.trigger({ shareUrl })`**

- [ ] **Step 4: Refactor Discovery page**

- Replace dense table with card grid (`grid gap-4 md:grid-cols-2`)
- Add sort select: `trend_score` | `crawled_at` | `rank_position` (client-side sort on loaded items)
- On mount: fetch remakes for project → map `viralItemId` → latest remake
- `handleRemix(item)` → `api.remix.triggerFromItem` → toast + link to Jobs
- Keep existing board create/crawl controls (collapsed section or sidebar)

- [ ] **Step 5: Manual UX check**

Open `/discovery` → card feed renders → Chế biến triggers job

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: evolve Discovery into Viral Feed with remix actions"
```

---

### Task 12: Remake Studio UI

**Files:**
- Create: `apps/web/src/app/(app)/remix/[remakeId]/page.tsx`
- Create: `apps/web/src/components/remix/remake-source-panel.tsx`
- Create: `apps/web/src/components/remix/remake-editor.tsx`
- Create: `apps/web/src/components/remix/policy-checklist.tsx`

- [ ] **Step 1: Page loads remake by id; poll or refetch while `status !== ready`**

- [ ] **Step 2: Sections per spec §3.3**

| Section | Implementation |
| Source | cover, link, caption, tier, genre |
| Remix script | textarea `packageJson.script.narration` |
| Hook 3s | fields for spoken, on_screen, visual_hint |
| Banners | top, bottom, watermark |
| Packaging | 3 title inputs, description, hashtags |
| Subtitles | read-only SRT preview from cues |
| Policy | `PolicyChecklist` component |
| Actions | Save, Approve, Reject, Re-run AI, Export |

- [ ] **Step 3: `PolicyChecklist` — 6 checkboxes + display `policyWarnings` as Alert**

- [ ] **Step 4: Save → `PATCH /viral/remix/:id` with updated `packageJson` + `policyChecklist`**

- [ ] **Step 5: Approve → `POST approve` (show error if checklist incomplete)**

- [ ] **Step 6: Export → `window.open(exportUrl)` after approved**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add Remake Studio page for editing remix packages"
```

---

### Task 13: Jobs UI — remix filter

**Files:**
- Modify: `apps/web/src/app/(app)/jobs/page.tsx`
- Modify: `apps/api/src/modules/jobs/jobs.controller.ts` (if type filter missing)
- Modify: `apps/api/src/modules/jobs/jobs.service.ts`

- [ ] **Step 1: Add optional `?typePrefix=remix_` query to jobs list API**

- [ ] **Step 2: Jobs page — filter chips: All | Remix | Discovery | Generate | …**

- [ ] **Step 3: Remix jobs show link to `/remix/[remakeId]` when payload contains `remakeId`**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add remix filter to Jobs UI"
```

---

### Task 14: Integration tests + E2E smoke

**Files:**
- Create: `apps/api/src/modules/remix/remix.e2e.spec.ts` (or extend existing e2e pattern)
- Test: `apps/api/src/ai/prompts/remix.package.v1.spec.ts` (parser edge cases)

- [ ] **Step 1: E2E — fake adapter full pipeline**

```
POST /viral/remix { projectId, shareUrl: "https://v.douyin.com/test/" }
→ poll job until completed
→ GET /viral/remix/:id status=ready
→ packageJson.script.narration length > 50
→ packageJson.hook_3s.spoken length > 0
```

- [ ] **Step 2: E2E — export blocked without approval**

```
GET /viral/remix/:id/export → 403
→ complete checklist + approve
→ GET export → 200 zip
```

- [ ] **Step 3: E2E — trigger from viral_item**

Seed fake viral item → POST `/viral/items/:id/remix` → ready remake linked

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`  
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git commit -m "test: add remix pipeline integration tests"
```

---

### Task 15: Polish + documentation handoff

**Files:**
- Modify: `apps/web/src/app/(app)/discovery/page.tsx` (empty states per spec §3.2)
- Modify: `.env.example` (final review)

- [ ] **Step 1: Empty states**

- No boards → Create & crawl CTA (existing)
- No items → crawl CTA
- Item blocked → hide Chế biến, show badge "Blocked"

- [ ] **Step 2: Loading states on Chế biến button (spinner per card)**

- [ ] **Step 3: Verify `REMIX_ENABLED=false` returns friendly 503 on trigger**

- [ ] **Step 4: Update spec status line if needed (optional — only if team tracks in spec)**

- [ ] **Step 5: Final manual exit-criteria run**

1. Set `DOUYIN_ADAPTER=fake` (or live with valid token)
2. Open Viral Feed → Chế biến on 3 items
3. Paste 2 share links
4. Edit in Remake Studio → approve → export zip
5. Confirm zip contains usable VN script

- [ ] **Step 6: Commit**

```bash
git commit -m "chore: polish viral feed remix UX and empty states"
```

---

## Appendix A — Phase A.1 (optional, +3 days)

**Not in critical path.** Implement only after Phase A exit criteria met.

| Task | Deliverable |
|---|---|
| A.1.1 | `viral_item_stats_snapshots` table + write on crawl |
| A.1.2 | Compute 24h like delta → `velocityPct` on feed API |
| A.1.3 | ViralCard shows `↑12%` badge |

---

## Appendix B — Task dependency graph

```
Task 1 (types)
  → Task 2 (schema)
  → Task 3 (queue)
  → Task 4 (video adapter)
  → Task 5 (prompt)
  → Task 6 (service)
  → Task 7 (processor)
  → Task 8 (API)
  → Task 9 (export)
  → Task 10 (api-client)
  → Task 11 (feed UI)  ─┐
  → Task 12 (studio UI) ┼→ Task 14 (tests) → Task 15 (polish)
  → Task 13 (jobs UI)  ─┘
```

Tasks 11–13 can run in parallel after Task 10.

---

## Appendix C — Manual test commands

```bash
# Terminal 1–3
pnpm dev:api
pnpm dev:worker
pnpm dev:web

# Trigger remix (replace IDs)
curl -s -b cookies.txt -X POST http://localhost:3001/api/v1/viral/remix \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"YOUR_PROJECT_ID","shareUrl":"https://v.douyin.com/iJxYz/"}'

# Check remake
curl -s -b cookies.txt http://localhost:3001/api/v1/viral/remix/REMAKE_ID | jq .status,.packageJson.hook_3s
```

---

## Do NOT implement in this plan

- `remix_download_media`, `remix_stt`, `remix_render` (Phase B)
- `REMIX_ALLOW_MEDIA_DOWNLOAD`
- Velocity snapshots (Phase A.1)
- Auto-publish to TikTok/YouTube
- Changes to novel Library / Story Graph path

---

*Plan complete. Spec: `docs/superpowers/specs/2026-07-14-viral-feed-remix-factory.md`.*
