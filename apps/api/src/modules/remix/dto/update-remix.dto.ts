import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";
import { REMIX_RENDER_MODES, REMIX_TTS_AUDIO_MODES } from "@factory/shared";
import type { RemixBannerJson, RemixPackageV1, RemixRenderMode, RemixTtsAudioMode } from "@factory/shared";
import {
  TTS_MAX_SPEED_MAX,
  TTS_MAX_SPEED_MIN,
  TTS_SPEED_MAX,
  TTS_SPEED_MIN,
} from "../remix-config";

export class UpdateRemixDto {
  @IsOptional()
  @IsObject()
  packageJson?: RemixPackageV1;

  @IsOptional()
  @IsString()
  editorNotes?: string;

  @IsOptional()
  @IsIn([...REMIX_RENDER_MODES])
  renderMode?: RemixRenderMode;

  @IsOptional()
  @IsString()
  ttsVoiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(TTS_SPEED_MIN)
  @Max(TTS_SPEED_MAX)
  ttsSpeed?: number;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsNumber()
  @Min(TTS_MAX_SPEED_MIN)
  @Max(TTS_MAX_SPEED_MAX)
  ttsMaxSpeed?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsIn([...REMIX_TTS_AUDIO_MODES])
  ttsAudioMode?: RemixTtsAudioMode | null;

  @IsOptional()
  @IsObject()
  bannerJson?: RemixBannerJson;
}
