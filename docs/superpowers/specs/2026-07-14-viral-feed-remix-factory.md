# Viral Feed & Remix Factory — PRD + Technical Design

**Status:** Approved for implementation planning (Phase A → B)  
**Date:** 2026-07-14  
**Audience:** Engineering, AI, product — internal studio tool  
**Depends on:** [AI Content Factory MVP spec](./2026-07-10-ai-content-factory-design.md) (Discovery crawl, Jobs, AI Gateway, modular monolith)  
**Post-read action:** Implement **Phase A** first; do not start video render (Phase B) until Phase A remake packages are used successfully by editors for 1–2 weeks.

---

## Tóm tắt (Tiếng Việt)

**Vấn đề:** MVP hiện tại crawl được trend Douyin nhưng không có luồng “làm hàng” rõ ràng — user không biết dùng output để làm gì nếu không có file truyện.

**Giải pháp:** Biến **Discovery** thành **Viral Feed** (newsfeed video hot + điểm viral), thêm nút **Chế biến** → pipeline AI tạo **gói nội dung tiếng Việt** (script recap viết lại, hook 3s, banner text, title, mô tả, phụ đề SRT draft) từ link/caption video Douyin.

**Không hứa:** “né policy 100%”. App enforce **transform workflow** + checklist review trước khi export/publish.

**Phase A (ưu tiên):** Text package + feed UX — ~2–3 tuần.  
**Phase B:** Tải audio/video + STT + render MP4 có phụ đề/banner — ~3–5 tuần sau Phase A.

---

## 0. Product decisions (locked)

| Decision | Value |
|---|---|
| Primary user journey | **Feed → Chế biến → Review → Export package** (không bắt buộc có file truyện) |
| Input | Douyin share URL, canonical URL, hoặc `viral_item` từ feed |
| Output language | Vietnamese (primary) |
| Phase A deliverable | **Remix package** (JSON + editable UI): rewritten script, hook, banners, titles, tags, SRT draft |
| Phase B deliverable | MP4 preview với phụ đề burn-in + banner template (chưa auto-publish) |
| Viral score display | Tier S/A/B/C + `trend_score` + (Phase A.1) velocity badge nếu có snapshot trước |
| Policy model | `research_only` → `remix_draft` → `reviewed` → `approved_for_export`; **blocked** nếu vi phạm checklist |
| Douyin media | Phase A: **metadata + caption only** (Just One API). Phase B: optional download **chỉ khi** `usage_policy` cho phép và admin bật `REMIX_ALLOW_MEDIA_DOWNLOAD=true` |
| Anti-bot in repo | **Không** — dùng Just One API / studio HTTP proxy (giống `LiveDouyinAdapter`) |
| Novel / Library path | Giữ nguyên — remix feed là **luồng song song**, không thay thế |
| Review policy | Soft review — output `ready` ngay; export/publish gate ở `approved_for_export` |
| Target scale (12 mo) | ~20–50 remix packages/tuần; ~5–15 video renders/tuần (Phase B) |

**Explicitly out of Phase A:** Auto-publish YouTube/TikTok, bulk download library, clone giọng người thật, guarantee policy compliance, OCR on video frames.

**Explicitly out of Phase B MVP:** Voice cloning, full automated b-roll generation, multi-platform scheduler.

---

## 1. Problem statement

### 1.1 Current state (post-MVP)

- Discovery crawls **live** Douyin ranking metadata per genre.
- Items have tier, score, caption, cover, canonical URL.
- **No action** connects a viral item to Vietnamese production assets.
- Library/Import path assumes **licensed novel text** — misaligned with studio workflow “xem video hot → làm recap VN”.

### 1.2 Target state

Studio mở app mỗi sáng:

1. Xem **feed** video viral theo genre (giống newsfeed).
2. Bấm **Chế biến** trên item hay paste link.
3. Nhận **gói draft tiếng Việt** đủ dùng cho editor (hoặc render Phase B).
4. Review nhanh → approve → export.

---

## 2. User stories

### Phase A

| ID | As a… | I want… | So that… |
|---|---|---|---|
| R1 | Editor | Viral feed sorted by tier/score | I pick winners fast |
| R2 | Editor | **Chế biến** on a feed card | I get a VN remake draft in one click |
| R3 | Editor | Paste any Douyin link + Trigger | I process videos not on today's board |
| R4 | Editor | See remake job in Jobs | I know when draft is ready |
| R5 | Editor | Edit script/hook/banner in Remake Studio | I fix AI before export |
| R6 | Lead | Policy checklist on each remix | We don't export non-transformative copies |
| R7 | Admin | Block export if not approved | Policy gate is enforceable |

