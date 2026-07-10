# AI Content Factory — PRD + Technical Design Document

**Status:** Approved for implementation planning  
**Date:** 2026-07-10 (rev. Douyin genre boards + tier — approved)  
**Audience:** Engineering, AI, and product team building the internal studio tool  
**Post-read action:** Implement the MVP modular monolith against this spec without re-opening architecture decisions until the 6-month evaluation gates — except Douyin connector details, which are intentionally adapter-scoped.

---

## 0. Product decisions (locked)

| Decision | Value |
|---|---|
| Product model | Single-tenant internal tool for one creative studio |
| Output language | Vietnamese (primary) |
| MVP content | Web Novel, text-first **+ Douyin viral ranking discovery** |
| Content sources | (1) Manual upload + single licensed URL import for novels (2) **Full-auto Douyin ranking crawl (metadata)** (3) RSS/feed sync: 3-month roadmap |
| Douyin acquisition | Full-auto crawl of Douyin ranking/hot lists — **studio accepts platform ToS and legal risk** |
| Douyin top-tier model | **Per-genre boards** + AI genre auto-tag (editor-editable) + score/tier **within genre** (not global Douyin top) |
| Douyin use in MVP | Trend intelligence only: ranking metadata, captions, stats — **not** auto re-upload / pirate full videos |
| Review policy | Soft review — outputs usable at `status=ready`; optional status transitions only |
| Target scale (12 months) | ~5–10 titles/month, ~50–100 chapters/week |
| MVP outputs | Storytelling + packaging + light video assets (text-only, no render) |
| Architecture | Modular monolith + async workers (Approach 2) |

**MVP storytelling outputs:** chapter summary, arc summary, narration script, video outline  
**MVP packaging outputs:** titles, thumbnail text, description, tags, 3-second hook  
**MVP light assets (from script):** voice script (text), SRT cues, scene list, banner text, export zip  
**MVP discovery scope:**
- Manual source register + `license_status` for novel sources
- **DouyinRankingAdapter:** scheduled full-auto crawl of **genre-whitelisted boards** (1..n boards per genre) → `viral_items`
- After crawl: **AI genre classify** from caption/hashtags (editor can override) → filter to studio niche
- **Top-tier = S/A within each genre** via `trend_score` (rank + velocity) + light AI rubric on caption/hook quality
- Viral S/A items feed Discovery UI + optional “inspire packaging / topic suggest” for novel production
- **No** automated RSS polling until month 3

**Genre catalog (shared enum for stories + viral items):**  
`movie_recap`, `anime_recap`, `manhwa_recap`, `manhua_recap`, `motion_comic`, `web_novel`, `regression`, `apocalypse`, `system`, `cultivation`, `fantasy`, `zombie`, `survival`

**Explicitly out of MVP:** bulk download of Douyin media for republishing, OCR, ASR on Douyin video (month 3+ and only with cleared rights), TTS audio render, Neo4j, multi-tenant SaaS, Movie/Anime/Motion Comic **production** pipelines (discovery tags for those genres are in MVP; producing those formats is later), auto-publish to YouTube/Douyin

**Legal posture (non-negotiable in product copy):** Ranking crawl may violate Douyin Terms of Service and can create copyright exposure if media is reused. Spec stores **public ranking metadata** for internal editorial research. Any download/ASR/remake path requires explicit `license_status=cleared` (or documented fair-use legal sign-off) before workers proceed. Engineering must implement the Douyin connector as a **replaceable adapter**; this document does **not** specify anti-bot bypass techniques.

**Target genres (full catalog vision):** same catalog as above — MVP produces **Web Novel** assets; Douyin discovery tags/filters **all** catalog genres so studio sees top-tier per lane; genre-specific novel production packs land on the 6-month roadmap.

---

## 1. Overall architecture

### 1.1 Style

**Modular monolith + async workers.** One deployable backend with clear module boundaries; heavy AI work runs in BullMQ workers. Postgres is the system of record. Graph database is deferred.

### 1.2 Logical components

