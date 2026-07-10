import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import {
  GENERATION_TYPES,
  type GenerationType,
} from "../../../ai/prompts/generation.types";

export class GenerateDto {
  @IsString()
  @MinLength(1)
  @IsIn([...GENERATION_TYPES])
  type!: GenerationType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  chapterId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  arcId?: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