### Phase B

| ID | As a… | I want… | So that… |
|---|---|---|---|
| R8 | Editor | Download audio + STT when caption thin | Script matches spoken content |
| R9 | Editor | Preview MP4 with VN subs + banners | I see near-final layout |
| R10 | Editor | Export zip (mp4 + srt + script + thumbs text) | Handoff to publish pipeline |

---

## 3. UX specification

### 3.1 Navigation

| Route | Name | Phase |
|---|---|---|
| `/discovery` | **Viral Feed** (rename label; same route) | A |
| `/remix/[remakeId]` | **Remake Studio** | A |
| `/jobs` | Jobs (add filter `remix`) | A |

### 3.2 Viral Feed (evolve Discovery)

**Layout:** card feed (mobile-friendly), not dense table.

Each **ViralCard**:

```
┌──────────────────────────────────────────────┐
│ [cover]  │  S · 0.82 ↑12%                   │
│  thumb   │  Title / caption (2 lines)       │
│          │  @author · 130k ♥ · genre chip  │
│          │  #tags…                          │
│          │  [ Chế biến ]  [ Bỏ qua ]        │
│          │  ● Đã chế biến (link nếu có)     │
└──────────────────────────────────────────────┘
```

**Top bar:**

- Genre tabs (existing)
- Tier filter S/A/B/C (existing)
- Sort: `trend_score` (default) | `crawled_at` | `rank_position`
- **Paste link** input + **Trigger** button (global)

**Empty states:**

- No boards → prompt Create & crawl (existing)
- No items → crawl CTA
- Item `blocked` → hide Chế biến

### 3.3 Remake Studio (`/remix/[id]`)

Sections (single page, tabs optional):

| Section | Content |
|---|---|
| Source | Cover, link, original caption, tier/score, genre |
| Remix script | Editable VN narration (rewritten, not literal translation) |
| Hook 3s | Text + optional visual suggestion |
| Banners | `top_banner`, `bottom_banner`, `watermark_text` |
| Packaging | Title variants (3), description, hashtags VN |
| Subtitles | SRT draft (cues from script paragraphs; Phase A text-only) |
| Policy | Checklist + status + approver notes |
| Actions | Save · Approve for export · Reject · Re-run AI |

### 3.4 Policy checklist (UI + gate)

Required before `approved_for_export`:

- [ ] Script is **rewritten** (diff ratio vs source caption < 70% literal overlap — automated hint)
- [ ] Hook text is **new** (not copy of first line of source)
- [ ] Banner/watermark includes **studio brand**
- [ ] Editor confirms **voice will be re-recorded** (Phase A) or TTS VN (Phase B)
- [ ] Editor confirms **no full re-upload** of source video (checkbox)
- [ ] Lead approval (role `admin` or `lead`)

Automated checks are **advisory** (warnings), not sole blockers — except export API enforces checkboxes + status.

---

## 4. Remix pipeline

### 4.1 Phase A flow (caption-first)

```
Trigger (viralItemId | shareUrl)
    → Job: remix_resolve (optional if URL only)
    → Job: remix_fetch_detail (Just One API: share transfer + video detail)
    → Extract: caption, title, stats, cover, videoId
    → Job: remix_generate (LLM structured JSON, locale vi)
    → Persist: viral_remakes row + remix_outputs
    → Status: ready
```

**No MP4 download in Phase A.**

### 4.2 Phase B flow (media + render)

```
… after remix_generate approved draft …
    → Job: remix_download_media (if REMIX_ALLOW_MEDIA_DOWNLOAD)
    → Store in object storage
    → Job: remix_stt (if caption_quality < threshold)
    → Merge transcript + LLM script
    → Job: remix_render (FFmpeg/Remotion template)
    → Asset: preview.mp4, final.srt
```

### 4.3 LLM output schema (`remix.package.v1`)

```json
{
  "locale": "vi",
  "script": {
    "narration": "…",
    "duration_estimate_sec": 180,
    "sections": [{ "label": "hook", "text": "…" }, { "label": "body", "text": "…" }]
  },
  "hook_3s": {
    "spoken": "…",
    "on_screen": "…",
    "visual_hint": "…"
  },
  "banners": {
    "top": "…",
    "bottom": "…",
    "watermark": "STUDIO ALPHA"
  },
  "packaging": {
    "titles": ["…", "…", "…"],
    "description": "…",
    "hashtags": ["…"]
  },
  "subtitles": {
    "format": "srt",
    "cues": [{ "start": "00:00:00,000", "end": "00:00:03,000", "text": "…" }]
  },
  "transform_notes": {
    "source_language": "zh",
    "rewrite_strategy": "recap_vn_inspired",
    "risks": ["…"]
  }
}
```

