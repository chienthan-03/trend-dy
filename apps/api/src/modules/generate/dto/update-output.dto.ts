import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

const OUTPUT_STATUSES = [
  "ready",
  "reviewed",
  "approved",
  "rejected",
  "archived",
] as const;

export class UpdateOutputDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @IsIn([...OUTPUT_STATUSES])
  status?: (typeof OUTPUT_STATUSES)[number];
}
