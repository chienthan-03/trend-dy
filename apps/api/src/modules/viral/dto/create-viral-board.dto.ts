import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { GENRES } from "@factory/shared";

export class CreateViralBoardDto {
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  boardKey!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsIn([...GENRES])
  genre!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...GENRES], { each: true })
  genresExtra?: string[];

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  crawlIntervalSec?: number;
}