**Prompt rules (non-negotiable in template):**

- Vietnamese output.
- **Rewrite** for recap style; do not translate sentence-by-sentence.
- Hook must be **attention-first**, ≤ 3s spoken at normal pace.
- Do not reproduce copyrighted proper nouns unnecessarily; use Vietnamese equivalents where natural.
- Reference source only as inspiration; output must stand alone.

---

## 5. Architecture

### 5.1 Style

Continue **modular monolith + BullMQ workers**. New `RemixModule` alongside `ViralModule`.

### 5.2 New components

| Component | Responsibility |
|---|---|
| `DouyinVideoAdapter` | Resolve share URL → videoId; fetch video detail (pluggable, Just One default) |
| `RemixService` | Enqueue, CRUD remakes, policy gate |
| `RemixProcessor` | Worker: resolve → detail → generate |
| `RemixRenderer` (Phase B) | FFmpeg/Remotion template render |
| `RemixPolicyGuard` | Export approval checks |
| Feed UI | Viral cards + trigger |
| Remake Studio UI | Edit + approve package |

### 5.3 Queues

Add queue `remix` (or extend `discovery` — **prefer new queue** for clarity):

| Job type | Phase |
|---|---|
| `remix_resolve` | A |
| `remix_fetch_detail` | A |
| `remix_generate` | A |
| `remix_download_media` | B |
| `remix_stt` | B |
| `remix_render` | B |

All jobs persist to existing `jobs` table with `type` prefix `remix_*`.

### 5.4 Adapter: Douyin video (not ranking)

Environment (extends existing Douyin config):

```env
DOUYIN_ADAPTER=live
DOUYIN_API_TOKEN=…
DOUYIN_API_BASE_URL=https://api.justoneapi.com

# Phase B only
REMIX_ALLOW_MEDIA_DOWNLOAD=false
REMIX_MEDIA_ADAPTER=justoneapi   # justoneapi | http | none
```

**Endpoints (Just One API):**

- `GET /api/douyin/share-url-transfer/v1?token=&shareUrl=`
- `GET /api/douyin/get-video-detail/v2?token=&videoId=`

Interface:

```typescript
interface DouyinVideoAdapter {
  resolveShareUrl(shareUrl: string): Promise<{ videoId: string; canonicalUrl?: string }>;
  getVideoDetail(videoId: string): Promise<{
    videoId: string;
    title: string;
    caption: string;
    authorHandle: string;
    stats: Record<string, number>;
    coverUrl?: string;
    publishedAt?: Date;
    playUrl?: string;       // Phase B only; may be absent
    rawPayload: unknown;
  }>;
}
```

Fake adapter for dev: deterministic fixture from `videoId`.

---

## 6. Data model

### 6.1 New tables

```sql
viral_remakes (
  id,
  project_id,
  viral_item_id null,          -- set when triggered from feed
  external_video_id,           -- Douyin aweme_id
  source_url,                  -- canonical or share url
  source_snapshot jsonb,       -- caption, title, stats at fetch time
  genre,
  status,                      -- pending|running|ready|failed|archived
  usage_policy,                -- research_only|remix_draft|approved_for_export|blocked
  package_json jsonb null,     -- remix.package.v1
  policy_checklist jsonb,      -- checkbox state + warnings
  policy_warnings text[],
  editor_notes text,
  approved_by_user_id null,
  approved_at null,
  tokens_in, tokens_out, cost_usd,
  created_at, updated_at
)

viral_item_stats_snapshots (   -- Phase A.1 optional; enables velocity
  id,
  viral_item_id,
  stats jsonb,
  captured_at
)
```

**Indexes:**

- `viral_remakes (project_id, status, created_at desc)`
- `viral_remakes (viral_item_id)` unique where not null (one active remake per item optional — or allow multiple versions; **MVP: allow multiple, show latest**)
- `viral_item_stats_snapshots (viral_item_id, captured_at desc)`

### 6.2 Prisma models (sketch)

