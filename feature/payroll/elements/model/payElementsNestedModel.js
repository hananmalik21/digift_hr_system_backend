/**
 * Nested element reads.
 * Views: PAY.V_PAY_ELEMENTS, PAY.V_PAY_ELEMENT_INPUT_VALUES, PAY.V_PAY_ELEMENT_PROCESSING_RULES,
 *        PAY.V_PAY_BALANCE_FEEDS, PAY.V_PAY_ELEMENT_PROFILE_LINKS, PAY.V_PAY_ELEMENT_DEPENDENCIES,
 *        PAY.V_PAY_RECURRING_ELEMENT_ENTRIES
 */
import { queryPayList, queryPayMany, queryPayOne } from '../../shared/index.js';

/**
 * Resolve an element's numeric id + enterprise_id from its GUID.
 * @param {string} elementGuidHex
 * @returns {Promise<{ element_id: number, enterprise_id: number, element_code: string, element_name: string }|null>}
 */
export async function resolveElementByGuid(elementGuidHex) {
  return queryPayOne({
    fromSql: 'PAY.V_PAY_ELEMENTS v',
    selectSql: 'v.ELEMENT_ID, v.ENTERPRISE_ID, v.ELEMENT_CODE, v.ELEMENT_NAME',
    alias: 'v',
    filters: [{ sql: 'v.ELEMENT_GUID = :element_guid', bind: 'element_guid', value: elementGuidHex }],
    logTag: 'payElementsNested'
  });
}

/** GET /:elementGuid/input-values */
export async function listElementInputValues(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_ELEMENT_INPUT_VALUES v',
    filters: [
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId },
      { sql: 'v.STATUS = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.DISPLAY_SEQUENCE ASC',
    allowedSort: { display_sequence: 'v.DISPLAY_SEQUENCE ASC', creation_date: 'v.CREATION_DATE DESC' },
    sortBy: filters.sort_by,
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}

/**
 * GET /:elementGuid/formulas
 * PAY_FORMULAS has no element linkage column, so — per spec — this falls back to the
 * element's processing rules view.
 */
export async function listElementFormulaLinks(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_ELEMENT_PROCESSING_RULES v',
    filters: [{ sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId }],
    defaultSort: 'v.PRIORITY ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}

/** GET /:elementGuid/balance-feeds */
export async function listElementBalanceFeeds(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_BALANCE_FEEDS v',
    selectSql: `
      v.BALANCE_FEED_ID, v.BALANCE_FEED_GUID, v.ENTERPRISE_ID, v.FEED_TYPE_CODE, v.FEED_TYPE_NAME,
      v.ELEMENT_ID, v.ELEMENT_GUID, v.ELEMENT_CODE, v.ELEMENT_NAME, v.INPUT_VALUE_CODE, v.INPUT_VALUE_NAME,
      v.CLASSIFICATION_CODE, v.CLASSIFICATION_NAME, v.FORMULA_ID, v.FORMULA_GUID, v.FORMULA_CODE, v.FORMULA_NAME,
      v.TARGET_BALANCE_ID, v.BALANCE_GUID, v.BALANCE_CODE, v.BALANCE_NAME, v.BALANCE_CATEGORY_CODE,
      v.FEED_DIRECTION_CODE, v.FEED_DIRECTION_NAME, v.EFFECTIVE_START_DATE, v.EFFECTIVE_END_DATE,
      v.STATUS, v.STATUS_NAME, v.DESCRIPTION, v.CREATED_BY, v.CREATION_DATE, v.LAST_UPDATED_BY, v.LAST_UPDATE_DATE
    `.trim(),
    filters: [
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId },
      { sql: 'v.STATUS = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}

/** GET /:elementGuid/eligibility */
export async function listElementEligibilityLinks(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_ELEMENT_PROFILE_LINKS v',
    filters: [
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId },
      { sql: 'v.STATUS = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}

/** GET /:elementGuid/dependencies */
export async function listElementDependencies(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_ELEMENT_DEPENDENCIES v',
    filters: [
      {
        sql: '(v.PRODUCER_ELEMENT_ID = :element_id OR v.CONSUMER_ELEMENT_ID = :element_id)',
        bind: 'element_id',
        value: elementId
      },
      { sql: 'v.VALIDATION_STATUS_CODE = UPPER(:validation_status_code)', bind: 'validation_status_code', value: filters.validation_status_code }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}

/** GET /:elementGuid/recurring-entries */
export async function listElementRecurringEntries(elementId, filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_RECURRING_ELEMENT_ENTRIES v',
    filters: [
      { sql: 'v.ELEMENT_ID = :element_id', bind: 'element_id', value: elementId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id },
      { sql: 'v.STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payElementsNested'
  });
}
