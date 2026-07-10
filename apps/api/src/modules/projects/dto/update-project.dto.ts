import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase alphanumeric with hyphens",
  })
  slug?: string;

  @IsOptional()
  @IsObject()
  styleGuide?: Record<string, unknown> | null;
}
