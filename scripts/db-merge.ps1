# Merge a home-machine backup into the current local `factory` DB without wiping.
# Keeps existing rows; inserts missing viral boards/items/crawl runs/remakes.
#
# Usage:
#   .\scripts\db-merge.ps1 -BackupPath .\backups\factory-20260717-011515.sql
#   .\scripts\db-merge.ps1   # uses newest factory-*.sql in .\backups\
#
# Strategy:
#   1. Snapshot current DB → backups\pre-merge-*.sql
#   2. Restore dump into temp DB `factory_merge_src`
#   3. Pull viral_* (+ users/projects if missing) via dblink, remap FKs by natural keys

param(
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Backups = Join-Path $Root "backups"

$Psql = @(
  "C:\Program Files\PostgreSQL\18\bin\psql.exe",
  "C:\Program Files\PostgreSQL\16\bin\psql.exe",
  "C:\Program Files\PostgreSQL\15\bin\psql.exe",
  "C:\Program Files\PostgreSQL\13\bin\psql.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$PgDump = @(
  "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\13\bin\pg_dump.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$PgRestore = @(
  "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\15\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\13\bin\pg_restore.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Psql) { throw "psql.exe not found under C:\Program Files\PostgreSQL" }
if (-not $PgDump) { throw "pg_dump.exe not found" }

if (-not $BackupPath) {
  $latest = Get-ChildItem $Backups -Filter "factory-*.sql" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw @"
No factory-*.sql in $Backups.

Copy the home backup first, e.g.:
  $Backups\factory-YYYYMMDD-HHMMSS.sql

Then:
  .\scripts\db-merge.ps1 -BackupPath .\backups\factory-....sql
"@
  }
  $BackupPath = $latest.FullName
}

if (-not (Test-Path $BackupPath)) {
  throw "Backup not found: $BackupPath"
}

$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "factory" }
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $Backups | Out-Null

Write-Host "==> 1/4 Snapshot current DB (safety)"
$PreMerge = Join-Path $Backups "pre-merge-$Stamp.sql"
& $PgDump -U factory -h 127.0.0.1 -p 5432 -d factory --no-owner --no-acl -f $PreMerge
if ($LASTEXITCODE -ne 0) { throw "pre-merge backup failed" }
Write-Host "    $PreMerge"

Write-Host "==> 2/4 Restore dump into temp DB factory_merge_src"
& $Psql -U factory -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c @"
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'factory_merge_src' AND pid <> pg_backend_pid();
"@ | Out-Null
& $Psql -U factory -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS factory_merge_src;"
& $Psql -U factory -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE factory_merge_src OWNER factory;"

# Enable vector on temp DB (dump may reference it)
& $Psql -U factory -h 127.0.0.1 -p 5432 -d factory_merge_src -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>$null | Out-Null

if ($BackupPath -like "*.dump") {
  if (-not $PgRestore) { throw "pg_restore.exe not found" }
  & $PgRestore -U factory -h 127.0.0.1 -p 5432 -d factory_merge_src --no-owner --no-acl $BackupPath
} else {
  & $Psql -U factory -h 127.0.0.1 -p 5432 -d factory_merge_src -v ON_ERROR_STOP=1 -f $BackupPath
}
if ($LASTEXITCODE -ne 0) { throw "Restore into factory_merge_src failed" }

Write-Host "==> 3/4 Merge viral data into factory (keep existing, add missing)"
$MergeSql = @"
CREATE EXTENSION IF NOT EXISTS dblink;

SELECT dblink_connect(
  'src',
  'host=127.0.0.1 port=5432 dbname=factory_merge_src user=factory password=factory'
);

-- Local project to attach new boards/remakes
CREATE TEMP TABLE _local_project AS
SELECT id FROM projects ORDER BY created_at ASC LIMIT 1;

DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _local_project) THEN
    RAISE EXCEPTION 'No local project — create one or restore fully first';
  END IF;
END `$`$;

