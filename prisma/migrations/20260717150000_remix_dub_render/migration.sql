-- AlterTable
ALTER TABLE "viral_remakes" ADD COLUMN     "banner_json" JSONB,
ADD COLUMN     "dub_source" TEXT,
ADD COLUMN     "media_dub_audio_key" TEXT,
ADD COLUMN     "media_video_key" TEXT,
ADD COLUMN     "render_error" TEXT,
ADD COLUMN     "render_mode" TEXT NOT NULL DEFAULT 'audio_only',
ADD COLUMN     "render_output_key" TEXT,
ADD COLUMN     "render_phase" TEXT NOT NULL DEFAULT 'idle',
ADD COLUMN     "tts_cost_usd" DOUBLE PRECISION,
ADD COLUMN     "tts_fit_failed_indexes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "tts_voice_id" TEXT;
