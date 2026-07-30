import { IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateIf } from "class-validator";
import { REMIX_BGM_TRACK_IDS, REMIX_BGM_SPEED_MAX, REMIX_BGM_SPEED_MIN, REMIX_RENDER_MODES, type RemixBgmTrackId } from "@factory/shared";
import type { RemixBannerJson, RemixPackageV1, RemixRenderMode } from "@factory/shared";
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
  @IsObject()
  bannerJson?: RemixBannerJson;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsIn([...REMIX_BGM_TRACK_IDS])
  bgmTrackId?: RemixBgmTrackId | null;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsNumber()
  @Min(0)
  @Max(1)
  bgmVolume?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsNumber()
  @Min(REMIX_BGM_SPEED_MIN)
  @Max(REMIX_BGM_SPEED_MAX)
  bgmSpeed?: number | null;

  @IsOptional()
  @ValidateIf((_o, value) => value != null)
  @IsNumber()
  @Min(0)
  bgmStartSec?: number | null;
}
