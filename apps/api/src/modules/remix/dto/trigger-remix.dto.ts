import { IsOptional, IsString, MinLength } from "class-validator";

export class TriggerRemixDto {
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  viralItemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  shareUrl?: string;
}
