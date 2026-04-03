import 'dotenv/config';

import { getConnection, closePool } from '../config/db.js';

async function main() {
  const conn = await getConnection();
  try {
    const result = await conn.execute(`SELECT 1 AS ok FROM dual`);
    const row = result?.rows?.[0];
    console.log('Oracle DB OK:', row);
  } finally {
    await conn.close();
    await closePool();
  }
}

main().catch((err) => {
  console.error('Oracle DB FAILED');
  console.error(err);
  process.exitCode = 1;
});

