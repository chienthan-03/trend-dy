-- AlterTable
ALTER TABLE "viral_remakes" ADD COLUMN "script_mode" TEXT NOT NULL DEFAULT 'caption';
ALTER TABLE "viral_remakes" ADD COLUMN "pipeline_phase" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "viral_remakes" ADD COLUMN "source_transcript" JSONB;
ALTER TABLE "viral_remakes" ADD COLUMN "media_audio_key" TEXT;
ALTER TABLE "viral_remakes" ADD COLUMN "media_expires_at" TIMESTAMP;
ALTER TABLE "viral_remakes" ADD COLUMN "video_duration_sec" DOUBLE PRECISION;
ALTER TABLE "viral_remakes" ADD COLUMN "stt_cost_usd" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "viral_remakes_media_expires_at_idx" ON "viral_remakes"("media_expires_at");