-- ── users (by email) ────────────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, name, role, created_at)
SELECT s.id, s.email, s.password_hash, s.name, s.role, s.created_at
FROM dblink('src',
  'SELECT id, email, password_hash, name, role, created_at FROM users'
) AS s(id text, email text, password_hash text, name text, role text, created_at timestamptz)
ON CONFLICT (email) DO NOTHING;

-- ── projects (by slug) ──────────────────────────────────────────────────────
INSERT INTO projects (id, name, slug, style_guide, created_at)
SELECT s.id, s.name, s.slug, s.style_guide, s.created_at
FROM dblink('src',
  'SELECT id, name, slug, style_guide, created_at FROM projects'
) AS s(id text, name text, slug text, style_guide jsonb, created_at timestamptz)
ON CONFLICT (slug) DO NOTHING;

-- Map: import project id → local project id (same slug)
CREATE TEMP TABLE _project_map AS
SELECT s.id AS src_id, p.id AS local_id
FROM dblink('src', 'SELECT id, slug FROM projects') AS s(id text, slug text)
JOIN projects p ON p.slug = s.slug;

-- ── viral_boards (natural key: board_key; attach to local project) ───────────
-- Prefer existing local board with same board_key; else insert (keep src id if free)
CREATE TEMP TABLE _src_boards AS
SELECT *
FROM dblink('src',
  `$`$SELECT id, project_id, board_key, label, genre, genres_extra, adapter_config,
           enabled, crawl_interval_sec, last_crawled_at, created_at
    FROM viral_boards`$`$
) AS t(
  id text, project_id text, board_key text, label text, genre text,
  genres_extra text[], adapter_config jsonb, enabled boolean,
  crawl_interval_sec int, last_crawled_at timestamptz, created_at timestamptz
);

CREATE TEMP TABLE _board_map (
  src_id text PRIMARY KEY,
  local_id text NOT NULL
);

-- Existing local boards matched by board_key
INSERT INTO _board_map (src_id, local_id)
SELECT sb.id, lb.id
FROM _src_boards sb
JOIN viral_boards lb ON lb.board_key = sb.board_key;

-- New boards: insert with remapped project_id
INSERT INTO viral_boards (
  id, project_id, board_key, label, genre, genres_extra, adapter_config,
  enabled, crawl_interval_sec, last_crawled_at, created_at
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM viral_boards x WHERE x.id = sb.id)
      THEN 'mrg_' || substr(md5(sb.board_key || sb.id), 1, 24)
    ELSE sb.id
  END,
  COALESCE(pm.local_id, (SELECT id FROM _local_project)),
  sb.board_key,
  sb.label,
  sb.genre,
  COALESCE(sb.genres_extra, ARRAY[]::text[]),
  sb.adapter_config,
  COALESCE(sb.enabled, true),
  COALESCE(sb.crawl_interval_sec, 3600),
  sb.last_crawled_at,
  COALESCE(sb.created_at, now())
FROM _src_boards sb
LEFT JOIN _project_map pm ON pm.src_id = sb.project_id
WHERE NOT EXISTS (SELECT 1 FROM _board_map m WHERE m.src_id = sb.id)
  AND NOT EXISTS (SELECT 1 FROM viral_boards lb WHERE lb.board_key = sb.board_key);

-- If board_key unique conflict (different id), map to local
INSERT INTO _board_map (src_id, local_id)
SELECT sb.id, lb.id
FROM _src_boards sb
JOIN viral_boards lb ON lb.board_key = sb.board_key
WHERE NOT EXISTS (SELECT 1 FROM _board_map m WHERE m.src_id = sb.id)
ON CONFLICT DO NOTHING;

-- Boards inserted with original id
INSERT INTO _board_map (src_id, local_id)
SELECT sb.id, sb.id
FROM _src_boards sb
WHERE EXISTS (SELECT 1 FROM viral_boards lb WHERE lb.id = sb.id)
  AND NOT EXISTS (SELECT 1 FROM _board_map m WHERE m.src_id = sb.id);