```prisma
model ViralRemake {
  id              String   @id @default(cuid())
  projectId       String   @map("project_id")
  viralItemId     String?  @map("viral_item_id")
  externalVideoId String   @map("external_video_id")
  sourceUrl       String?  @map("source_url")
  sourceSnapshot  Json?    @map("source_snapshot")
  genre           String?
  status          String   @default("pending")
  usagePolicy     String   @default("remix_draft") @map("usage_policy")
  packageJson     Json?    @map("package_json")
  policyChecklist Json?    @map("policy_checklist")
  policyWarnings  String[] @default([]) @map("policy_warnings")
  editorNotes     String?  @map("editor_notes")
  approvedByUserId String? @map("approved_by_user_id")
  approvedAt      DateTime? @map("approved_at")
  tokensIn        Int?     @map("tokens_in")
  tokensOut       Int?     @map("tokens_out")
  costUsd         Float?   @map("cost_usd")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  project   Project    @relation(...)
  viralItem ViralItem? @relation(...)
  assets    RemixAsset[]  // Phase B

  @@index([projectId, status])
  @@index([externalVideoId])
  @@map("viral_remakes")
}
```

Add relation `ViralItem.remakes ViralRemake[]`.

### 6.3 Reuse vs new

| Existing | Use for remix |
|---|---|
| `viral_items` | Feed source; link via `viralItemId` |
| `jobs` | All async steps |
| `prompt_templates` | New keys: `remix.package.v1` |
| `usage_events` | LLM + STT costs |
| `generation_outputs` | **Do not overload** — remakes are not story-scoped |
| `assets` | Phase B: link via `RemixAsset` or `generationOutputId` null + `remakeId` |

---

## 7. API specification

Base: `/api/v1` (auth required).

| Method | Path | Description |
|---|---|---|
| `POST` | `/viral/remix` | Trigger remix: `{ projectId, viralItemId? , shareUrl? }` |
| `GET` | `/viral/remix` | List remakes: `?projectId=&status=&viralItemId=` |
| `GET` | `/viral/remix/:id` | Get remake + package |
| `PATCH` | `/viral/remix/:id` | Update package fields, checklist, notes |
| `POST` | `/viral/remix/:id/approve` | Set `approved_for_export` (role gate) |
| `POST` | `/viral/remix/:id/reject` | Reject / archive |
| `POST` | `/viral/remix/:id/regenerate` | Re-run LLM (idempotent job key) |
| `GET` | `/viral/remix/:id/export` | Zip package (Phase A: json+srt+txt); Phase B: +mp4 |
| `POST` | `/viral/items/:id/remix` | Shortcut: trigger from feed item |

**Errors:**

- `400` missing viralItemId and shareUrl
- `403` policy blocked / export without approval
- `404` item not found
- `409` duplicate job in flight (optional idempotency)

---

## 8. Policy & compliance (product + engineering)

### 8.1 Principles

1. **Transform, don't reupload** — product copy and checklist reinforce this.
2. Default `usage_policy=research_only` on crawled items; remix creates `remix_draft`.
3. Export API requires `approved_for_export` + completed checklist.
4. Phase B media download **off by default**; studio opt-in via env.
5. Log `source_snapshot` + `package_json` for audit.

### 8.2 What we do NOT claim

- Không đảm bảo video pass YouTube/TikTok/Facebook copyright bots.
- Không thay tư vấn pháp lý studio.
- Không lưu trữ lâu dài video gốc nếu không cần (Phase B: TTL on media blobs, default 7 days).

### 8.3 Automated policy hints (advisory)

| Signal | Warning |
|---|---|
| `literal_overlap_ratio > 0.7` | "Script quá giống caption gốc" |
| Hook == first sentence of caption | "Hook chưa được viết mới" |
| Empty `banners.watermark` | "Thiếu branding" |
| Source `usage_policy=blocked` | Block trigger |

---

## 9. Non-functional requirements

| Area | Target |
|---|---|
| Phase A remix latency | p95 < 90s (detail API + LLM) |
| Feed page load | < 2s for 50 items |
| Job durability | Same as MVP — Postgres before BullMQ |
| Cost cap | Respect `AI_DAILY_BUDGET_USD`; remix jobs count toward budget |
| Idempotency | Same `viralItemId` + `regenerate=false` within 1h → return existing `ready` remake optional |
| Observability | Log `externalVideoId`, job id, API provider, token cost |

---

## 10. Phase plan & timeline

### Phase A — Viral Feed + Text Remix (2–3 weeks)

| Week | Deliverable |
|---|---|
| 1 | Schema `viral_remakes`, `DouyinVideoAdapter`, worker `remix_*` (resolve+detail+generate), API trigger |
| 2 | Feed UI cards, paste link, Remake Studio v1, Jobs filter |
| 3 | Policy checklist, approve/export zip (json+srt+txt), tests, polish |

