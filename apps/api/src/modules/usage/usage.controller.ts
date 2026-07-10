import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { UsageService } from "./usage.service";

@Controller("analytics")
@UseGuards(SessionAuthGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get("usage")
  getUsage() {
    return this.usageService.getUsageReport();
  }
}
