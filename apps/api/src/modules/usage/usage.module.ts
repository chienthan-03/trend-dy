import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { BudgetGuard } from "./budget.guard";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UsageController],
  providers: [BudgetGuard, UsageService],
  exports: [BudgetGuard, UsageService],
})
export class UsageModule {}
