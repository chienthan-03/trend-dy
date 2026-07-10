# AI Content Factory MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an internal single-tenant factory that crawls per-genre Douyin ranking metadata (S/A tiers), imports web-novel text, builds a Story Graph, and generates Vietnamese storytelling + packaging assets with export zip.

**Architecture:** Modular monolith — NestJS API + BullMQ workers, Next.js dashboard, Postgres 16 + pgvector, Redis, S3-compatible storage, AI Gateway via Vercel AI SDK. Douyin access is behind `DouyinRankingAdapter` (metadata only, `research_only` by default).

**Tech Stack:** Next.js (App Router) + Tailwind + shadcn/ui · NestJS · Prisma · Postgres + pgvector · Redis + BullMQ · Nest httpOnly session cookie · Vercel AI SDK · Docker Compose · Vitest

**Spec:** `docs/superpowers/specs/2026-07-10-ai-content-factory-design.md`

---

## Scope boundary

**In this plan (MVP):** auth, projects/stories/chapters, novel import (TXT/EPUB + single URL), chunk/embed, understand → Story Graph, generate (storytelling + packaging), light assets + zip export, per-genre Douyin boards/crawl/classify/tier, Discovery UI, Jobs UI, usage logging.

**Out:** Douyin video download/ASR/repost, RSS sync, OCR, TTS audio, Neo4j, multi-tenant, Movie/Anime production pipelines.

---

## File structure (greenfield)

```
apps/
  web/                          # Next.js dashboard
    src/app/(auth)/login/page.tsx
    src/app/(app)/layout.tsx
    src/app/(app)/discovery/page.tsx
    src/app/(app)/library/page.tsx
    src/app/(app)/stories/[id]/page.tsx
    src/app/(app)/stories/[id]/graph/page.tsx
    src/app/(app)/stories/[id]/generate/page.tsx
    src/app/(app)/jobs/page.tsx
    src/app/(app)/analytics/page.tsx
    src/lib/api-client.ts
  api/                          # NestJS API + workers entry
    src/main.ts
    src/app.module.ts
    src/modules/auth/
    src/modules/projects/
    src/modules/sources/
    src/modules/stories/
    src/modules/import/
    src/modules/understand/
    src/modules/generate/
    src/modules/assets/
    src/modules/jobs/
    src/modules/viral/          # Douyin boards/items/crawl
    src/modules/prompts/
    src/modules/usage/
    src/workers/worker.main.ts
    src/workers/processors/
      import.processor.ts
      understand.processor.ts
      generate.processor.ts
      asset.processor.ts
      discovery.processor.ts
    src/ai/gateway.ts
    src/ai/prompts/
packages/
  shared/                       # shared types + genre enum
    src/genres.ts
    src/job-types.ts
    src/viral-tier.ts
prisma/
  schema.prisma
  migrations/
docker-compose.yml              # postgres+pgvector, redis, minio
.env.example
```

---

### Task 1: Monorepo scaffold + Docker deps

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `docker-compose.yml`, `.env.example`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/src/genres.ts`

- [ ] **Step 1: Create workspace root and shared genre enum**

```ts
// packages/shared/src/genres.ts
export const GENRES = [
  "movie_recap", "anime_recap", "manhwa_recap", "manhua_recap",
  "motion_comic", "web_novel", "regression", "apocalypse",
  "system", "cultivation", "fantasy", "zombie", "survival",
] as const;
export type Genre = (typeof GENRES)[number];
export const VIRAL_TIERS = ["S", "A", "B", "C"] as const;
export type ViralTier = (typeof VIRAL_TIERS)[number];
```

- [ ] **Step 2: Add concrete Docker Compose**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: factory
      POSTGRES_PASSWORD: factory
      POSTGRES_DB: factory
    volumes: [pgdata:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio12345
volumes:
  pgdata:
```

- [ ] **Step 3: Boot deps and verify**

