import oracledb from 'oracledb';

const POOL_ALIAS = 'face_oracle_pool';
let pool;

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFacePoolConfig() {
  return {
    user: process.env.ORACLE_USER || process.env.DB_USER,
    password: process.env.ORACLE_PASSWORD || process.env.DB_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING || process.env.DB_CONNECT_STRING,
    poolMin: toInt(process.env.ORACLE_POOL_MIN, 1),
    poolMax: toInt(process.env.ORACLE_POOL_MAX, 10),
    poolIncrement: toInt(process.env.ORACLE_POOL_INCREMENT, 1)
  };
}

export async function createFaceOraclePool() {
  if (pool) {
    return pool;
  }

  const config = getFacePoolConfig();
  if (!config.user || !config.password || !config.connectString) {
    throw new Error('Missing Oracle face pool configuration. Set ORACLE_USER, ORACLE_PASSWORD and ORACLE_CONNECT_STRING.');
  }

  pool = await oracledb.createPool({
    ...config,
    poolAlias: POOL_ALIAS
  });

  return pool;
}

export async function getFaceOracleConnection() {
  if (!pool) {
    await createFaceOraclePool();
  }
  return pool.getConnection();
}

export async function closeFaceOraclePool() {
  if (!pool) {
    return;
  }
  await pool.close(10);
  pool = null;
}
