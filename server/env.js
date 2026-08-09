// Loads .env BEFORE any other server module evaluates.
// ES module imports are hoisted, so this must be the FIRST import in index.js —
// otherwise extract.js reads process.env before the .env file is applied.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch { /* no .env — fine, credentials may come from the environment */ }
