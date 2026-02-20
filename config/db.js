import oracledb from 'oracledb';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// IMPORTANT: Set TNS_ADMIN BEFORE initializing Oracle Client
// Try local wallet path first (to avoid OneDrive placeholder issues), fallback to TESTDB
const localWalletPath = process.env.ORACLE_WALLET_PATH || 'C:\\oracle\\wallet';
// const projectWalletPath = path.resolve(__dirname, '../TESTDB');
const projectWalletPath = path.resolve(__dirname, '../Wallet');


// Use local wallet if it exists, otherwise use project wallet
let walletPath;
if (fs.existsSync(localWalletPath) && fs.existsSync(path.join(localWalletPath, 'cwallet.sso'))) {
  walletPath = localWalletPath;
} else {
  walletPath = projectWalletPath;
}

const absoluteWalletPath = path.resolve(walletPath);

// Set TNS_ADMIN BEFORE Oracle Client initialization
process.env.TNS_ADMIN = absoluteWalletPath;
process.env.ORA_SDTZ = 'UTC';

// Update sqlnet.ora with absolute path if it exists
const sqlnetPath = path.join(absoluteWalletPath, 'sqlnet.ora');
if (fs.existsSync(sqlnetPath)) {
  try {
    let sqlnetContent = fs.readFileSync(sqlnetPath, 'utf8');
    // Update wallet location to absolute path if it uses relative path
    if (sqlnetContent.includes('?/network/admin')) {
      sqlnetContent = sqlnetContent.replace(
        /DIRECTORY="\?\/network\/admin"/g,
        `DIRECTORY="${absoluteWalletPath.replace(/\\/g, '/')}"`
      );
      fs.writeFileSync(sqlnetPath, sqlnetContent, 'utf8');
    }
  } catch (_) {}
}

// Initialize Oracle Client
try {
  const libDir = process.env.ORACLE_CLIENT_LIB_DIR;
  if (libDir) {
    oracledb.initOracleClient({ libDir });
  } else {
    oracledb.initOracleClient();
  }
} catch (error) {
  if (error.message.includes('NJS-045') || error.message.includes('NJS-047') || error.code === 'DPI-1047') {
    process.exit(1);
  }
  throw error;
}

// Fetch CLOB columns as strings (not Lob streams). Must be set before any query runs.
// Ensures columns like ORG_STRUCTURE_LIST (JSON_SERIALIZE(...) RETURNING CLOB) are strings for JSON.parse.
oracledb.fetchAsString = [oracledb.CLOB];

/**
 * Database configuration
 * Using full connection string to avoid TNS resolution wallet issues
 */
const tnsName = process.env.DB_CONNECT_STRING || 'testdb_high';
// Full connection strings from tnsnames.ora (for TCPS/SSL connections)
const connectionStrings = {
  'testdb_high': '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g3ef73baddaf774_testdb_high.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
  'testdb_low': '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g3ef73baddaf774_testdb_low.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
  'testdb_medium': '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g3ef73baddaf774_testdb_medium.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
  'testdb_tp': '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g3ef73baddaf774_testdb_tp.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))',
  'testdb_tpurgent': '(description= (retry_count=20)(retry_delay=3)(address=(protocol=tcps)(port=1522)(host=adb.eu-frankfurt-1.oraclecloud.com))(connect_data=(service_name=g3ef73baddaf774_testdb_tpurgent.adb.oraclecloud.com))(security=(ssl_server_dn_match=yes)))'
};

const connectString = connectionStrings[tnsName] || tnsName;

const dbConfig = {
  // Use full connection string - still requires wallet for SSL certificates
  connectString: connectString,
  
  // User credentials from environment variables
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  
  // Connection pool configuration
  poolMin: parseInt(process.env.DB_POOL_MIN) || 2,
  poolMax: parseInt(process.env.DB_POOL_MAX) || 10,
  poolIncrement: parseInt(process.env.DB_POOL_INCREMENT) || 1,
  poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT) || 60,
  
  // Additional options (stmtCacheSize reduces parse overhead for repeated statements)
  externalAuth: false,
  stmtCacheSize: parseInt(process.env.DB_STMT_CACHE_SIZE, 10) || 50
};

/**
 * Create a connection pool
 */
let pool = null;

export async function createPool() {
  try {
    // Validate configuration
    if (!dbConfig.user || dbConfig.user === 'your_username') {
      throw new Error('DB_USER is not set in .env file. Please provide your database username.');
    }
    if (!dbConfig.password || dbConfig.password === 'your_password') {
      throw new Error('DB_PASSWORD is not set in .env file. Please provide your database password.');
    }
    
    // Verify wallet path exists
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet path not found: ${walletPath}`);
    }
    if (!fs.existsSync(path.join(walletPath, 'cwallet.sso'))) {
      throw new Error(`Wallet file not found in: ${walletPath}`);
    }
    
    if (!pool) {
      pool = await oracledb.createPool(dbConfig);
    }
    return pool;
  } catch (error) {
    throw error;
  }
}

/**
 * Get a connection from the pool
 */
export async function getConnection() {
  try {
    if (!pool) {
      await createPool();
    }
    return await pool.getConnection();
  } catch (error) {
    throw error;
  }
}

/**
 * Execute a query.
 * When options.connection is provided, uses that connection and does not close it (caller owns it).
 * When omitted, gets a connection from the pool and closes it after execution.
 */
export async function executeQuery(sql, binds = [], options = {}) {
  const { connection: existingConn, ...executeOptions } = options;
  const owned = !existingConn;
  const connection = existingConn || await getConnection();
  try {
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...executeOptions
    });
    return result;
  } catch (error) {
    throw error;
  } finally {
    if (owned && connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * Close the connection pool
 */
export async function closePool() {
  try {
    if (pool) {
      await pool.close();
      pool = null;
    }
  } catch (error) {
    throw error;
  }
}

// Default export for convenience
export default {
  createPool,
  getConnection,
  executeQuery,
  closePool,
  dbConfig
};