Run: `docker compose up -d && docker compose ps`  
Expected: postgres, redis, minio healthy/up

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-workspace.yaml docker-compose.yml packages/shared .env.example
git commit -m "chore: scaffold monorepo and local dependencies"
```

---

### Task 1b: BullMQ + worker process bootstrap

**Files:**
- Create: `apps/api/src/queue/queue.module.ts`, `apps/api/src/queue/queues.ts`, `apps/api/src/workers/worker.main.ts`
- Test: `apps/api/src/queue/queues.spec.ts`

- [ ] **Step 1: Failing test — queue names include `import`, `understand`, `generate`, `asset`, `discovery`**

- [ ] **Step 2: Implement Redis connection + BullMQ `Queue` providers + empty processor registration hooks (queue-only; do not write Postgres Job yet — that is Task 2b after Prisma)**

- [ ] **Step 3: Add `worker.main.ts` Nest standalone context that registers noop processors**

- [ ] **Step 4: Document scripts: `pnpm --filter api start:api`, `pnpm --filter api start:worker`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: bootstrap BullMQ queues and worker process"
```

---

### Task 2: Prisma schema (core + viral + jobs)

**Files:**
- Create: `prisma/schema.prisma`
- Test: `apps/api/src/modules/stories/stories.schema.spec.ts` (optional smoke: client connects)

- [ ] **Step 1: Write Prisma models matching spec §4–5 + viral tables**

Include at minimum: `User`, `Project`, `Source`, `Story`, `Chapter`, `StoryChunk`, `Character`, `Ability`, `Location`, `Item`, `Arc`, `Event`, `EventCharacter`, `Relationship`, `PlotSignal`, `TimelineEntry`, `Job`, `PromptTemplate`, `GenerationOutput`, `Asset`, `UsageEvent`, `ViralBoard`, `ViralItem`, `ViralCrawlRun`.

Key fields on `ViralBoard`: `genre`, `genresExtra`, `enabled`, `crawlIntervalSec`, `adapterConfig`.  
Key fields on `ViralItem`: `genres`, `genreConfidence`, `genreSource`, `trendScore`, `tier`, `usagePolicy`.

- [ ] **Step 2: Enable pgvector extension in first migration SQL**

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 3: Run migrate**

Run: `pnpm exec prisma migrate dev --name init`  
Expected: migrations applied, client generated

- [ ] **Step 4: Commit**

```bash
git add prisma
git commit -m "feat: add Prisma schema for factory and viral discovery"
```

---

### Task 2b: JobsService enqueue (Postgres Job + BullMQ)

**Files:**
- Create: `apps/api/src/modules/jobs/jobs.service.ts`, `apps/api/src/modules/jobs/jobs.module.ts`
- Test: `apps/api/src/modules/jobs/jobs.service.spec.ts`

- [ ] **Step 1: Failing test — enqueue inserts Job row then adds BullMQ job with same id**

- [ ] **Step 2: Implement `JobsService.enqueue({ type, storyId?, payload, idempotencyKey? })` — upsert/skip if idempotency key matches active job; always persist Postgres first**

- [ ] **Step 3: Base processor helper updates `Job.status` / `error` / timestamps; **all later tasks must call `JobsService.enqueue`, never raw `queue.add`****

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: persist jobs then enqueue to BullMQ"
```

---

### Task 3: NestJS app shell + session auth

**Files:**
- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/auth/*`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Test: `apps/api/src/modules/auth/auth.service.spec.ts`

**Auth ownership (locked for MVP):** NestJS issues httpOnly session cookie (iron-session or JWT cookie). Next.js login form posts to Nest; no separate Auth.js server in MVP (can swap later).

- [ ] **Step 1: Write failing test — login rejects bad password**

```ts
it("rejects invalid credentials", async () => {
  await expect(authService.validateUser("a@b.c", "wrong")).rejects.toThrow();
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter api test auth.service.spec.ts`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement Auth module + seed studio user from env; document local cookie strategy: Next.js rewrites `/api/v1/*` → Nest so httpOnly cookie is same-origin**

- [ ] **Step 3b: `.env.example` lists `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, `S3_*`/`MINIO_*`, AI gateway keys, `AI_DAILY_BUDGET_USD`, `DOUYIN_ADAPTER=fake`**

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Wire Next.js login calling `POST /api/v1/auth/login`; also `GET /me`, `POST /auth/logout`**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add credentials auth for single-tenant studio"
```

---

### Task 3b: Sources register + license gate API

**Files:**
- Create: `apps/api/src/modules/sources/*`
- Modify: `apps/web/src/app/(app)/discovery/page.tsx` (manual sources section)
- Test: `apps/api/src/modules/sources/sources.service.spec.ts`

