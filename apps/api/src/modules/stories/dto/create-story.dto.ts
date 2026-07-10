import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { GENRES } from "@factory/shared";

export class CreateStoryDto {
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...GENRES], { each: true })
  genre?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  status?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
