/**
 * Employee Balance Inquiry — Oracle read model (read-only).
 *
 * Current snapshot: PAY.V_EMPLOYEE_BALANCE_INQUIRY
 * As-of-date: PAY.PAY_BALANCE_INITIALIZATIONS + PAY.PAY_BALANCE_DIMENSIONS
 */
import { DatabaseError } from '../../../../utils/errors/index.js';
import { GENERIC_READ_ERROR_MESSAGE } from '../constants/payEmployeeBalanceInquiry.constants.js';
import {
  AS_OF_COUNT_SQL,
  AS_OF_SQL,
  CURRENT_COUNT_SQL,
  CURRENT_SNAPSHOT_SQL,
  buildInquiryBinds,
  hasAsOfDate
} from '../utils/payEmployeeBalanceInquiryFilterBuilder.js';
import {
  groupRowsByEmployee,
  readScalarCount
} from '../utils/payEmployeeBalanceInquiryViewUtils.js';
import {
  logPayViewOracleError,
  PAY_VIEW_ROW_OBJECT,
  withPayViewConnection
} from '../../utils/payViewModelUtils.js';

const LOG_TAG = 'payEmployeeBalanceInquiryModel';

function handleViewError(err, context) {
  logPayViewOracleError(LOG_TAG, context, err);
  throw new DatabaseError(GENERIC_READ_ERROR_MESSAGE, err, GENERIC_READ_ERROR_MESSAGE);
}

/**
 * Relational rows → employees with nested balances[].
 * Pagination is employee-level (DENSE_RANK).
 *
 * @param {Record<string, unknown>} filters
 * @returns {Promise<{ data: object[], total: number }>}
 */
export async function getEmployeeBalanceInquiry(filters) {
  const useAsOf = hasAsOfDate(filters);
  const listBinds = buildInquiryBinds(filters, { includePagination: true, includeAsOf: useAsOf });
  const countBinds = buildInquiryBinds(filters, {
    includePagination: false,
    includeAsOf: useAsOf
  });

  try {
    return await withPayViewConnection(async (connection) => {
      const [countResult, dataResult] = await Promise.all([
        connection.execute(
          useAsOf ? AS_OF_COUNT_SQL : CURRENT_COUNT_SQL,
          countBinds,
          PAY_VIEW_ROW_OBJECT
        ),
        connection.execute(
          useAsOf ? AS_OF_SQL : CURRENT_SNAPSHOT_SQL,
          listBinds,
          PAY_VIEW_ROW_OBJECT
        )
      ]);

      return {
        data: groupRowsByEmployee(dataResult.rows || []),
        total: readScalarCount(countResult)
      };
    });
  } catch (err) {
    handleViewError(err, useAsOf ? 'getEmployeeBalanceInquiry:asOf' : 'getEmployeeBalanceInquiry');
  }
}