| Component | Responsibility |
|---|---|
| Dashboard (Next.js) | Discovery, Library, Story Graph, Generation, Assets, Queue/Jobs, Review, Export, Analytics |
| API (NestJS) | Auth, CRUD, enqueue jobs, read models, export |
| Workers | Import, Understand, Generate, Asset, **Douyin crawl + genre classify + tier score** |
| Postgres + pgvector | Relational SoT + embeddings + viral_items |
| Redis + BullMQ | Queues, retries, lightweight cache |
| Object storage (R2/S3) | Raw uploads, export zips, future audio |
| AI Gateway | Multi-provider LLM/embedding, cost logs, fallbacks |
| DouyinRankingAdapter | Pluggable connector: fetch **per-genre** ranking boards → normalize metadata |

### 1.3 Design principles

1. Postgres is source of truth for stories, graph entities, jobs, and outputs.
2. All AI work is asynchronous — API enqueues and returns `job_id`.
3. Generate from **Story Graph slice + retrieved chunks**, never from unbounded raw dumps.
4. Prompt templates are versioned artifacts with cost accounting.
5. Legal gate at import: every **production** source has `license_status`; uncleared sources cannot enter Import/Understand for republishable assets. Douyin ranking rows default to `research_only` until explicitly cleared.
6. Douyin crawl is **discovery/intelligence**, not a pirate CDN — MVP persists metadata + captions + stats only.

### 1.4 Module map

| Module | MVP | Notes |
|---|---|---|
| Content Discovery | Yes (core early) | Per-genre Douyin boards + AI genre tag + per-genre S/A tier; RSS month 3 |
| Content Import | Yes | TXT, EPUB, DOCX, PDF, HTML, single URL fetch (novels) |
| Story Understanding | Yes (core) | Entity extraction → Story Graph |
| Story Graph | Yes | Relational + JSONB + pgvector |
| AI Generation | Yes | Storytelling + packaging prompts; optional viral-inspired hooks from `viral_items` |
| Video Asset Generator | Yes (light) | Voice script, SRT, scene list, banner text — no video render |
| Dashboard | Yes | Discovery includes Douyin Viral board |
| OCR / ASR / Vision / TTS | No | Post-MVP (Douyin ASR only after cleared rights) |
| Publish | Export-only | Zip pack; no platform push in MVP |
| Analytics | Light | Token/$ usage, job success, viral board freshness |

---

## 2. System diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard (Next.js + Tailwind + shadcn/ui)                 │
│  Discovery (Douyin Viral) · Library · Graph · Generate · …  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + SSE
┌──────────────────────────▼──────────────────────────────────┐
│  API — NestJS                                               │
│  Auth · Projects · Sources · Viral · Stories · Jobs · …     │
└──────┬──────────────┬──────────────┬────────────────────────┘
       │              │              │
       ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────────┐
│ Postgres16 │ │ Redis      │ │ Object Storage │
│ + pgvector │ │ BullMQ     │ │ R2 / S3        │
└────────────┘ └─────┬──────┘ └────────────────┘
                     │
     ┌───────────────┼───────────────┬────────────┐
     ▼               ▼               ▼            ▼
 Import Worker  Understand     Generate/Asset  Douyin Crawl
     │               │               │            │
     └───────────────┴───────────────┘            │
                     │                            ▼
              ┌──────▼──────┐           ┌──────────────────┐
              │ AI Gateway  │           │ DouyinRanking    │
              │ LLM·Embed   │           │ Adapter (plugin) │
              └─────────────┘           └──────────────────┘
