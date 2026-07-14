import { Injectable } from "@nestjs/common";
import {
  isPolicyChecklistComplete,
  type RemixPolicyChecklist,
} from "@factory/shared";

export type RemixExportCheckInput = {
  usagePolicy: string;
  policyChecklist: unknown;
};

@Injectable()
export class RemixPolicyGuard {
  canExport(remake: RemixExportCheckInput): boolean {
    if (remake.usagePolicy !== "approved_for_export") {
      return false;
    }

    const checklist = remake.policyChecklist as RemixPolicyChecklist | null;
    if (!checklist) {
      return false;
    }

    return isPolicyChecklistComplete(checklist);
  }
}
