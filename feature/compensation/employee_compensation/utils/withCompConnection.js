import db from '../../../../config/db.js';
import { getOracleErrorMessage } from './oracleErrorMessage.js';

const SCHEMA_SQL = `ALTER SESSION SET CURRENT_SCHEMA = COMP`;

/**
 * Runs work against one pooled connection: COMP schema, commit on success,
 * rollback + wrapped rethrow on failure, always closes.
 * @template T
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withCompConnection(work) {
  const connection = await db.getConnection();
  try {
    await connection.execute(SCHEMA_SQL, [], { autoCommit: false });
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {
      /* ignore */
    }
    throw new Error(getOracleErrorMessage(error), { cause: error });
  } finally {
    try {
      await connection.close();
    } catch (_) {
      /* ignore */
    }
  }
}
