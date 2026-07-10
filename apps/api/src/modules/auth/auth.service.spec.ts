import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import type { PrismaService } from "../../prisma/prisma.service";

describe("AuthService.validateUser", () => {
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let authService: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    authService = new AuthService(prisma as unknown as PrismaService);
  });

  it("rejects invalid credentials", async () => {
    await expect(authService.validateUser("a@b.c", "wrong")).rejects.toThrow();
  });
});
