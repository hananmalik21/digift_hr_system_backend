import { DatabaseError } from '../../../../utils/errors/index.js';
import {
  LOOKUP_TYPE_RESPONSE_KEYS,
  SUPPORTED_LOOKUP_TYPES,
  GENERIC_READ_ERROR_MESSAGE
} from '../constants/payBalanceDefinitions.constants.js';
import {
  buildBalanceDefinitionListBinds,
  COUNT_SQL,
  GET_BY_GUID_SQL,
  LIST_SQL,
  SUMMARY_SQL
} from '../utils/payBalanceDefinitionsFilterBuilder.js';
import {
  mapPayBalanceCategoryDropdownRow,
  mapPayBalanceDefinitionSummaryRow,
  mapPayBalanceDefinitionViewRow,
  mapPayBalanceSetupLookupRow,
  readScalarCount
} from '../utils/payBalanceDefinitionsViewUtils.js';
import {
  logPayViewOracleError,
  PAY_VIEW_ROW_OBJECT,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

const CATEGORIES_VIEW = 'PAY.V_PAY_BALANCE_CATEGORIES';
const LOOKUP_VALUES_VIEW = 'PAY.V_PAY_LOOKUP_VALUES';
const LOG_TAG = 'payBalanceDefinitionsViewModel';

const ACTIVE_CATEGORIES_SQL = `
SELECT *
FROM ${CATEGORIES_VIEW}
WHERE (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)
  AND STATUS_CODE = 'ACTIVE'
ORDER BY CATEGORY_TYPE_CODE, CATEGORY_NAME`;

const LOOKUP_VALUES_SQL = `
SELECT
  TYPE_CODE,
  VALUE_CODE,
  VALUE_NAME,
  DISPLAY_SEQUENCE
FROM ${LOOKUP_VALUES_VIEW}
WHERE (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)
  AND ACTIVE_FLAG = 'Y'
  AND TYPE_CODE IN (${SUPPORTED_LOOKUP_TYPES.map((_, i) => `:type_code_${i}`).join(', ')})
  AND (:filter_type_code IS NULL OR TYPE_CODE = :filter_type_code)
ORDER BY TYPE_CODE, DISPLAY_SEQUENCE, VALUE_NAME`;

function handleViewError(err, context) {
  logPayViewOracleError(LOG_TAG, context, err);
  throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
}

function buildLookupBinds(enterpriseId, typeCode = null) {
  const binds = {
    enterprise_id: enterpriseId,
    filter_type_code: typeCode
  };

  SUPPORTED_LOOKUP_TYPES.forEach((code, index) => {
    binds[`type_code_${index}`] = code;
  });

  return binds;
}

function groupLookupRows(rows, typeCodeFilter = null) {
  const grouped = {};

  for (const typeCode of SUPPORTED_LOOKUP_TYPES) {
    if (typeCodeFilter && typeCode !== typeCodeFilter) continue;
    grouped[LOOKUP_TYPE_RESPONSE_KEYS[typeCode]] = [];
  }

  for (const row of rows) {
    const mapped = mapPayBalanceSetupLookupRow(row);
    const typeCode = String(row.TYPE_CODE ?? row.type_code ?? '').toUpperCase();
    const responseKey = LOOKUP_TYPE_RESPONSE_KEYS[typeCode];
    if (!responseKey || !grouped[responseKey]) continue;
    grouped[responseKey].push(mapped);
  }

  return grouped;
}

export async function listPayBalanceDefinitionsFromView(filters) {
  const listBinds = buildBalanceDefinitionListBinds(filters);
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
        rows: (dataResult.rows || []).map(mapPayBalanceDefinitionViewRow),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceDefinitionsFromView');
  }
}

export async function getPayBalanceDefinitionFromViewByGuid(balanceDefinitionGuidHex, enterpriseId) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        GET_BY_GUID_SQL,
        {
          balance_definition_guid: balanceDefinitionGuidHex,
          enterprise_id: enterpriseId
        },
        PAY_VIEW_ROW_OBJECT
      );
      const row = result.rows?.[0];
      return row ? mapPayBalanceDefinitionViewRow(row) : null;
    });
  } catch (err) {
    handleViewError(err, 'getPayBalanceDefinitionFromViewByGuid');
  }
}

export async function getPayBalanceDefinitionSummaryFromView(enterpriseId) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        SUMMARY_SQL,
        { enterprise_id: enterpriseId },
        PAY_VIEW_ROW_OBJECT
      );
      return mapPayBalanceDefinitionSummaryRow(result.rows?.[0] || {});
    });
  } catch (err) {
    handleViewError(err, 'getPayBalanceDefinitionSummaryFromView');
  }
}

export async function listActiveBalanceCategoriesFromView(enterpriseId) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        ACTIVE_CATEGORIES_SQL,
        { enterprise_id: enterpriseId },
        PAY_VIEW_ROW_OBJECT
      );
      return (result.rows || []).map(mapPayBalanceCategoryDropdownRow);
    });
  } catch (err) {
    handleViewError(err, 'listActiveBalanceCategoriesFromView');
  }
}

export async function listPayBalanceSetupLookupsFromView(enterpriseId, typeCode = null) {
  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        LOOKUP_VALUES_SQL,
        buildLookupBinds(enterpriseId, typeCode),
        PAY_VIEW_ROW_OBJECT
      );
      return groupLookupRows(result.rows || [], typeCode);
    });
  } catch (err) {
    handleViewError(err, 'listPayBalanceSetupLookupsFromView');
  }
}
