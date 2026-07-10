-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "style_guide" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "base_url" TEXT,
    "license_status" TEXT NOT NULL DEFAULT 'pending',
    "config" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_items" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "external_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "published_at" TIMESTAMP(3),
    "genre" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trend_score" DOUBLE PRECISION,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viral_boards" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "board_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "genres_extra" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adapter_config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "crawl_interval_sec" INTEGER NOT NULL DEFAULT 3600,
    "last_crawled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viral_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viral_items" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "rank_position" INTEGER,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "author_handle" TEXT,
    "stats" JSONB,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cover_url" TEXT,
    "canonical_url" TEXT,
    "published_at" TIMESTAMP(3),
    "crawled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genre_confidence" DOUBLE PRECISION,
    "genre_source" TEXT,
    "trend_score" DOUBLE PRECISION,
    "tier" TEXT,
    "usage_policy" TEXT NOT NULL DEFAULT 'research_only',
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viral_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viral_crawl_runs" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "item_count" INTEGER,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "viral_crawl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_id" TEXT,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'vi',
    "genre" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "raw_text" TEXT,
    "clean_text" TEXT,
    "content_hash" TEXT,
    "word_count" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'imported',
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_chunks" (
    "id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "token_estimate" INTEGER,
    "embedding" vector(1536),
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" TEXT,
    "summary" TEXT,
    "attributes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abilities" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "character_id" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "power_level" DOUBLE PRECISION,
    "attributes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "attributes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "owner_character_id" TEXT,
    "attributes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arcs" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "summary" TEXT,
    "start_chapter_id" TEXT,
    "end_chapter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "arc_id" TEXT,
    "type" TEXT,
    "summary" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 0,
    "timeline_order" INTEGER,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_characters" (
    "event_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "event_characters_pkey" PRIMARY KEY ("event_id","character_id","role")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "from_character_id" TEXT NOT NULL,
    "to_character_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "since_chapter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plot_signals" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plot_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_entries" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "story_id" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "body" TEXT NOT NULL,
    "model_hint" TEXT,
    "output_schema" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_outputs" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "chapter_id" TEXT,
    "arc_id" TEXT,
    "type" TEXT NOT NULL,
    "prompt_template_id" TEXT,
    "prompt_version" INTEGER,
    "input_ref" JSONB,
    "content" TEXT,
    "content_json" JSONB,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "generation_output_id" TEXT,
    "type" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "sources_project_id_idx" ON "sources"("project_id");

-- CreateIndex
CREATE INDEX "source_items_source_id_idx" ON "source_items"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "source_items_source_id_external_key_key" ON "source_items"("source_id", "external_key");

