import { IsIn, IsOptional } from "class-validator";
import type { ClassifyRolesMode } from "../tts/classify-segments";

const CLASSIFY_ROLES_MODES = ["lazy", "reclassify"] as const;

export class ClassifySegmentsDto {
  @IsOptional()
  @IsIn(CLASSIFY_ROLES_MODES)
  mode?: ClassifyRolesMode;
}