-- ── viral_items ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE _src_items AS
SELECT *
FROM dblink('src',
  `$`$SELECT id, board_id, external_id, rank_position, title, caption, author_handle,
           stats, hashtags, cover_url, canonical_url, published_at, crawled_at,
           genres, genre_confidence, genre_source, trend_score, tier, usage_policy,
           raw_payload, created_at
    FROM viral_items`$`$
) AS t(
  id text, board_id text, external_id text, rank_position int, title text,
  caption text, author_handle text, stats jsonb, hashtags text[], cover_url text,
  canonical_url text, published_at timestamptz, crawled_at timestamptz,
  genres text[], genre_confidence float, genre_source text, trend_score float,
  tier text, usage_policy text, raw_payload jsonb, created_at timestamptz
);

CREATE TEMP TABLE _item_map (
  src_id text PRIMARY KEY,
  local_id text NOT NULL
);

-- Match existing by (local board, external_id)
INSERT INTO _item_map (src_id, local_id)
SELECT si.id, li.id
FROM _src_items si
JOIN _board_map bm ON bm.src_id = si.board_id
JOIN viral_items li ON li.board_id = bm.local_id AND li.external_id = si.external_id;

INSERT INTO viral_items (
  id, board_id, external_id, rank_position, title, caption, author_handle,
  stats, hashtags, cover_url, canonical_url, published_at, crawled_at,
  genres, genre_confidence, genre_source, trend_score, tier, usage_policy,
  raw_payload, created_at
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM viral_items x WHERE x.id = si.id)
      THEN 'mrg_' || substr(md5(bm.local_id || si.external_id || si.id), 1, 24)
    ELSE si.id
  END,
  bm.local_id,
  si.external_id,
  si.rank_position,
  si.title,
  si.caption,
  si.author_handle,
  si.stats,
  COALESCE(si.hashtags, ARRAY[]::text[]),
  si.cover_url,
  si.canonical_url,
  si.published_at,
  COALESCE(si.crawled_at, now()),
  COALESCE(si.genres, ARRAY[]::text[]),
  si.genre_confidence,
  si.genre_source,
  si.trend_score,
  si.tier,
  COALESCE(si.usage_policy, 'research_only'),
  si.raw_payload,
  COALESCE(si.created_at, now())
FROM _src_items si
JOIN _board_map bm ON bm.src_id = si.board_id
WHERE NOT EXISTS (SELECT 1 FROM _item_map m WHERE m.src_id = si.id)
ON CONFLICT (board_id, external_id) DO NOTHING;

-- Refresh item map after insert
INSERT INTO _item_map (src_id, local_id)
SELECT si.id, li.id
FROM _src_items si
JOIN _board_map bm ON bm.src_id = si.board_id
JOIN viral_items li ON li.board_id = bm.local_id AND li.external_id = si.external_id
WHERE NOT EXISTS (SELECT 1 FROM _item_map m WHERE m.src_id = si.id)
ON CONFLICT DO NOTHING;

INSERT INTO _item_map (src_id, local_id)
SELECT si.id, si.id
FROM _src_items si
WHERE EXISTS (SELECT 1 FROM viral_items li WHERE li.id = si.id)
  AND NOT EXISTS (SELECT 1 FROM _item_map m WHERE m.src_id = si.id);

-- ── viral_crawl_runs ────────────────────────────────────────────────────────
INSERT INTO viral_crawl_runs (
  id, board_id, status, started_at, finished_at, item_count, error, meta
)
SELECT
  s.id,
  bm.local_id,
  s.status,
  s.started_at,
  s.finished_at,
  s.item_count,
  s.error,
  s.meta
FROM dblink('src',
  `$`$SELECT id, board_id, status, started_at, finished_at, item_count, error, meta
    FROM viral_crawl_runs`$`$
) AS s(
  id text, board_id text, status text, started_at timestamptz,
  finished_at timestamptz, item_count int, error text, meta jsonb
)
JOIN _board_map bm ON bm.src_id = s.board_id
ON CONFLICT (id) DO NOTHING;

