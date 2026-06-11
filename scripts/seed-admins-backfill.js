/**
 * CLI entry: npm run seed:admins:backfill
 */
import 'dotenv/config';

import { closePool } from '../config/db.js';
import { backfillMissingEnterpriseAdmins } from './seedAdminsService.js';

backfillMissingEnterpriseAdmins()
  .then(({ ok, totalMissing, created, processed }) => {
    if (!ok) process.exitCode = 1;
    else if (totalMissing > 0) {
      console.log(`[seed-admins:backfill] done — ${created}/${processed} created`);
    }
  })
  .catch((err) => {
    console.error('[seed-admins:backfill] failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
