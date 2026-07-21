import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_READ_ERROR_MESSAGE } from '../constants/payBalanceCategories.constants.js';
import {
  buildBalanceCategoryListBinds,
  COUNT_SQL,
  GET_BY_GUID_SQL,
  LIST_SQL
} from '../utils/payBalanceCategoriesFilterBuilder.js';
import {
  mapPayBalanceCategoryViewRow,
  readScalarCount
} from '../utils/payBalanceCategoriesViewUtils.js';
import {
  logPayViewOracleError,
  PAY_VIEW_ROW_OBJECT,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

const LOG_TAG = 'payBalanceCategoriesViewModel';

function handleViewError(err, context) {
  logPayViewOracleError(LOG_TAG, context, err);
  throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
}

export async function listPayBalanceCategoriesFromView(filters) {
  const listBinds = buildBalanceCategoryListBinds(filters);
  const binds = {
    ...listBinds,
    offset: filters.offset,
    limit: filters.limit
  };

  try {
    return await withPayViewConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(COUNT_SQL, listBinds, PAY_VIEW_ROW_OBJECT),
        connection.execute(LIST_SQL, binds, PAY_VIEW_ROW_OBJECT)
      ]);

      return {
        rows: (dataResult.rows || []).map(mapPayBalanceCategoryViewRow),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceCategoriesFromView');
  }
}

export async function getPayBalanceCategoryFromViewByGuid(balanceCategoryGuidHex, enterpriseId) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_BY_GUID_SQL,
        {
          balance_category_guid: balanceCategoryGuidHex,
          enterprise_id: enterpriseId
        },
        PAY_VIEW_ROW_OBJECT
      );
      const row = result.rows?.[0];
      return row ? mapPayBalanceCategoryViewRow(row) : null;
    });
  } catch (err) {
    handleViewError(err, 'getPayBalanceCategoryFromViewByGuid');
  }
}
