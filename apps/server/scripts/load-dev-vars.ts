/**
 * Loads apps/server/.dev.vars into process.env when imported.
 * Import this module first in any script that uses db so DATABASE_URL etc. are set.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const devVarsPath = join(__dirname, "../.dev.vars");
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match?.[1] && match[2] !== undefined) {
      const key = match[1];
      const value = match[2];
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
} catch (e) {
  console.warn("Could not load .dev.vars:", e);
}
