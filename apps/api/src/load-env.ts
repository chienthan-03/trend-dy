import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Prefer monorepo root `.env` so worker/API behave the same regardless of cwd. */
const candidates = [
  resolve(__dirname, "../../../.env"),
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
];

for (const path of candidates) {
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
