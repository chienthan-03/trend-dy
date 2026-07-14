import { IsString, MinLength } from "class-validator";

export class TriggerItemRemixDto {
  @IsString()
  @MinLength(1)
  projectId!: string;
}
