import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString } from "class-validator";
import { ASSET_TYPES, type AssetType } from "../asset.types";

export class CreateAssetsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...ASSET_TYPES], { each: true })
  types!: AssetType[];
}

export class ExportStoryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  outputIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetIds?: string[];

  @IsOptional()
  @IsIn(["zip"])
  format?: "zip";
}
