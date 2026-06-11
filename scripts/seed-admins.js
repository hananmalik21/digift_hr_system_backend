/**
 * CLI entry: npm run seed:admins
 */
import 'dotenv/config';

import { closePool } from '../config/db.js';
import { ensureSeedAdminUsers } from './seedAdminsService.js';

ensureSeedAdminUsers()
  .then(({ ok }) => {
    if (!ok) process.exitCode = 1;
  })
  .catch((err) => {
    console.error('[seed-admins] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
