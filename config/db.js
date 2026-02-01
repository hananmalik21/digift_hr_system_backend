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
const projectWalletPath = path.resolve(__dirname, '../WALLET');


// Use local wallet if it exists, otherwise use project wallet
let walletPath;
if (fs.existsSync(localWalletPath) && fs.existsSync(path.join(localWalletPath, 'cwallet.sso'))) {
  walletPath = localWalletPath;
  console.log('Using local wallet (non-OneDrive location)');
} else {
  walletPath = projectWalletPath;
  console.log('Using project wallet (TESTDB folder)');
  if (process.platform === 'win32') {
    console.log('⚠️  Warning: Wallet in OneDrive may cause ORA-28759 errors');
    console.log('   Consider copying TESTDB to C:\\oracle\\wallet for better compatibility');
  }
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
      console.log('Updated sqlnet.ora with absolute wallet path');
    }
  } catch (error) {
    console.log('Note: Could not update sqlnet.ora:', error.message);
  }
}

// For Windows, ensure path uses backslashes (Windows native format)
// Oracle Instant Client on Windows expects native path format
console.log(`Wallet path: ${absoluteWalletPath}`);
console.log(`TNS_ADMIN: ${process.env.TNS_ADMIN}`);

// Initialize Oracle Client
try {
  // Try to initialize with optional libDir if provided in environment
  const libDir = process.env.ORACLE_CLIENT_LIB_DIR;
  if (libDir) {
    oracledb.initOracleClient({ libDir });
    console.log(`Oracle Client initialized from: ${libDir}`);
  } else {
    // Try to use system Oracle Instant Client
    oracledb.initOracleClient();
    console.log('Oracle Client initialized (using system PATH)');
  }
} catch (error) {
  if (error.message.includes('NJS-045') || error.message.includes('NJS-047') || error.code === 'DPI-1047') {
    console.error('\n❌ Oracle Instant Client not found!');
    console.error('\nPlease install Oracle Instant Client:');
    
    if (process.platform === 'darwin') {
      // macOS instructions
      console.error('\n📦 For macOS (Apple Silicon/Intel):');
      console.error('1. Download Oracle Instant Client from:');
      console.error('   https://www.oracle.com/database/technologies/instant-client/macos-arm64-downloads.html (for Apple Silicon)');
      console.error('   https://www.oracle.com/database/technologies/instant-client/macos-intel-x86-downloads.html (for Intel)');
      console.error('2. Extract the ZIP file to a folder (e.g., ~/oracle/instantclient_21_3)');
      console.error('3. Create a .env file in the project root with:');
      console.error('   ORACLE_CLIENT_LIB_DIR=/Users/yourusername/oracle/instantclient_21_3');
      console.error('\n💡 Quick install with Homebrew (if available):');
      console.error('   brew tap InstantClientTap/instantclient');
      console.error('   brew install instantclient-basic');
      console.error('   Then set: ORACLE_CLIENT_LIB_DIR=/opt/homebrew/lib (Apple Silicon)');
      console.error('   or: ORACLE_CLIENT_LIB_DIR=/usr/local/lib (Intel)');
    } else {
      // Windows/Linux instructions
      console.error('1. Download from: https://www.oracle.com/database/technologies/instant-client/downloads.html');
      console.error('2. Extract to a folder (e.g., C:\\oracle\\instantclient_21_3)');
      console.error('3. Add the folder to your system PATH environment variable');
      console.error('   OR set ORACLE_CLIENT_LIB_DIR in .env file pointing to the folder');
      console.error('\nExample .env entry:');
      console.error('ORACLE_CLIENT_LIB_DIR=C:\\oracle\\instantclient_21_3');
    }
    process.exit(1);
  }
  throw error;
}

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
  
  // Additional options
  externalAuth: false,
  stmtCacheSize: 30
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
      console.log('Connection pool created successfully');
    }
    return pool;
  } catch (error) {
    if (error.message.includes('DB_USER') || error.message.includes('DB_PASSWORD')) {
      console.error('\n❌ Configuration Error:', error.message);
      console.error('\nPlease update your .env file with valid database credentials.');
    } else if (error.errorNum === 28759) {
      console.error('\n❌ Wallet Error (ORA-28759):');
      console.error('Unable to open wallet file. Possible causes:');
      console.error('1. Wallet files are corrupted or inaccessible');
      console.error('2. Wallet files in OneDrive may not be fully synced locally');
      console.error('3. File permissions issue');
      console.error('4. Invalid database credentials');
      console.error(`\nWallet path: ${walletPath}`);
      console.error(`TNS_ADMIN: ${process.env.TNS_ADMIN}`);
      console.error('\n💡 Troubleshooting steps:');
      console.error('1. Ensure wallet files are fully downloaded from OneDrive (not placeholder files)');
      console.error('2. Try copying TESTDB folder to a local drive (not OneDrive)');
      console.error('3. Verify file permissions allow read access');
      console.error('4. Check if cwallet.sso file size > 0 bytes');
    } else if (error.errorNum === 28001) {
      console.error('\n❌ Account Expired (ORA-28001):');
      console.error('Your database account password has expired and must be changed.');
      console.error('\n💡 To fix this:');
      console.error('1. Log into Oracle Cloud Console');
      console.error('2. Navigate to your Autonomous Database');
      console.error('3. Reset the password for user:', dbConfig.user);
      console.error('4. Update DB_PASSWORD in your .env file with the new password');
      console.error('\nAlternatively, connect with SQL*Plus or SQL Developer and run:');
      console.error(`   ALTER USER ${dbConfig.user} IDENTIFIED BY "new_password" ACCOUNT UNLOCK;`);
    } else {
      console.error('Error creating connection pool:', error.message);
    }
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
    console.error('Error getting connection:', error);
    throw error;
  }
}

/**
 * Execute a query
 */
export async function executeQuery(sql, binds = [], options = {}) {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    return result;
  } catch (error) {
    console.error('Error executing query:', error);
    throw error;
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
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
      console.log('Connection pool closed');
    }
  } catch (error) {
    console.error('Error closing pool:', error);
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

