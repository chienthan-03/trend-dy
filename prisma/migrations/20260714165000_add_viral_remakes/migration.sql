-- CreateTable
CREATE TABLE "viral_remakes" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "viral_item_id" TEXT,
    "external_video_id" TEXT NOT NULL,
    "source_url" TEXT,
    "source_snapshot" JSONB,
    "genre" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "usage_policy" TEXT NOT NULL DEFAULT 'remix_draft',
    "package_json" JSONB,
    "policy_checklist" JSONB,
    "policy_warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editor_notes" TEXT,
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viral_remakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "viral_remakes_project_id_status_created_at_idx" ON "viral_remakes"("project_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "viral_remakes_viral_item_id_idx" ON "viral_remakes"("viral_item_id");

-- CreateIndex
CREATE INDEX "viral_remakes_external_video_id_idx" ON "viral_remakes"("external_video_id");

-- AddForeignKey
ALTER TABLE "viral_remakes" ADD CONSTRAINT "viral_remakes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viral_remakes" ADD CONSTRAINT "viral_remakes_viral_item_id_fkey" FOREIGN KEY ("viral_item_id") REFERENCES "viral_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
