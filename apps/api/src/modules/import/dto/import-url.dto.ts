import { IsOptional, IsUrl } from "class-validator";

export class ImportUrlDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;
}
