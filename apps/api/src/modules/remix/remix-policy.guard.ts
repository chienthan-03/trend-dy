import { Injectable } from "@nestjs/common";

export type RemixExportCheckInput = {
  usagePolicy: string;
};

@Injectable()
export class RemixPolicyGuard {
  canExport(remake: RemixExportCheckInput): boolean {
    return remake.usagePolicy === "approved_for_export";
  }
}