```

### 2.1 Module — Douyin Viral Ranking (early scope)

**Goal:** Automatically refresh **genre-whitelisted** Douyin ranking boards, classify items into the studio genre catalog, and surface **top-tier (S/A) per genre** — not a single global “Douyin hot” list.

**Board model (option C — locked):**
- Each `viral_boards` row has required `genre` (catalog enum) + optional secondary genres
- Studio configures 1..n boards per genre (hashtag board, hot board, account-set board, etc.)
- Crawler only runs **enabled** boards (whitelist) — no unbounded whole-platform scrape mandate beyond configured boards

**Pipeline after each crawl:**
1. Upsert `viral_items` metadata
2. Job `douyin_genre_classify` — mid-tier LLM (or rules+LLM) on caption/hashtags → `genres[]` + `genre_confidence`; seed from board.genre; editor can PATCH override
3. Job `douyin_tier_score` — **within each genre**: combine rank, velocity (Δ stats across crawls), engagement density → `trend_score`; light AI rubric on hook/caption quality → `tier` in `{S,A,B,C}`
4. Discovery UI defaults to filter `tier in (S,A)` + genre tabs

**MVP stores per item (metadata only):**
- external_id, board_id, rank_position, title/caption, author handle, stats, hashtags, cover URL (link only), published_at, crawled_at, raw_payload
- `genres text[]`, `genre_confidence`, `genre_source` (`board|ai|editor`)
- `trend_score`, `tier` (`S|A|B|C`), `usage_policy` default `research_only`

**MVP does not:** download video bytes, strip watermarks, mass-repost, or document anti-bot bypass techniques.

**Scheduler:** BullMQ repeatable job per board (`crawl_interval_sec`). Classify + tier score chain after successful crawl.

**Downstream (MVP):**
1. Discovery UI: tabs/filter by **genre**, tier S/A, board, hashtag
2. “Suggest packaging” — only from S/A items in selected genre as few-shot inspire (original VI copy)
3. Optional link `viral_item_id` on a `story` as inspiration reference

**Later (not MVP):** cleared-rights ASR → beat/hook formula extract; competitive script breakdown per genre.
---

## 3. Data flow

```
⓪ DOUYIN RANKING CRAWL (MVP, scheduled, per-genre boards)
   DouyinRankingAdapter → viral_items
   → genre_classify (AI, editor-overridable)
   → tier_score within genre (S/A/B/C)
   │
   ├─► Discovery UI (genre tabs, default tier S/A, research_only)
   └─► optional inspire context for pack.* (S/A + matching genre)
        │
Source register / Upload / single URL (novels)
        │
        ▼
① SOURCE REGISTER (MVP)  ·  RSS ITEM INGEST (month 3+)
   Persist sources + source_items (metadata, license_status, tags)
        │
        ▼
② IMPORT JOB
   Parse → normalize chapters → store raw file → chunk → embed
        │
        ▼
③ UNDERSTAND JOB (per chapter, then rollup)
   LLM structured extract → upsert graph nodes/edges → summaries
        │
        ▼
④ GENERATE JOB (on demand)
   Load prompt template → graph slice + top-k chunks
   (+ optional viral inspire snippets) → LLM → outputs
        │
        ▼
⑤ ASSET JOB (optional)
   Voice script, SRT, scene list, banner text → optional export zip
```

**Soft review (single status model):** `generation_outputs.status` starts as `ready` and is immediately usable/exportable. Optional later transitions: `ready → reviewed → approved`, or `ready → rejected`, or `archived`. There are **no** separate boolean review flags — PATCH updates `status` and/or `content` only. Export does **not** require `approved`.

**Idempotency:** job key = `storyId + jobType + chapterId? + promptVersion + contentHash`. Douyin crawl upsert key = `(board_key, external_id, crawl_bucket)`.

---

## 4. Database schema

### 4.1 Store roles

| Store | Role | Rationale |
|---|---|---|
| Postgres | System of record | ACID, JSONB, fits scale A |
| pgvector | Chunk embeddings + retrieval | Avoid separate vector SaaS at low volume |
| Redis | BullMQ + short-lived cache | Standard, cheap |
| Object storage | Blobs | Durable raw + exports |
| Neo4j / dedicated graph DB | **Not in MVP** | Re-evaluate at 6–12 months if multi-hop queries hurt |

### 4.2 Core tables

```sql
-- Identity (single-tenant studio)
users (id, email, name, role, created_at)
projects (id, name, slug, style_guide jsonb, created_at)

