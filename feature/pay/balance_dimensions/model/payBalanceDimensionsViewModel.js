import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_READ_ERROR_MESSAGE } from '../constants/payBalanceDimensions.constants.js';
import {
  buildBalanceDimensionListBinds,
  buildListSql,
  COUNT_SQL,
  GET_BY_GUID_SQL
} from '../utils/payBalanceDimensionsFilterBuilder.js';
import {
  mapPayBalanceDimensionViewRow,
  readScalarCount
} from '../utils/payBalanceDimensionsViewUtils.js';
import {
  logPayViewOracleError,
  PAY_VIEW_ROW_OBJECT,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

const LOG_TAG = 'payBalanceDimensionsViewModel';

function handleViewError(err, context) {
  logPayViewOracleError(LOG_TAG, context, err);
  throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
}

/**
 * List balance dimensions from PAY.V_PAY_BALANCE_DIMENSIONS with filters + pagination.
 * Uses a separate COUNT query with the same WHERE binds.
 *
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayBalanceDimensionsFromView(filters) {
  const listBinds = buildBalanceDimensionListBinds(filters);
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
        rows: (dataResult.rows || []).map(mapPayBalanceDimensionViewRow),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceDimensionsFromView');
  }
}

/**
 * @param {string} balanceDimensionGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getPayBalanceDimensionFromViewByGuid(
  balanceDimensionGuidHex,
  enterpriseId
) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_BY_GUID_SQL,
        {
          balance_dimension_guid: balanceDimensionGuidHex,
          enterprise_id: enterpriseId
        },
        PAY_VIEW_ROW_OBJECT
      );
      const row = result.rows?.[0];
      return row ? mapPayBalanceDimensionViewRow(row) : null;
    });
  } catch (err) {
    handleViewError(err, 'getPayBalanceDimensionFromViewByGuid');
  }
}
