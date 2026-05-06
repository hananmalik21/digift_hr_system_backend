import 'dotenv/config';

import oracledb from 'oracledb';
import { getConnection, closePool } from '../config/db.js';

async function main() {
  const enterpriseId = Number(process.argv[2] || 1);
  const username = String(process.argv[3] || '').trim().toLowerCase();
  if (!enterpriseId || !username) {
    console.log('Usage: node scripts/auth-user-check.js <enterprise_id> <username>');
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
              ACCOUNT_STATUS,
              NVL(LOCKED_FLAG,'N') AS LOCKED_FLAG,
              NVL(FAILED_LOGIN_ATTEMPTS,0) AS FAILED_LOGIN_ATTEMPTS,
              PASSWORD_HASH
       FROM FNDSEC.FNDSEC_USERS
       WHERE ENTERPRISE_ID = :enterprise_id
         AND LOWER(USERNAME) = :username`,
      {
        enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        username: { val: username, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 300 }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = res?.rows?.[0] || null;
    const hash = row?.PASSWORD_HASH == null ? '' : String(row.PASSWORD_HASH);
    const hashType = hash.startsWith('$argon2') ? 'argon2' : hash.startsWith('$2') ? 'bcrypt' : hash ? 'unknown' : 'missing';

    console.log('Connected as:', who?.rows?.[0]);
    console.log('User row found:', !!row);
    if (row) {
      console.log('enterprise_id:', row.ENTERPRISE_ID);
      console.log('username:', row.USERNAME);
      console.log('account_status:', row.ACCOUNT_STATUS);
      console.log('locked_flag:', row.LOCKED_FLAG);
      console.log('failed_login_attempts:', row.FAILED_LOGIN_ATTEMPTS);
      console.log('password_hash_type:', hashType);
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

