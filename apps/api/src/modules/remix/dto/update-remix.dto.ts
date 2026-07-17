import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { REMIX_RENDER_MODES } from "@factory/shared";
import type { RemixBannerJson, RemixPackageV1, RemixRenderMode } from "@factory/shared";

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
  @IsObject()
  bannerJson?: RemixBannerJson;
}
