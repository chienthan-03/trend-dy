import { Type } from "class-transformer";
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import type { RemixPackageV1, RemixPolicyChecklist } from "@factory/shared";

class RemixPolicyChecklistDto {
  @IsOptional()
  @IsBoolean()
  scriptRewritten?: boolean;

  @IsOptional()
  @IsBoolean()
  hookIsNew?: boolean;

  @IsOptional()
  @IsBoolean()
  hasStudioBrand?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceWillBeRerecorded?: boolean;

  @IsOptional()
  @IsBoolean()
  noFullReupload?: boolean;

  @IsOptional()
  @IsBoolean()
  leadApproved?: boolean;
}

export class UpdateRemixDto {
  @IsOptional()
  @IsObject()
  packageJson?: RemixPackageV1;

  @IsOptional()
  @ValidateNested()
  @Type(() => RemixPolicyChecklistDto)
  policyChecklist?: RemixPolicyChecklist;

  @IsOptional()
  @IsString()
  editorNotes?: string;
}
