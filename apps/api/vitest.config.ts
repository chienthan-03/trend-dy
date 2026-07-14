import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@prisma/client": path.resolve(
        __dirname,
        "../../generated/prisma-client",
      ),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.spec.ts", "src/**/*.e2e.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
