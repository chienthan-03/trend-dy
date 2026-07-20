import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  Min,
  ValidateNested,
} from "class-validator";
import { REMIX_SEGMENT_ROLES } from "@factory/shared";
import type { RemixSegmentRole } from "@factory/shared";

export class SegmentRolePatchDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsIn([...REMIX_SEGMENT_ROLES])
  role!: RemixSegmentRole;
}

export class UpdateSegmentRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SegmentRolePatchDto)
  roles!: SegmentRolePatchDto[];
}