-- CreateIndex
CREATE INDEX "viral_boards_project_id_enabled_idx" ON "viral_boards"("project_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "viral_boards_project_id_board_key_key" ON "viral_boards"("project_id", "board_key");

-- CreateIndex
CREATE INDEX "viral_items_board_id_tier_idx" ON "viral_items"("board_id", "tier");

-- CreateIndex
CREATE INDEX "viral_items_board_id_trend_score_idx" ON "viral_items"("board_id", "trend_score");

-- CreateIndex
CREATE UNIQUE INDEX "viral_items_board_id_external_id_key" ON "viral_items"("board_id", "external_id");

-- CreateIndex
CREATE INDEX "viral_crawl_runs_board_id_started_at_idx" ON "viral_crawl_runs"("board_id", "started_at");

-- CreateIndex
CREATE INDEX "stories_project_id_idx" ON "stories"("project_id");

-- CreateIndex
CREATE INDEX "stories_status_idx" ON "stories"("status");

-- CreateIndex
CREATE INDEX "chapters_story_id_idx" ON "chapters"("story_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_story_id_number_key" ON "chapters"("story_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_story_id_content_hash_key" ON "chapters"("story_id", "content_hash");

-- CreateIndex
CREATE INDEX "story_chunks_chapter_id_idx" ON "story_chunks"("chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_chunks_chapter_id_ordinal_key" ON "story_chunks"("chapter_id", "ordinal");

-- CreateIndex
CREATE INDEX "characters_story_id_idx" ON "characters"("story_id");

-- CreateIndex
CREATE INDEX "characters_story_id_name_idx" ON "characters"("story_id", "name");

-- CreateIndex
CREATE INDEX "abilities_story_id_idx" ON "abilities"("story_id");

-- CreateIndex
CREATE INDEX "abilities_character_id_idx" ON "abilities"("character_id");

-- CreateIndex
CREATE INDEX "locations_story_id_idx" ON "locations"("story_id");

-- CreateIndex
CREATE INDEX "items_story_id_idx" ON "items"("story_id");

-- CreateIndex
CREATE INDEX "items_owner_character_id_idx" ON "items"("owner_character_id");

-- CreateIndex
CREATE INDEX "arcs_story_id_order_index_idx" ON "arcs"("story_id", "order_index");

-- CreateIndex
CREATE INDEX "events_story_id_idx" ON "events"("story_id");

-- CreateIndex
CREATE INDEX "events_chapter_id_idx" ON "events"("chapter_id");

-- CreateIndex
CREATE INDEX "events_arc_id_idx" ON "events"("arc_id");

-- CreateIndex
CREATE INDEX "event_characters_character_id_idx" ON "event_characters"("character_id");

-- CreateIndex
CREATE INDEX "relationships_story_id_idx" ON "relationships"("story_id");

-- CreateIndex
CREATE INDEX "relationships_from_character_id_idx" ON "relationships"("from_character_id");

-- CreateIndex
CREATE INDEX "relationships_to_character_id_idx" ON "relationships"("to_character_id");

-- CreateIndex
CREATE INDEX "plot_signals_story_id_idx" ON "plot_signals"("story_id");

-- CreateIndex
CREATE INDEX "plot_signals_chapter_id_idx" ON "plot_signals"("chapter_id");

-- CreateIndex
CREATE INDEX "timeline_entries_event_id_idx" ON "timeline_entries"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_entries_story_id_position_key" ON "timeline_entries"("story_id", "position");

-- CreateIndex
CREATE INDEX "jobs_status_priority_created_at_idx" ON "jobs"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "jobs_story_id_idx" ON "jobs"("story_id");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "prompt_templates_key_active_idx" ON "prompt_templates"("key", "active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_key_version_key" ON "prompt_templates"("key", "version");

-- CreateIndex
CREATE INDEX "generation_outputs_story_id_status_idx" ON "generation_outputs"("story_id", "status");

-- CreateIndex
CREATE INDEX "generation_outputs_chapter_id_idx" ON "generation_outputs"("chapter_id");

-- CreateIndex
CREATE INDEX "generation_outputs_type_idx" ON "generation_outputs"("type");

-- CreateIndex
CREATE INDEX "assets_story_id_idx" ON "assets"("story_id");

-- CreateIndex
CREATE INDEX "assets_generation_output_id_idx" ON "assets"("generation_output_id");

-- CreateIndex
CREATE INDEX "usage_events_job_id_idx" ON "usage_events"("job_id");

-- CreateIndex
CREATE INDEX "usage_events_created_at_idx" ON "usage_events"("created_at");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_items" ADD CONSTRAINT "source_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viral_boards" ADD CONSTRAINT "viral_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viral_items" ADD CONSTRAINT "viral_items_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "viral_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viral_crawl_runs" ADD CONSTRAINT "viral_crawl_runs_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "viral_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_chunks" ADD CONSTRAINT "story_chunks_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abilities" ADD CONSTRAINT "abilities_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_owner_character_id_fkey" FOREIGN KEY ("owner_character_id") REFERENCES "characters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_start_chapter_id_fkey" FOREIGN KEY ("start_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_end_chapter_id_fkey" FOREIGN KEY ("end_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_arc_id_fkey" FOREIGN KEY ("arc_id") REFERENCES "arcs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_characters" ADD CONSTRAINT "event_characters_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_characters" ADD CONSTRAINT "event_characters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_from_character_id_fkey" FOREIGN KEY ("from_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_to_character_id_fkey" FOREIGN KEY ("to_character_id") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_since_chapter_id_fkey" FOREIGN KEY ("since_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plot_signals" ADD CONSTRAINT "plot_signals_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plot_signals" ADD CONSTRAINT "plot_signals_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timeline_entries" ADD CONSTRAINT "timeline_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_arc_id_fkey" FOREIGN KEY ("arc_id") REFERENCES "arcs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_prompt_template_id_fkey" FOREIGN KEY ("prompt_template_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_generation_output_id_fkey" FOREIGN KEY ("generation_output_id") REFERENCES "generation_outputs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Spec §4.3: vector ANN index for chunk retrieval
CREATE INDEX IF NOT EXISTS "story_chunks_embedding_hnsw_idx"
  ON "story_chunks"
  USING hnsw ("embedding" vector_cosine_ops);

-- Spec §4.3: GIN indexes for genre/tag filters
CREATE INDEX IF NOT EXISTS "stories_genre_gin_idx" ON "stories" USING gin ("genre");
CREATE INDEX IF NOT EXISTS "stories_tags_gin_idx" ON "stories" USING gin ("tags");
