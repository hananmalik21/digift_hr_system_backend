import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPool, closePool } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SQL_FILES = [
  'feature/integrations/google/sql/create_fnd_user_integrations.sql',
  'feature/integrations/google/sql/create_fnd_oauth_states.sql',
  'feature/recruitment/candidates/sql/alter_rec_candidate_interviews_google_meeting.sql'
];

async function runSqlFile(connection, relativePath) {
  const fullPath = path.join(root, relativePath);
  let sql = fs.readFileSync(fullPath, 'utf8');
  sql = sql.replace(/\s*\/\s*$/u, '');
  console.info(`Running ${relativePath}...`);
  await connection.execute(sql);
  console.info(`OK ${relativePath}`);
}

async function main() {
  await createPool();
  const connection = await (await import('../config/db.js')).default.getConnection();
  try {
    for (const file of SQL_FILES) {
      await runSqlFile(connection, file);
    }
    await connection.commit();
    console.info('Google OAuth database provisioning completed.');
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    console.error('Provisioning failed:', err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      await connection.close();
    } catch (_) {}
    await closePool();
  }
}

main();
