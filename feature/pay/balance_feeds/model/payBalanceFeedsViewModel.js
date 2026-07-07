import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_READ_ERROR_MESSAGE } from '../constants/payBalanceFeeds.constants.js';
import {
  buildBalanceFeedListBinds,
  COUNT_SQL,
  GET_BY_GUID_SQL,
  LIST_SQL
} from '../utils/payBalanceFeedsFilterBuilder.js';
import {
  mapPayBalanceFeedViewRow,
  readScalarCount
} from '../utils/payBalanceFeedsViewUtils.js';

const LOG_TAG = 'payBalanceFeedsViewModel';
const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

async function withViewConnection(work) {
  const connection = await db.getConnection();
  try {
    return await work(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function listPayBalanceFeedsFromView(filters) {
  const listBinds = buildBalanceFeedListBinds(filters);
  const binds = {
    ...listBinds,
    offset: filters.offset,
    limit: filters.limit
  };

  try {
    return await withViewConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(COUNT_SQL, listBinds, ROW_OBJECT),
        connection.execute(LIST_SQL, binds, ROW_OBJECT)
      ]);

      const rows = await Promise.all((dataResult.rows || []).map(mapPayBalanceFeedViewRow));

      return {
        rows,
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    logOracleError(err, 'listPayBalanceFeedsFromView');
    throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
  }
}

export async function getPayBalanceFeedFromViewByGuid(balanceFeedGuidHex) {
  try {
    return await withViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_BY_GUID_SQL,
        { balance_feed_guid: balanceFeedGuidHex },
        ROW_OBJECT
      );
      const row = result.rows?.[0];
      return row ? mapPayBalanceFeedViewRow(row) : null;
    });
  } catch (err) {
    logOracleError(err, 'getPayBalanceFeedFromViewByGuid');
    throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
  }
}