-- Sources & discovery
sources (
  id, project_id, name, type, -- manual|rss|url|douyin_board
  base_url, license_status, -- cleared|pending|rejected|research_only
  config jsonb, last_synced_at, created_at
)
source_items (
  id, source_id, external_key, title, url,
  published_at, genre tags[], trend_score,
  metadata jsonb, status, created_at
)

-- Douyin viral ranking (MVP early)
viral_boards (
  id, project_id, board_key, label,
  genre, -- required catalog enum; primary niche for this board
  genres_extra text[], -- optional secondary
  adapter_config jsonb,
  enabled, crawl_interval_sec, last_crawled_at
)
viral_items (
  id, board_id, external_id,
  rank_position, title, caption, author_handle,
  stats jsonb, hashtags text[], cover_url, canonical_url,
  published_at, crawled_at,
  genres text[], genre_confidence float,
  genre_source, -- board|ai|editor
  trend_score, tier, -- S|A|B|C ; scored within genre
  usage_policy, -- research_only|cleared|blocked
  raw_payload jsonb
)
viral_crawl_runs (
  id, board_id, status, started_at, finished_at,
  item_count, error, meta jsonb
)

-- Library
stories (
  id, project_id, source_id null,
  title, language, genre text[], tags text[],
  status, metadata jsonb, created_at, updated_at
)
chapters (
  id, story_id, number, title,
  raw_text, clean_text, content_hash,
  word_count, status, imported_at
)
story_chunks (
  id, chapter_id, ordinal, text,
  token_estimate, embedding vector(1536),
  content_hash
)

