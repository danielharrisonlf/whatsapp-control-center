import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads the monorepo root `.env` for local runs (`pnpm dev`). Variables already present in the
 * environment (Docker Compose, CI, production) always win.
 */
export function loadDotenv() {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (!existsSync(candidate)) continue;
    const parsed = parseEnv(readFileSync(candidate, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
    return;
  }
}
