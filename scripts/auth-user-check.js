import 'dotenv/config';

import oracledb from 'oracledb';
import { getConnection, closePool } from '../config/db.js';

async function main() {
  const identifier = String(process.argv[2] || '').trim().toLowerCase();
  if (!identifier) {
    console.log('Usage: node scripts/auth-user-check.js <username-or-email>');
    process.exitCode = 2;
    return;
  }

  const conn = await getConnection();
  try {
    const who = await conn.execute(
      `SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS schema,
              SYS_CONTEXT('USERENV','SESSION_USER')   AS session_user
       FROM dual`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const res = await conn.execute(
      `SELECT ENTERPRISE_ID,
              USERNAME,
              PRIMARY_EMAIL,
              ACCOUNT_STATUS,
              NVL(LOCKED_FLAG,'N') AS LOCKED_FLAG,
              NVL(FAILED_LOGIN_ATTEMPTS,0) AS FAILED_LOGIN_ATTEMPTS
       FROM FNDSEC.FNDSEC_USERS
       WHERE LOWER(USERNAME) = :identifier
          OR LOWER(PRIMARY_EMAIL) = :identifier`,
      {
        identifier: { val: identifier, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = res?.rows?.[0] || null;
    console.log('Connected as:', who?.rows?.[0]);
    console.log('User row found:', !!row);
    if (row) {
      console.log('enterprise_id:', row.ENTERPRISE_ID);
      console.log('username:', row.USERNAME);
      console.log('primary_email:', row.PRIMARY_EMAIL);
      console.log('account_status:', row.ACCOUNT_STATUS);
      console.log('locked_flag:', row.LOCKED_FLAG);
      console.log('failed_login_attempts:', row.FAILED_LOGIN_ATTEMPTS);
    }
  } finally {
    await conn.close();
    await closePool();
  }
}

main().catch((err) => {
  console.error('auth-user-check failed');
  console.error(String(err?.message || err));
  process.exitCode = 1;
});

