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

export class UpdateViralBoardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  crawlIntervalSec?: number;

  @IsOptional()
  @IsObject()
  adapterConfig?: Record<string, unknown> | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...GENRES], { each: true })
  genresExtra?: string[];
}