-- Jobs & outputs
jobs (
  id, type, status, priority,
  story_id null, -- denormalized for listing/filters; also present in payload
  payload jsonb, result jsonb,
  attempts, max_attempts, error,
  created_at, started_at, finished_at
)
prompt_templates (
  id, key, version, locale, body,
  model_hint, output_schema jsonb, active, created_at
)
generation_outputs (
  id, story_id, chapter_id null, arc_id null,
  type, prompt_template_id, prompt_version,
  input_ref jsonb, content text, content_json jsonb,
  status, -- ready|reviewed|approved|rejected|archived
  tokens_in, tokens_out, cost_usd,
  created_at, updated_at
)
assets (
  id, story_id, generation_output_id null,
  type, uri, meta jsonb, created_at
)
usage_events (
  id, job_id null, provider, model,
  tokens_in, tokens_out, cost_usd, created_at
)
```

### 4.3 Indexes (minimum)

- `UNIQUE (story_id, chapters.number)`
- `UNIQUE (story_id, content_hash)` on chapters where applicable
- GIN on `stories.genre`, `stories.tags`
- HNSW/IVFFlat on `story_chunks.embedding`
- `(jobs.status, jobs.priority, jobs.created_at)`
- `UNIQUE (prompt_templates.key, prompt_templates.version)`

---

## 5. Story Graph schema

### 5.1 Entities

```sql
characters (
  id, story_id, name, aliases text[],
  role, summary, attributes jsonb
)
abilities (
  id, story_id, character_id null,
  name, type, description, power_level null, attributes jsonb
)
locations (
  id, story_id, name, type, description, attributes jsonb
)
items (
  id, story_id, name, type, description,
  owner_character_id null, attributes jsonb
)
arcs (
  id, story_id, name, order_index, summary,
  start_chapter_id null, end_chapter_id null
)
events (
  id, story_id, chapter_id, arc_id null,
  type, summary, importance int,
  timeline_order int, payload jsonb
)
event_characters (
  event_id, character_id, role -- actor|victim|mention|...
)
relationships (
  id, story_id,
  from_character_id, to_character_id,
  type, description, since_chapter_id null
)
plot_signals (
  id, story_id, chapter_id,
  kind, -- plot_twist|hook|cliffhanger
  text, strength int, payload jsonb
)
timeline_entries (
  id, story_id, event_id, position, label
)
```

### 5.2 Logical edges

- Character → Ability (`abilities.character_id`)
- Character ↔ Character (`relationships`)
- Event → Characters (`event_characters`)
- Event → Chapter / Arc
- Arc ordered on Timeline via `timeline_entries` / `arcs.order_index`

### 5.3 Genre-specific flexibility

Use `attributes jsonb` / `payload jsonb` for System skills, Cultivation realms, Regression checkpoints, etc. Do not fork tables per genre in MVP.

### 5.4 Extraction contract (chapter understand)

LLM must return JSON conforming to a fixed schema version, e.g. `extract.chapter.v1`, including: characters[], relationships[], events[], locations[], abilities[], items[], plot_signals[], chapter_summary.

Entity resolution runs after extract: normalize names, merge aliases within `story_id`, prefer existing IDs on fuzzy match above threshold.

---

## 6. AI pipelines

### 6.1 Model map

| Step | Model tier | Example |
|---|---|---|
| Embedding | Small embedding | `text-embedding-3-small` |
| Chapter extract | Mid LLM | GPT-4.1-mini / Claude Haiku / Gemini Flash |
| Arc / story rollup | Mid or Strong | Prefer mid; strong if noisy |
| Narration script / outline | Strong LLM | GPT-4.1 / Claude Sonnet |
| Titles, tags, hooks (n-best) | Mid LLM | Batch variants |
| OCR (later) | Vision or self-host OCR | GPT-4o / Gemini / PaddleOCR |
| ASR (later) | Whisper-class | Whisper / AssemblyAI |
| TTS (later) | Neural TTS | ElevenLabs / Azure |

All calls go through an **AI Gateway** (Vercel AI Gateway, OpenRouter, or thin internal proxy) for provider failover, rate limits, and `usage_events`.

### 6.2 Pipeline P1 — Import

1. Detect format (TXT, EPUB, DOCX, PDF, HTML, URL fetch).
2. Parse → `clean_text`; compute `content_hash`.
3. Split into chapters if needed.
4. Chunk ~800–1200 tokens, overlap ~100.
5. Embed → `story_chunks`.
6. Store original blob in object storage.

### 6.3 Pipeline P2 — Understand (per chapter)

1. Build extract prompt + JSON schema `extract.chapter.v1`.
2. Call mid-tier LLM with structured output.
3. Entity resolution / alias merge.
4. Upsert graph tables.
5. Write chapter summary (VI).

### 6.4 Pipeline P3 — Rollup

1. Aggregate chapter summaries → propose arcs.
2. Merge/confirm arcs; link start/end chapters.
3. Build story-level world / power-system notes into `stories.metadata` or dedicated rows later.

### 6.5 Pipeline P4 — Generate

1. Load active `prompt_templates` for `(key, locale=vi)`.
2. Context = graph slice + top-k chunks (4–8) + project `style_guide`.
3. Strong/mid LLM per type; validate length/format.
4. Persist `generation_outputs` + usage.

**MVP generation keys:**  
`summary.chapter`, `summary.arc`, `script.narration`, `outline.video`, `pack.title`, `pack.thumbnail_text`, `pack.description`, `pack.tags`, `pack.hook_3s`

### 6.6 Pipeline P5 — Assets

From approved-or-ready script:

- `voice_script` (speakable VI)
- `subtitle` (SRT cues)
- `scene_list` (ordered beats)
- `banner_text`
- Optional `export_zip` bundling selected outputs

No full video render in this system.

---

## 7. API design

Base: versioned REST under `/api/v1`. Auth required except health.

```
Auth
  POST /auth/login
  POST /auth/logout
  GET  /me

Projects
  GET|POST /projects
  GET|PATCH|DELETE /projects/:id

Sources / Discovery
  GET|POST /sources
  GET|PATCH /sources/:id
  POST /sources/:id/sync            # month 3+ RSS; MVP may stub 501
  GET /discovery/items              # month 3+ RSS inbox; MVP lists manual sources only