**Exit criteria:** Editor triggers 10 real Douyin links → gets usable VN script + hook without uploading novel files.

### Phase A.1 — Velocity badge (optional +3 days)

- Snapshot `viral_items.stats` on each crawl
- Compute `% like delta` 24h → show ↑ on feed

### Phase B — Video package (3–5 weeks)

| Week | Deliverable |
|---|---|
| 1 | Media download adapter, storage, STT integration |
| 2 | SRT timing from STT; merge with LLM script |
| 3 | FFmpeg/Remotion template: hook card + subs + banners |
| 4 | Preview player in Remake Studio, export zip with mp4 |
| 5 | Hardening, cost controls, TTL cleanup |

**Exit criteria:** 1 approved remix → preview MP4 with VN subs + banners exportable.

### Phase C — Feed intelligence (6+ weeks, roadmap)

- Personalized feed, dedup across boards, “similar already remixed”
- Batch queue: “Chế biến top 5 tier S hôm nay”
- Analytics: remix approval rate, cost per published video

---

## 11. Relationship to MVP novel path

| MVP novel path | Remix feed path |
|---|---|
| Input: licensed TXT/EPUB | Input: Douyin link / viral item |
| Understand → Story Graph | Optional; **not required** for remix |
| Generate from graph | Generate from **video caption + detail** |
| Discovery = inspire only | Discovery = **primary workspace** |

Both coexist. Shared: Projects, Auth, Jobs, AI Gateway, Usage analytics.

---

## 12. Tech stack (additions)

| Layer | Phase A | Phase B |
|---|---|---|
| Douyin detail | Just One API (existing token) | + play URL download |
| LLM | OpenRouter / AI Gateway | Same |
| STT | — | OpenAI Whisper API or gateway |
| Render | — | FFmpeg CLI in worker **or** Remotion lambda (prefer FFmpeg for monolith simplicity) |
| Storage | Postgres JSON | MinIO for temp media |

---

## 13. Testing strategy

| Test | Type |
|---|---|
| `DouyinVideoAdapter` fake + live mock | Unit |
| Share URL parse → videoId | Unit |
| `remix_generate` schema validation | Unit |
| Policy guard blocks export | Unit |
| E2E: trigger from `viral_item` → `ready` package | Integration |
| Literal overlap detector | Unit (threshold tuning) |

---

## 14. Open questions (resolve before Phase B)

| # | Question | Default if no answer |
|---|---|---|
| 1 | TTS VN voice provider? | Defer; editor voice record in Phase A |
| 2 | Remotion vs FFmpeg-only? | FFmpeg-only for Phase B |
| 3 | One remake per item or version history? | Multiple remakes; UI shows latest |
| 4 | Store downloaded media how long? | 7 days TTL |
| 5 | Who can approve? | `admin` role only in Phase A |

---

## 15. Success metrics

| Metric | Phase A target (30 days) |
|---|---|
| Remix triggers / week | ≥ 15 |
| % remakes reaching `ready` | ≥ 85% |
| Editor-rated “usable with minor edits” | ≥ 60% (manual sample) |
| Avg cost per remix | < $0.15 |
| Time feed → draft | < 2 min median |

---

## 16. Implementation handoff

Next artifact: `docs/superpowers/plans/2026-07-14-viral-feed-remix-phase-a.md` (task-by-task plan).

**Do not implement Phase B** until Phase A exit criteria met.

---

## Appendix A — Example editor flow (happy path)

1. Open **Viral Feed** → genre `cultivation` → sort by score.
2. See tier **S** card → **Chế biến**.
3. Jobs: `remix_fetch_detail` → `remix_generate` completed (~60s).
4. Open **Remake Studio** → edit script + hook.
5. Complete policy checklist → **Approve**.
6. **Export zip** → hand to video editor with `script.txt`, `hook.txt`, `package.srt`, `titles.txt`.
7. Editor dựng video VN với voice mới + b-roll — **không** reupload file Douyin gốc.

---

## Appendix B — Env vars (new)

```env
# Phase A
REMIX_ENABLED=true
REMIX_DEFAULT_LOCALE=vi
REMIX_LLM_MODEL=openai/gpt-5.6-luna

# Phase B
REMIX_ALLOW_MEDIA_DOWNLOAD=false
REMIX_MEDIA_TTL_DAYS=7
REMIX_STT_MODEL=whisper-1
REMIX_RENDER_TEMPLATE=default_v1
```

---

*End of spec.*
