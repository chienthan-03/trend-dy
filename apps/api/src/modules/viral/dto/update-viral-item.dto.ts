import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { GENRES, VIRAL_TIERS } from "@factory/shared";

export class UpdateViralItemDto {
  @IsOptional()
  @IsString()
  @IsIn(["research_only", "cleared", "blocked"])
  usagePolicy?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...GENRES], { each: true })
  genres?: string[];

  @IsOptional()
  @IsString()
  @IsIn([...VIRAL_TIERS])
  tier?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;
}