Douyin Viral (MVP)
  GET|POST /viral/boards            # board requires genre
  GET|PATCH /viral/boards/:id
  POST /viral/boards/:id/crawl      # enqueue ranking crawl
  GET /viral/items                  # filter genre, tier, board, score, hashtag
  GET /viral/items/:id
  PATCH /viral/items/:id            # usage_policy; genres override (genre_source=editor); tier override optional
  GET /viral/genres/top             # convenience: S/A items grouped by genre
  GET /viral/crawl-runs

Library
  GET|POST /stories
  GET|PATCH|DELETE /stories/:id
  GET /stories/:id/chapters
  GET /stories/:id/chapters/:chapterId
  GET /stories/:id/graph

Import
  POST /stories                     # create story shell (title, project, source_id?)
  POST /stories/:id/import          # requires existing story; multipart file and/or { url }
  POST /stories/:id/import/batch    # multiple files into existing story

Jobs
  GET /jobs
  GET /jobs/:id
  GET /jobs/:id/events              # SSE progress
  POST /jobs/:id/retry
  POST /jobs/:id/cancel

Understand / Generate
  POST /stories/:id/understand      # { chapter_ids?:[], rollup?: bool }
  POST /stories/:id/generate        # { type, chapter_id?, arc_id?, options? }
  GET /stories/:id/outputs
  GET /outputs/:id
  PATCH /outputs/:id                # edit content and/or status (ready|reviewed|approved|rejected|archived)

Assets / Export
  POST /outputs/:id/assets          # { types: [] }
  POST /stories/:id/export          # { output_ids?: [], format: "zip" }

Admin
  GET|POST /prompt-templates
  GET|PATCH /prompt-templates/:id
  GET /analytics/usage