-- ── viral_remakes ───────────────────────────────────────────────────────────
INSERT INTO viral_remakes (
  id, project_id, viral_item_id, external_video_id, source_url, source_snapshot,
  genre, status, usage_policy, package_json, policy_checklist, policy_warnings,
  editor_notes, approved_by_user_id, approved_at, tokens_in, tokens_out, cost_usd,
  created_at, updated_at, script_mode, pipeline_phase, source_transcript,
  source_transcript_translated, media_audio_key, media_expires_at,
  video_duration_sec, stt_cost_usd
)
SELECT
  s.id,
  COALESCE(pm.local_id, (SELECT id FROM _local_project)),
  im.local_id,
  s.external_video_id,
  s.source_url,
  s.source_snapshot,
  s.genre,
  s.status,
  COALESCE(s.usage_policy, 'remix_draft'),
  s.package_json,
  s.policy_checklist,
  COALESCE(s.policy_warnings, ARRAY[]::text[]),
  s.editor_notes,
  s.approved_by_user_id,
  s.approved_at,
  s.tokens_in,
  s.tokens_out,
  s.cost_usd,
  COALESCE(s.created_at, now()),
  COALESCE(s.updated_at, now()),
  COALESCE(s.script_mode, 'caption'),
  COALESCE(s.pipeline_phase, 'pending'),
  s.source_transcript,
  s.source_transcript_translated,
  s.media_audio_key,
  s.media_expires_at,
  s.video_duration_sec,
  s.stt_cost_usd
FROM dblink('src',
  `$`$SELECT id, project_id, viral_item_id, external_video_id, source_url, source_snapshot,
           genre, status, usage_policy, package_json, policy_checklist, policy_warnings,
           editor_notes, approved_by_user_id, approved_at, tokens_in, tokens_out, cost_usd,
           created_at, updated_at, script_mode, pipeline_phase, source_transcript,
           source_transcript_translated, media_audio_key, media_expires_at,
           video_duration_sec, stt_cost_usd
    FROM viral_remakes`$`$
) AS s(
  id text, project_id text, viral_item_id text, external_video_id text,
  source_url text, source_snapshot jsonb, genre text, status text,
  usage_policy text, package_json jsonb, policy_checklist jsonb,
  policy_warnings text[], editor_notes text, approved_by_user_id text,
  approved_at timestamptz, tokens_in int, tokens_out int, cost_usd float,
  created_at timestamptz, updated_at timestamptz, script_mode text,
  pipeline_phase text, source_transcript jsonb, source_transcript_translated jsonb,
  media_audio_key text, media_expires_at timestamptz, video_duration_sec float,
  stt_cost_usd float
)
LEFT JOIN _project_map pm ON pm.src_id = s.project_id
LEFT JOIN _item_map im ON im.src_id = s.viral_item_id
ON CONFLICT (id) DO NOTHING;

SELECT dblink_disconnect('src');

-- Summary
SELECT 'viral_boards' AS t, count(*) FROM viral_boards
UNION ALL SELECT 'viral_items', count(*) FROM viral_items
UNION ALL SELECT 'viral_crawl_runs', count(*) FROM viral_crawl_runs
UNION ALL SELECT 'viral_remakes', count(*) FROM viral_remakes
UNION ALL SELECT 'anime_recap_items', count(*)
  FROM viral_items i JOIN viral_boards b ON b.id = i.board_id
  WHERE b.genre = 'anime_recap' OR 'anime_recap' = ANY(i.genres)
ORDER BY 1;
"@

$MergeFile = Join-Path $env:TEMP "factory-merge-$Stamp.sql"
Set-Content -Path $MergeFile -Value $MergeSql -Encoding UTF8

& $Psql -U factory -h 127.0.0.1 -p 5432 -d factory -v ON_ERROR_STOP=1 -f $MergeFile
if ($LASTEXITCODE -ne 0) {
  throw "Merge failed. Current DB unchanged except pre-merge snapshot at $PreMerge. Restore with: .\scripts\db-restore.ps1 -BackupPath `"$PreMerge`""
}

Write-Host "==> 4/4 Cleanup temp DB"
& $Psql -U factory -h 127.0.0.1 -p 5432 -d postgres -c "DROP DATABASE IF EXISTS factory_merge_src;" | Out-Null

Write-Host @"

OK: merged $BackupPath into factory (kept existing + added missing).
Safety snapshot: $PreMerge
"@
