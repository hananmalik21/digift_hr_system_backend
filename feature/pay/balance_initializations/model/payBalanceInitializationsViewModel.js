import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  EXPORT_MAX_ROWS,
  GENERIC_READ_ERROR_MESSAGE
} from '../constants/payBalanceInitializations.constants.js';
import {
  buildBalanceInitializationListBinds,
  buildExportSql,
  buildListSql,
  COUNT_SQL,
  GET_BY_GUID_SQL
} from '../utils/payBalanceInitializationsFilterBuilder.js';
import {
  mapPayBalanceInitializationViewRow,
  readScalarCount
} from '../utils/payBalanceInitializationsViewUtils.js';
import {
  logPayViewOracleError,
  PAY_VIEW_ROW_OBJECT,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

const LOG_TAG = 'payBalanceInitializationsViewModel';

function handleViewError(err, context) {
  logPayViewOracleError(LOG_TAG, context, err);
  throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
}

/**
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayBalanceInitializationsFromView(filters) {
  const listBinds = buildBalanceInitializationListBinds(filters);
  const binds = {
    ...listBinds,
    offset: filters.offset,
    limit: filters.limit
  };
  const listSql = buildListSql(filters);

  try {
    return await withPayViewConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(COUNT_SQL, listBinds, PAY_VIEW_ROW_OBJECT),
        connection.execute(listSql, binds, PAY_VIEW_ROW_OBJECT)
      ]);

      return {
        rows: (dataResult.rows || []).map(mapPayBalanceInitializationViewRow),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceInitializationsFromView');
  }
}

/**
 * Export rows with same filters (no OFFSET pagination).
 * @param {Record<string, unknown>} filters
 * @returns {Promise<object[]>}
 */
export async function listPayBalanceInitializationsForExport(filters) {
  const listBinds = buildBalanceInitializationListBinds(filters);
  const binds = {
    ...listBinds,
    limit: filters.limit ?? EXPORT_MAX_ROWS
  };
  const exportSql = buildExportSql(filters);

  try {
    return await withPayViewConnection(async (connection) => {
      const dataResult = await connection.execute(exportSql, binds, PAY_VIEW_ROW_OBJECT);
      return (dataResult.rows || []).map(mapPayBalanceInitializationViewRow);
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceInitializationsForExport');
  }
}

/**
 * @param {string} initializationGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getPayBalanceInitializationFromViewByGuid(
  initializationGuidHex,
  enterpriseId
) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_BY_GUID_SQL,
        {
          balance_initialization_guid: initializationGuidHex,
          enterprise_id: enterpriseId
        },
        PAY_VIEW_ROW_OBJECT
      );
      const row = result.rows?.[0];
      return row ? mapPayBalanceInitializationViewRow(row) : null;
    });
  } catch (err) {
    handleViewError(err, 'getPayBalanceInitializationFromViewByGuid');
  }
}