```

**Error shape:** `{ error: { code, message, details? } }`  
**Job enqueue response:** `{ job_id, status: "queued" }`

---

## 8. Worker design

### 8.1 Queues (BullMQ)

| Queue | Concurrency (MVP) | Job names |
|---|---|---|
| `discovery` | 2 | `douyin_rank_crawl`, `douyin_genre_classify`, `douyin_tier_score`; month 3+: `rss_sync` |
| `import` | 2 | `parse_file`, `fetch_url`, `chunk_embed` |
| `understand` | 2 | `extract_chapter`, `resolve_entities`, `rollup_arcs` |
| `generate` | 3 | `gen_<type>` |
| `asset` | 2 | `build_srt`, `scene_list`, `export_zip` |

### 8.2 Reliability

- Retry: exponential backoff, `max_attempts` 3–5 by queue
- Dead-letter / failed set for manual replay
- Timeouts: import 10m, understand 5m, generate 3m, asset 5m
- Circuit breaker on provider 429/5xx
- Daily soft budget on `generate` + `understand` — pause queue and alert when exceeded
- Progress events published for SSE

### 8.3 Worker process layout

MVP: one Node worker process consuming all queues (named processors). Scale by adding worker replicas with queue-specific concurrency via env.

---

## 9. Roadmap — MVP (weeks 1–6)

| Week | Deliverable |
|---|---|
| 1–2 | Auth, projects/stories/chapters CRUD, manual source register + license gate, TXT/EPUB upload + single URL import, parse, chunk, embed; **per-genre Douyin boards + crawl adapter + viral_items + genre classify + tier score + Discovery Viral UI (genre tabs, S/A default)** |
| 3–4 | Understand worker, Story Graph tables, chapter summary; **minimal** arc rollup; harden crawl scheduler + per-genre top lists |
| 5 | Generate: chapter/arc summary, narration script, video outline; viral-inspire from **S/A + matching genre** |
| 6 | Packaging outputs, light assets, Jobs UI, thin Review, export zip, usage/cost logging |

**Not in 6-week MVP:** Douyin full-video download/ASR/repost, automated RSS/feed polling, TTS audio files, polished Review workflow UI (that lands month 3).

**MVP success criteria**

- Per-genre boards crawl on schedule; items get AI genres (editable) + tier S/A/B/C **within genre**
- Discovery shows Top S/A filtered by genre tabs
- Import cleared web novel → Story Graph → VI script/packaging (+ optional viral inspire) → export zip
- Cost + crawl run history visible

---

## 10. Roadmap — 3 months

- Automated licensed RSS/URL discovery sync with hard `license_status` gate + simple trend score
- Improved arc rollup + character profiles + basic timeline UI
- Prompt versioning + light A/B
- Polished soft review UI (queues, filters; status model already in MVP)
- Better entity resolution (aliases)
- Stable DOCX/PDF/HTML import
- Per-story and per-day usage dashboard
- Channel style guides on `projects.style_guide`

---

## 11. Roadmap — 6 months

- Genre packs: Regression, System, Cultivation, Apocalypse (JSONB attrs + prompts)
- Power progression, world analysis, plot-twist lists, shorts ideas
- OCR path for Manhwa/Manhua images
- Optional Meilisearch or richer Postgres FTS
- Richer graph visualization; **decision gate: adopt Neo4j or not**
- Optional TTS audio drafts
- Scheduler for source sync + incremental re-understand

---

## 12. Roadmap — 12 months

- Anime/Movie recap path (ASR + light scene detection)
- Motion comic / vision assist
- Optional EN outputs
- Quality scoring + editor feedback → prompt/model tuning
- Script auto-edit suggestions
- Scale: dedicated worker pools, read replica, optional graph DB
- Ops analytics: import → publish-ready latency, acceptance rate

---

## 13. Cost analysis (indicative, scale A)

Assumptions: ~80 chapters/week; understand + 2–3 generates/chapter; mix of mid/strong models.

| Item | USD / month |
|---|---|
| Compute (API + workers + Postgres + Redis) | 40–100 |
| Object storage + egress | 5–15 |
| Embeddings | 5–20 |
| LLM (understand + generate) | 80–250 |
| Douyin crawl ops (proxy/infra if used — studio-managed) | 0–80+ (highly variable; ToS risk) |
| **Total (rough)** | **~150–450+** |

Re-processing an entire catalog or forcing strong models on extract will spike cost. Budget caps are mandatory.

---

## 14. Bottleneck analysis

1. **LLM latency / rate limits** — bulk understand after full-book import  
2. **Entity resolution quality** — inconsistent character names across chapters  
3. **Context limits** — long arcs must use retrieval, not full text  
4. **Dirty PDF/EPUB** — parse failures need manual repair path  
6. **Crawl flakiness / blocks** — Douyin ranking adapter failures; mitigate with retries, crawl_runs visibility, manual trigger  
7. **Single host CPU** — batch embedding; mitigate with off-peak jobs  

---

## 15. Technical risks

| Risk | Mitigation |
|---|---|
| **Douyin ToS / account / IP blocks from full-auto crawl** | Adapter isolation; backoff; studio accepts risk; prefer official APIs if/when available; no bypass cookbook in-repo |
| **Copyright if viral media reused** | Default `usage_policy=research_only`; block media download/ASR until `cleared`; never auto-repost |
| Script hallucination | Graph + chunk grounding; chapter citations; human edit |
| Copyright / unclear novel sources | Required `license_status`; import audit log |
| Prompt drift | Versioned templates; snapshot inputs/outputs |
| Provider outage | Gateway multi-provider fallback |
| Premature rigid schema | JSONB for genre attributes |
| Over-building graph DB | Defer Neo4j until measured pain |
| Cost runaway | Soft daily caps; mid-tier extract; generation cache |
| Crawl brittleness (DOM/API churn) | Version adapter; crawl_runs error surfacing; manual re-crawl |

---

## 16. Scalability

- Horizontal: add worker replicas per queue  
- Vertical Postgres first; read replica when dashboard read-heavy  
- Partition/filter pgvector by `story_id` if needed  
- Extract microservices later (`import`, `generate`) behind same API contracts  
- Graph DB only if multi-hop relationship queries become a real share of load (~20%+ of analytical traffic)  

At locked scale A, a single VPS/Docker Compose stack is acceptable for MVP–3 months.

---

## 17. AI cost optimization

1. Mid-tier for extract; strong only for final narration script  
2. Skip re-embed when `content_hash` unchanged  
3. Incremental understand — new/changed chapters only  
4. Short structured prompts; discourage verbose chain-of-thought in production  
5. Top-k chunk retrieval (4–8), not full chapter paste  
6. Daily/monthly budget caps + alerts  
7. Batch packaging variants on mid-tier  
8. Dedupe generations on `(type, prompt_version, input_hash)`  
9. Cache rollup summaries; invalidate on chapter graph change  

---

## 18. Future improvements backlog

- Auto thumbnail layout suggestions (vision)  
- Brand voice cloning (TTS)  
- Browser extension “send chapter to factory”  
- Douyin cleared-rights ASR + competitive script breakdown  
- Direct CapCut/Premiere marker export  
- Spoiler leak checks for Shorts  
- Multi-channel calendars and publish scheduling  
- Partner APIs for licensed catalogs  

---

## Appendix A — Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), Tailwind, shadcn/ui |
| Backend | NestJS (module boundaries) |
| Queue | Redis + BullMQ |
| Database | Postgres 16 + pgvector |
| Search (MVP) | Postgres FTS + pgvector |
| Search (later) | Meilisearch optional |
| Object storage | Cloudflare R2 or S3 |
| Auth | Auth.js or Better Auth (email + invite) |
| AI | Vercel AI SDK + AI Gateway |
| Observability | Structured logs + OpenTelemetry; `usage_events` |
| Deploy MVP | Docker Compose on one VPS; later Fly/Railway/VPS fleet |

---

## Appendix B — Dashboard information architecture

1. **Discovery** — Douyin Viral by **genre tabs** (default tier S/A) + manual novel sources/license; RSS month 3  
2. **Library** — stories, chapters, import actions  
3. **Story Graph** — characters, arcs, timeline, relationships (read-mostly MVP)  
4. **AI Generation** — pick type, enqueue, browse outputs  
5. **Asset Export** — build pack, download zip  
6. **Queue / Jobs** — live status, retry, errors  
7. **Review** — MVP: thin edit + `status` change on outputs; month 3: fuller review queue UI  
8. **Publish** — export-centric in MVP  
9. **Analytics** — tokens, cost, job success  

---

## Appendix C — Non-functional requirements

| Area | Requirement |
|---|---|
| Queue | BullMQ; named queues; priority field |
| Worker | Idempotent handlers; DLQ; timeouts |
| Retry | Exponential backoff; capped attempts |
| Cache | Redis for job progress; generation dedupe keys |
| Scheduler | Cron/repeatable BullMQ for Douyin crawl (MVP); RSS sync month 3+ |
| API | REST `/api/v1`; SSE for job events |
| Database | Postgres SoT; migrations via Prisma or Drizzle |
| Storage | S3-compatible; signed download URLs for exports |
| Security | Authn required; license gate; no public multi-tenant isolation needed |
| Reliability | Job replay; provider fallback; budget kill-switch |

---

## Appendix D — Approaches considered

1. **Simple Next.js monolith** — fastest, weakest long-term boundaries → rejected for 6–12 month roadmap  
2. **Modular monolith + workers (chosen)** — fits scale A, clear modules, affordable  
3. **Microservices + Neo4j from day one** — overkill for 5–10 titles/month → deferred  

---

## Appendix E — Open items for implementation plan (not blockers)

- Exact NestJS vs Fastify finalization → **NestJS default**  
- Embedding dimensions locked to chosen model  
- Vietnamese FTS config quality may need manual tuning  
- Human repair UI for failed EPUB/PDF parses (minimal: re-upload cleaned TXT)  
- **DouyinRankingAdapter concrete provider** behind interface; legal review before production crawl volume  
- Initial board whitelist map: which Douyin boards ↔ which catalog genres (studio config)  
- Tier thresholds (S/A cutoffs) tunable per genre in config, not hard-coded forever  

---

*End of design document.*
