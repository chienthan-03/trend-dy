# MVP smoke verification checklist

**Branch:** `feature/ai-content-factory-mvp`  
**Verified:** 2026-07-10  
**Commit at verification:** `2837ce9` — feat: usage analytics and daily AI budget guard

---

## Automated verification (Task 16)

| Step | Command | Result | Notes |
|------|---------|--------|-------|
| 1a | `docker compose up -d` | **BLOCKED** | Docker CLI installed (v29.3.1) but daemon not running (`DockerDesktopLinuxEngine` pipe missing). Start Docker Desktop and re-run. |
| 1b | `pnpm install` | **PASS** | Lockfile up to date; workspace deps installed in ~3s. |
| 2 | `pnpm exec prisma migrate deploy` | **BLOCKED** | Postgres unreachable at `localhost:5432` (P1000 auth/connection failure). Requires Step 1a. |
| 3 | `pnpm --filter api test` | **PASS** | 21 files, **84 tests** passed (vitest, ~16s). |
| 4 | `pnpm --filter web build` | **PASS** | Next.js 15 production build succeeded; 9 routes compiled. Non-blocking warning: multiple lockfiles detected (`C:\Publish\package-lock.json` vs repo `pnpm-lock.yaml`). |

**Summary:** Unit/integration tests and web production build are green without Docker. Database migrations and live manual smoke require Docker services.

---

## Prerequisites (when Docker is up)

```bash
# From repo root
cp .env.example .env   # if not already present
docker compose up -d
pnpm install
pnpm exec prisma migrate deploy

# Three terminals (or use pnpm dev:api / dev:worker / dev:web)
pnpm dev:api      # port 3001
pnpm dev:worker
pnpm dev:web      # port 3000
```

Ensure `.env` includes:

- `DOUYIN_ADAPTER=fake`
- `EMBEDDING_MODE=fake`
- `LLM_MODE=fake` (optional; gateway defaults to fake when keys absent)
- Studio login: `STUDIO_EMAIL` / `STUDIO_PASSWORD` from `.env`

---

## Manual smoke steps

Run after automated steps pass and services are healthy.

### A. Auth + shell

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Open `http://localhost:3000/login` | Login form loads | _Not run — Docker down_ |
| A2 | Sign in with studio credentials | Redirect to Discovery; nav shows Discovery · Library · Jobs · Analytics | _Not run_ |

### B. Discovery — fake Douyin crawl

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Go to **Discovery** | Genre tabs visible; default tier filter S/A | _Not run_ |
| B2 | Trigger crawl for `system` genre board | Job enqueued; crawl run appears in history | _Not run_ |
| B3 | Wait for job completion (Jobs page or SSE) | Items appear with tier S or A; metadata only (no media download) | _Not run_ |
| B4 | Inspect object storage (MinIO console `:9001` or `aws s3 ls`) | **No Douyin video/image blobs** — only app uploads/exports if any | _Not run_ |

Fake adapter returns deterministic fixtures (`fake-*` external IDs, `example.test` URLs). See `FakeDouyinAdapter`.

### C. Library — import → understand → generate → export

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | **Library** → create story / project | Story row created | _Not run_ |
| C2 | Import sample **TXT** or **EPUB** (or licensed URL) | Chapters parsed; import job succeeds | _Not run_ |
| C3 | Trigger **Understand** on story | Story graph populated (characters/arcs); job completes | _Not run_ |
| C4 | Open **Graph** page for story | `GET /stories/:id/graph` data renders | _Not run_ |
| C5 | **Generate** → storytelling script + packaging (`pack.title`) | Outputs listed; status editable | _Not run_ |
| C6 | **Export** zip | Download succeeds; contains script + pack assets | _Not run_ |

Sample files: any UTF-8 `.txt` novel or standard EPUB; no bundled fixture in repo (parsers covered by `txt.parser.spec.ts`, `epub.parser.spec.ts`).

### D. Jobs + analytics

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | **Jobs** page | Import / crawl / understand / generate jobs listed | _Not run_ |
| D2 | Retry a failed job (if applicable) | Re-enqueued and progresses | _Not run_ |
| D3 | **Analytics** | Token/cost usage visible; budget guard respects `AI_DAILY_BUDGET_USD` | _Not run_ |

---

## Legal / storage guardrails (MVP)

- [ ] Douyin ranking rows stay `research_only` unless license cleared
- [ ] No Douyin media files stored in S3/MinIO (metadata + links only)
- [ ] Production novel sources have `license_status` before republishable generate/export

---

## Re-run checklist

```bash
docker compose up -d
pnpm install
pnpm exec prisma migrate deploy
pnpm --filter api test
pnpm --filter web build
# then manual smoke A–D above
```

When all green, optional tag: `git tag mvp-0.1.0`.

---

## Fixes applied this run

None. No blocking code issues found in automated suite or web build.
