import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from "class-validator";
import { LICENSE_STATUSES, SOURCE_TYPES } from "../source.constants";

export class CreateSourceDto {
  @IsString()
  @MinLength(1)
  projectId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn([...SOURCE_TYPES])
  type!: (typeof SOURCE_TYPES)[number];

  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @IsOptional()
  @IsIn([...LICENSE_STATUSES])
  licenseStatus?: (typeof LICENSE_STATUSES)[number];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