- [ ] **Step 1: Failing test — cannot mark story importable unless `Source.licenseStatus === cleared`**

- [ ] **Step 2: Implement `GET|POST /sources`, `GET|PATCH /sources/:id` with `licenseStatus`: `cleared|pending|rejected|research_only`**

- [ ] **Step 3: UI stub only — or defer UI to Task 14; API must be complete here. Prefer: create Discovery stub page with sources section now, polish in Task 14**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: manual sources register with license gate"
```

---

### Task 4: Projects + Stories + Chapters CRUD API

**Files:**
- Create: `apps/api/src/modules/projects/*`, `apps/api/src/modules/stories/*`
- Test: `apps/api/src/modules/stories/stories.service.spec.ts`

- [ ] **Step 1: Failing test — create story under project returns id + default language vi**

- [ ] **Step 2: Implement CRUD endpoints from spec §7 (`/projects`, `/stories`, chapters list)**

- [ ] **Step 3: Tests pass; commit**

```bash
git commit -m "feat: add projects and stories CRUD"
```

---

### Task 5: Import pipeline (TXT + EPUB + single URL) + object storage

**Files:**
- Create: `apps/api/src/modules/import/*`, `apps/api/src/workers/processors/import.processor.ts`
- Test: `apps/api/src/modules/import/parsers/txt.parser.spec.ts`, `epub.parser.spec.ts`, `url-fetch.spec.ts`

- [ ] **Step 1: Failing tests for TXT and EPUB → chapters[]**

```ts
it("parses txt into chapters by heading markers", () => {
  const chapters = parseTxt("Chương 1\nA\nChương 2\nB");
  expect(chapters).toHaveLength(2);
});
```

- [ ] **Step 2: Failing test — `fetch_url` job downloads HTML/text from cleared URL and extracts main text**

- [ ] **Step 3: Implement parsers + `POST /stories/:id/import` accepting multipart file **or** `{ url }` → enqueue `parse_file` / `fetch_url` then `chunk_embed`**

- [ ] **Step 4: Import processor: store raw in MinIO, write `Chapter` rows with `contentHash`, status `imported`**

- [ ] **Step 5: Hard-reject import when story.`sourceId` points to source with `licenseStatus !== cleared`**

- [ ] **Step 6: Tests pass; commit**

```bash
git commit -m "feat: import TXT/EPUB/URL into chapters via queue"
```

---

### Task 6: Chunk + embed (pgvector)

**Files:**
- Create: `apps/api/src/modules/import/chunker.ts`, `apps/api/src/ai/gateway.ts`, `apps/api/src/workers/processors/import.processor.ts` (extend)
- Test: `apps/api/src/modules/import/chunker.spec.ts`

- [ ] **Step 1: Failing test — chunker respects ~800–1200 token windows with overlap**

- [ ] **Step 2: Implement chunker + embedding via AI Gateway (`text-embedding-3-small` or configured model)**

- [ ] **Step 3: Persist `StoryChunk` with `embedding`; skip re-embed if `contentHash` unchanged**

- [ ] **Step 4: Log `UsageEvent`; commit**

```bash
git commit -m "feat: chunk chapters and store pgvector embeddings"
```

---

### Task 7: Understand worker → Story Graph extract

**Files:**
- Create: `apps/api/src/modules/understand/*`, `apps/api/src/ai/prompts/extract.chapter.v1.ts`, `apps/api/src/workers/processors/understand.processor.ts`
- Test: `apps/api/src/modules/understand/entity-resolver.spec.ts`

- [ ] **Step 1: Define Zod schema `extract.chapter.v1` (characters, relationships, events, locations, abilities, items, plot_signals, chapter_summary)**

- [ ] **Step 2: Failing test — entity resolver merges aliases case-insensitively within story**

- [ ] **Step 3: Implement extract job (mid-tier LLM structured output) + upsert graph tables + chapter summary VI**

- [ ] **Step 4: `POST /stories/:id/understand` enqueues per-chapter jobs; minimal arc rollup heuristic (N chapters → arc rows)**

- [ ] **Step 5: Implement `GET /stories/:id/graph` read model (characters, arcs, events, relationships)**

- [ ] **Step 6: Tests pass; commit**

```bash
git commit -m "feat: understand chapters into story graph"
```

---

### Task 8: Prompt templates + Generate worker (storytelling + packaging)

**Files:**
- Create: `apps/api/src/modules/prompts/*`, `apps/api/src/modules/generate/*`, `apps/api/src/ai/prompts/*.ts`
- Test: `apps/api/src/modules/generate/context-builder.spec.ts`

- [ ] **Step 1: Seed `PromptTemplate` rows for keys:**  
  `summary.chapter`, `summary.arc`, `script.narration`, `outline.video`, `pack.title`, `pack.thumbnail_text`, `pack.description`, `pack.tags`, `pack.hook_3s` (locale `vi`)

- [ ] **Step 2: Failing test — context builder returns graph slice + top-k chunks, never full raw book**

- [ ] **Step 3: Implement `POST /stories/:id/generate` + generate processor; dedupe on `(type, promptVersion, inputHash)`; also `GET /stories/:id/outputs` and `GET /outputs/:id`**

- [ ] **Step 4: Soft review: outputs saved with `status=ready`; `PATCH /outputs/:id` for content/status**

- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "feat: generate VI storytelling and packaging outputs"
```

---

### Task 9: Light assets + export zip

**Files:**
- Create: `apps/api/src/modules/assets/*`, `apps/api/src/workers/processors/asset.processor.ts`
- Test: `apps/api/src/modules/assets/srt.spec.ts`

- [ ] **Step 1: Failing test — voice script → rough SRT cues by sentence timing heuristic**

- [ ] **Step 2: Implement `POST /outputs/:id/assets` with `{ types: ["voice_script","subtitle","scene_list","banner_text"] }` enqueue asset jobs**

- [ ] **Step 3: Implement asset processor for those types**

- [ ] **Step 4: `POST /stories/:id/export` selects output/asset ids, builds zip in MinIO, returns signed URL**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: build light video assets and export zip"
```

---

### Task 10: Douyin adapter interface + fake adapter (TDD)

**Files:**
- Create: `apps/api/src/modules/viral/douyin-ranking.adapter.ts`, `apps/api/src/modules/viral/adapters/fake-douyin.adapter.ts`
- Test: `apps/api/src/modules/viral/adapters/fake-douyin.adapter.spec.ts`

- [ ] **Step 1: Define interface only (no bypass logic in-repo)**

```ts
export type DouyinRankItem = {
  externalId: string;
  rankPosition: number;
  title: string;
  caption: string;
  authorHandle: string;
  stats: Record<string, number>;
  hashtags: string[];
  coverUrl?: string;
  canonicalUrl?: string;
  publishedAt?: Date;
  rawPayload: unknown;
};

export interface DouyinRankingAdapter {
  fetchBoard(boardKey: string, config: Record<string, unknown>): Promise<DouyinRankItem[]>;
}
```

- [ ] **Step 2: Fake adapter returns deterministic fixtures for tests/dev**

- [ ] **Step 3: Document that production adapter is studio-provided plugin via env `DOUYIN_ADAPTER=fake|live` — live module loaded dynamically; **do not** commit ToS-bypass code**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add Douyin ranking adapter interface and fake adapter"
```

---

### Task 11: Viral boards CRUD + crawl → classify → tier jobs

**Files:**
- Create: `apps/api/src/modules/viral/*`, `apps/api/src/workers/processors/discovery.processor.ts`
- Test: `apps/api/src/modules/viral/tier-scorer.spec.ts`, `genre-classifier.spec.ts`

- [ ] **Step 1: Failing tests**
  - Board create requires `genre` in `GENRES`
  - Tier scorer ranks within same genre only
  - Classifier returns genres from caption/hashtags (mock LLM)

- [ ] **Step 2: Implement APIs:**  
  `GET|POST /viral/boards`, `GET|PATCH /viral/boards/:id` (toggle `enabled`, update `crawlIntervalSec`, label, adapterConfig), `POST /viral/boards/:id/crawl`, `GET /viral/items`, `GET /viral/items/:id`, `PATCH /viral/items/:id`, `GET /viral/genres/top`, `GET /viral/crawl-runs` (filter by boardId)

- [ ] **Step 3: Processor chain:** `douyin_rank_crawl` writes `ViralCrawlRun` + upsert items (`usagePolicy=research_only`) → `douyin_genre_classify` → `douyin_tier_score` (S/A/B/C)

- [ ] **Step 4: Repeatable BullMQ scheduler per enabled board (`crawlIntervalSec`)**

- [ ] **Step 5: Tests pass; commit**

```bash
git commit -m "feat: per-genre Douyin crawl, classify, and S/A tiering"
```

---

### Task 12: Viral-inspire packaging context

**Files:**
- Modify: `apps/api/src/modules/generate/context-builder.ts`
- Test: `apps/api/src/modules/generate/context-builder.spec.ts`

- [ ] **Step 1: Failing test — when `inspireGenre` set, context includes only tier S/A viral captions for that genre**

- [ ] **Step 2: Implement optional `options.inspireFromViral` on generate; never paste as final copy — few-shot inspire only**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: optional viral S/A inspire for packaging prompts"
```

---

### Task 13: Jobs API + SSE progress

**Files:**
- Create: `apps/api/src/modules/jobs/*`
- Test: `apps/api/src/modules/jobs/jobs.service.spec.ts`

- [ ] **Step 1: Implement `GET /jobs`, `GET /jobs/:id`, `POST /jobs/:id/retry`, `POST /jobs/:id/cancel`, SSE `GET /jobs/:id/events`**

- [ ] **Step 2: Ensure `Job.storyId` denormalized for filters**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: jobs listing, retry, and SSE progress"
```

---

### Task 14: Dashboard UI (Discovery, Library, Generate, Jobs)

**Files:**
- Create: pages under `apps/web/src/app/(app)/...`
- Create: `apps/web/src/lib/api-client.ts`

- [ ] **Step 1: App shell nav — Discovery · Library · Jobs · Analytics**

- [ ] **Step 2: Discovery page — genre tabs, default filter tier S/A, board status, crawl trigger, crawl-run history panel, manual sources/license section**

- [ ] **Step 3: Library — stories list, import upload + URL field, chapter list, trigger understand**

- [ ] **Step 4: Story pages — overview, read-only graph page (`GET /stories/:id/graph`), generate page (inspire toggle, outputs, status edit, export)**

- [ ] **Step 5: Jobs page — table + retry**

- [ ] **Step 6: Manual smoke against fake Douyin + sample EPUB; commit**

```bash
git commit -m "feat: dashboard for discovery, library, graph, generate, jobs"
```

---

### Task 15: Analytics usage + daily AI budget guard

**Files:**
- Create: `apps/api/src/modules/usage/*`
- Test: `apps/api/src/modules/usage/budget.guard.spec.ts`

- [ ] **Step 1: Failing test — when daily USD cap exceeded, generate/understand queues pause**

- [ ] **Step 2: Implement `GET /analytics/usage` + soft cap from env `AI_DAILY_BUDGET_USD`**

- [ ] **Step 3: Analytics page shows tokens/cost; commit**

```bash
git commit -m "feat: usage analytics and daily AI budget guard"
```

---

### Task 16: End-to-end MVP verification checklist

**Files:**
- Create: `docs/superpowers/plans/mvp-smoke-checklist.md` (optional short)

- [ ] **Step 1: Run `docker compose up -d` + `pnpm dev` (api, worker, web)**

- [ ] **Step 2: Crawl fake board for `system` → items classified → S/A visible in Discovery**

- [ ] **Step 3: Import sample web novel → understand → generate script + pack.title → export zip**

- [ ] **Step 4: Confirm no Douyin media files in object storage**

- [ ] **Step 5: Commit any fixes; tag `mvp-0.1.0` if green**

```bash
git commit -m "chore: MVP smoke verification fixes"
```

---

## Execution notes

- Prefer `@superpowers:subagent-driven-development` — one task per subagent, review between tasks.
- Live Douyin adapter is a **studio-owned plugin**; plan stays legal-safe (metadata + research_only).
- TDD for parsers, resolver, tier scorer, context builder, budget guard; UI can be smoke-tested manually in Task 14–16.
- Single URL import is **Task 5** (required, not stretch). DOCX/PDF/HTML remain post-MVP stretch.
- Sources + license gate are **Task 3b** (required before import).
- BullMQ bootstrap is **Task 1b** (required before any enqueue).

---

## Plan split (optional later)

If parallelizing teams:
1. **Plan A:** Tasks 1–9, 13–15 (novel factory)  
2. **Plan B:** Tasks 10–12 + Discovery UI (Douyin)  
Keep this file as the integrated MVP sequence unless staffing requires the split.
