/**
 * Element dependencies — PAY.PAY_ELEMENT_DEPENDENCY_PKG (recompute-only) + PAY.V_PAY_ELEMENT_DEPENDENCIES.
 *
 * There is no create/update/delete package: the dependency graph is derived from element
 * formula/balance-feed configuration and (re)computed by REFRESH_DEPENDENCIES. Direct CRUD
 * on individual dependency rows is intentionally not supported.
 */

import oracledb from 'oracledb';
import { dateBind, executePayrollPackage, numberBind, queryPayList, queryPayOne, stringBind } from '../shared/index.js';

const PKG = 'PAY.PAY_ELEMENT_DEPENDENCY_PKG';
const VIEW = 'PAY.V_PAY_ELEMENT_DEPENDENCIES';

const SORT_MAP = {
  priority: 'v.PRODUCER_PRIORITY',
  created: 'v.CREATION_DATE',
  status: 'v.VALIDATION_STATUS_CODE'
};

export async function listDependencies(filters) {
  return queryPayList({
    fromSql: `${VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PRODUCER_ELEMENT_ID = :producer_element_id', bind: 'producer_element_id', value: filters.producerElementId },
      { sql: 'v.CONSUMER_ELEMENT_ID = :consumer_element_id', bind: 'consumer_element_id', value: filters.consumerElementId },
      { sql: 'v.BALANCE_ID = :balance_id', bind: 'balance_id', value: filters.balanceId },
      { sql: 'v.VALIDATION_STATUS_CODE = :validation_status_code', bind: 'validation_status_code', value: filters.validationStatusCode }
    ],
    search: {
      columns: ['v.PRODUCER_ELEMENT_CODE', 'v.PRODUCER_ELEMENT_NAME', 'v.CONSUMER_ELEMENT_CODE', 'v.CONSUMER_ELEMENT_NAME', 'v.VARIABLE_NAME'],
      value: filters.search
    },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: SORT_MAP,
    defaultSort: 'v.PRODUCER_PRIORITY ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollElementDependencies'
  });
}

export async function getDependencyByGuid(guid) {
  return queryPayOne({
    fromSql: `${VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(v.DEPENDENCY_GUID) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollElementDependencies'
  });
}

/**
 * VALIDATE_DEPENDENCIES(P_ENTERPRISE_ID, P_EFFECTIVE_AS_OF_DATE, P_VALIDATED_BY,
 *   OUT P_DEPENDENCY_COUNT, P_INVALID_PRIORITY_COUNT, P_CYCLE_COUNT, P_SUCCESS, P_MESSAGE)
 */
export async function validateDependencies(enterpriseId, effectiveAsOfDate, validatedBy) {
  const plsql = `
BEGIN
  ${PKG}.VALIDATE_DEPENDENCIES(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_EFFECTIVE_AS_OF_DATE    => :p_effective_as_of_date,
    P_VALIDATED_BY            => :p_validated_by,
    P_DEPENDENCY_COUNT        => :p_dependency_count,
    P_INVALID_PRIORITY_COUNT  => :p_invalid_priority_count,
    P_CYCLE_COUNT             => :p_cycle_count,
    P_SUCCESS                 => :p_success,
    P_MESSAGE                 => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_effective_as_of_date: dateBind(effectiveAsOfDate),
      p_validated_by: stringBind(validatedBy, 100),
      p_dependency_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_invalid_priority_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_cycle_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to validate element dependencies. Please try again.',
      successKeys: ['p_success'],
      mapOut: (out, helpers) => ({
        dependency_count: helpers.num('p_dependency_count'),
        invalid_priority_count: helpers.num('p_invalid_priority_count'),
        cycle_count: helpers.num('p_cycle_count')
      })
    }
  );
}

/**
 * REFRESH_DEPENDENCIES(P_ENTERPRISE_ID, P_EFFECTIVE_AS_OF_DATE, P_UPDATED_BY,
 *   OUT P_DEPENDENCY_COUNT, P_INVALID_PRIORITY_COUNT, P_CYCLE_COUNT, P_SUCCESS, P_MESSAGE)
 */
export async function refreshDependencies(enterpriseId, effectiveAsOfDate, updatedBy) {
  const plsql = `
BEGIN
  ${PKG}.REFRESH_DEPENDENCIES(
    P_ENTERPRISE_ID           => :p_enterprise_id,
    P_EFFECTIVE_AS_OF_DATE    => :p_effective_as_of_date,
    P_UPDATED_BY              => :p_updated_by,
    P_DEPENDENCY_COUNT        => :p_dependency_count,
    P_INVALID_PRIORITY_COUNT  => :p_invalid_priority_count,
    P_CYCLE_COUNT             => :p_cycle_count,
    P_SUCCESS                 => :p_success,
    P_MESSAGE                 => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_effective_as_of_date: dateBind(effectiveAsOfDate),
      p_updated_by: stringBind(updatedBy, 100),
      p_dependency_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_invalid_priority_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_cycle_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to refresh element dependencies. Please try again.',
      successKeys: ['p_success'],
      mapOut: (out, helpers) => ({
        dependency_count: helpers.num('p_dependency_count'),
        invalid_priority_count: helpers.num('p_invalid_priority_count'),
        cycle_count: helpers.num('p_cycle_count')
      })
    }
  );
}
