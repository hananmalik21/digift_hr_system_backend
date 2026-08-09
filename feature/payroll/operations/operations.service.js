/**
 * Operations & certification — PAY.PAY_PRODUCTION_CERT_PKG.
 *
 * Views: V_PAY_OPERATION_RUNS, V_PAY_OPERATION_STEPS, V_PAY_OPERATION_EVENTS,
 *        V_PAY_HEALTH_CHECK_RESULTS, V_PAY_PROD_CERTIFICATIONS, V_PAY_PROD_CERT_RESULTS
 * Table (read-only, no CRUD package): PAY_HEALTH_CHECK_RUNS
 */

import oracledb from 'oracledb';
import db from '../../../config/db.js';
import { executePayrollPackage, mapPayrollOracleError, numberBind, queryPayList, queryPayOne, stringBind } from '../shared/index.js';

const PKG = 'PAY.PAY_PRODUCTION_CERT_PKG';
const OPERATION_RUNS_VIEW = 'PAY.V_PAY_OPERATION_RUNS';
const OPERATION_STEPS_VIEW = 'PAY.V_PAY_OPERATION_STEPS';
const OPERATION_EVENTS_VIEW = 'PAY.V_PAY_OPERATION_EVENTS';
const HEALTH_CHECK_RESULTS_VIEW = 'PAY.V_PAY_HEALTH_CHECK_RESULTS';
const PROD_CERTIFICATIONS_VIEW = 'PAY.V_PAY_PROD_CERTIFICATIONS';
const PROD_CERT_RESULTS_VIEW = 'PAY.V_PAY_PROD_CERT_RESULTS';
const HEALTH_CHECK_RUNS_TABLE = 'PAY.PAY_HEALTH_CHECK_RUNS';

function outNum(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
}
function outStr(name, maxSize = 4000) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize } };
}

// --- Operation runs -----------------------------------------------------------------------

export async function listOperationRuns(filters) {
  return queryPayList({
    fromSql: `${OPERATION_RUNS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.OPERATION_TYPE_CODE = :operation_type_code', bind: 'operation_type_code', value: filters.operationTypeCode },
      { sql: 'v.SOURCE_RUN_ID = :source_run_id', bind: 'source_run_id', value: filters.sourceRunId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.OPERATION_NUMBER'], value: filters.search },
    defaultSort: 'v.REQUESTED_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollOperationRuns'
  });
}

export async function getOperationRunById(operationRunId) {
  return queryPayOne({
    fromSql: `${OPERATION_RUNS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.OPERATION_RUN_ID = :id', bind: 'id', value: operationRunId }],
    logTag: 'payrollOperationRuns'
  });
}

export async function listOperationSteps(operationRunId) {
  const { data } = await queryPayList({
    fromSql: `${OPERATION_STEPS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.OPERATION_RUN_ID = :id', bind: 'id', value: operationRunId }],
    defaultSort: 'v.STEP_SEQUENCE ASC',
    page: 1,
    pageSize: 200,
    logTag: 'payrollOperationSteps'
  });
  return data;
}

export async function listOperationEvents(operationRunId) {
  const { data } = await queryPayList({
    fromSql: `${OPERATION_EVENTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.OPERATION_RUN_ID = :id', bind: 'id', value: operationRunId }],
    defaultSort: 'v.EVENT_DATE ASC',
    page: 1,
    pageSize: 500,
    logTag: 'payrollOperationEvents'
  });
  return data;
}

/**
 * CREATE_OPERATION(P_ENTERPRISE_ID, P_OPERATION_TYPE_CODE, P_SOURCE_RUN_ID, P_SOURCE_OBJECT_TYPE,
 *   P_SOURCE_OBJECT_ID, P_REQUESTED_BY, OUT P_OPERATION_RUN_ID, P_OPERATION_NUMBER, P_SUCCESS, P_MESSAGE)
 */
export async function createOperation(body, requestedBy) {
  const plsql = `
BEGIN
  ${PKG}.CREATE_OPERATION(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_OPERATION_TYPE_CODE => :p_operation_type_code,
    P_SOURCE_RUN_ID       => :p_source_run_id,
    P_SOURCE_OBJECT_TYPE  => :p_source_object_type,
    P_SOURCE_OBJECT_ID    => :p_source_object_id,
    P_REQUESTED_BY        => :p_requested_by,
    P_OPERATION_RUN_ID    => :p_operation_run_id,
    P_OPERATION_NUMBER    => :p_operation_number,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_operation_type_code: stringBind(body.operation_type_code, 50),
      p_source_run_id: numberBind(body.source_run_id),
      p_source_object_type: stringBind(body.source_object_type, 50),
      p_source_object_id: numberBind(body.source_object_id),
      p_requested_by: stringBind(requestedBy, 100),
      ...outNum('p_operation_run_id'),
      ...outStr('p_operation_number', 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to create operation run. Please try again.',
      mapOut: (out, helpers) => ({
        operation_run_id: helpers.num('p_operation_run_id'),
        operation_number: helpers.str('p_operation_number')
      })
    }
  );
}

/** START_STEP(P_OPERATION_RUN_ID, P_STEP_CODE, P_ACTION_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function startStep(operationRunId, stepCode, actionBy) {
  const plsql = `
BEGIN
  ${PKG}.START_STEP(
    P_OPERATION_RUN_ID => :p_operation_run_id,
    P_STEP_CODE        => :p_step_code,
    P_ACTION_BY        => :p_action_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_operation_run_id: numberBind(operationRunId),
      p_step_code: stringBind(stepCode, 100),
      p_action_by: stringBind(actionBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to start operation step. Please try again.' }
  );
}

/** COMPLETE_STEP(P_OPERATION_RUN_ID, P_STEP_CODE, P_RECOVERY_TOKEN, P_ACTION_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function completeStep(operationRunId, stepCode, recoveryToken, actionBy) {
  const plsql = `
BEGIN
  ${PKG}.COMPLETE_STEP(
    P_OPERATION_RUN_ID => :p_operation_run_id,
    P_STEP_CODE        => :p_step_code,
    P_RECOVERY_TOKEN   => :p_recovery_token,
    P_ACTION_BY        => :p_action_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_operation_run_id: numberBind(operationRunId),
      p_step_code: stringBind(stepCode, 100),
      p_recovery_token: stringBind(recoveryToken, 200),
      p_action_by: stringBind(actionBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to complete operation step. Please try again.' }
  );
}

/**
 * FAIL_STEP(P_OPERATION_RUN_ID, P_STEP_CODE, P_ERROR_CODE, P_ERROR_MESSAGE, P_ERROR_BACKTRACE,
 *   P_ACTION_BY, OUT P_SUCCESS, P_MESSAGE)
 */
export async function failStep(operationRunId, stepCode, errorCode, errorMessage, errorBacktrace, actionBy) {
  const plsql = `
BEGIN
  ${PKG}.FAIL_STEP(
    P_OPERATION_RUN_ID => :p_operation_run_id,
    P_STEP_CODE        => :p_step_code,
    P_ERROR_CODE       => :p_error_code,
    P_ERROR_MESSAGE    => :p_error_message,
    P_ERROR_BACKTRACE  => :p_error_backtrace,
    P_ACTION_BY        => :p_action_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_operation_run_id: numberBind(operationRunId),
      p_step_code: stringBind(stepCode, 100),
      p_error_code: numberBind(errorCode),
      p_error_message: stringBind(errorMessage, 4000),
      p_error_backtrace: stringBind(errorBacktrace, 4000),
      p_action_by: stringBind(actionBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to record operation step failure. Please try again.' }
  );
}

/** RETRY_OPERATION(P_OPERATION_RUN_ID, P_ACTION_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function retryOperation(operationRunId, actionBy) {
  const plsql = `
BEGIN
  ${PKG}.RETRY_OPERATION(
    P_OPERATION_RUN_ID => :p_operation_run_id,
    P_ACTION_BY        => :p_action_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_operation_run_id: numberBind(operationRunId),
      p_action_by: stringBind(actionBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to retry operation. Please try again.' }
  );
}

/** COMPLETE_OPERATION(P_OPERATION_RUN_ID, P_ACTION_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function completeOperation(operationRunId, actionBy) {
  const plsql = `
BEGIN
  ${PKG}.COMPLETE_OPERATION(
    P_OPERATION_RUN_ID => :p_operation_run_id,
    P_ACTION_BY        => :p_action_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_operation_run_id: numberBind(operationRunId),
      p_action_by: stringBind(actionBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to complete operation. Please try again.' }
  );
}

/** TEST_RUN_LOCK(P_ENTERPRISE_ID, P_RUN_ID, OUT P_BLOCKED_FLAG, P_MESSAGE) — no P_SUCCESS out. */
export async function testRunLock(enterpriseId, runId) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      `BEGIN
         ${PKG}.TEST_RUN_LOCK(
           P_ENTERPRISE_ID => :p_enterprise_id,
           P_RUN_ID        => :p_run_id,
           P_BLOCKED_FLAG  => :p_blocked_flag,
           P_MESSAGE       => :p_message
         );
       END;`,
      {
        p_enterprise_id: numberBind(enterpriseId),
        p_run_id: numberBind(runId),
        p_blocked_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
      }
    );
    const blocked = String(result.outBinds?.p_blocked_flag ?? '').trim().toUpperCase() === 'Y';
    return { blocked, message: result.outBinds?.p_message ?? null };
  } catch (err) {
    const mapped = mapPayrollOracleError(err);
    return { blocked: null, message: mapped.message };
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

// --- Health checks ------------------------------------------------------------------------

export async function listHealthCheckRuns(filters) {
  return queryPayList({
    fromSql: `${HEALTH_CHECK_RUNS_TABLE} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.SOURCE_RUN_ID = :source_run_id', bind: 'source_run_id', value: filters.sourceRunId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.CHECK_NUMBER'], value: filters.search },
    defaultSort: 'v.STARTED_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollHealthCheckRuns'
  });
}

export async function getHealthCheckRunById(healthCheckRunId) {
  return queryPayOne({
    fromSql: `${HEALTH_CHECK_RUNS_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'v.HEALTH_CHECK_RUN_ID = :id', bind: 'id', value: healthCheckRunId }],
    logTag: 'payrollHealthCheckRuns'
  });
}

export async function listHealthCheckResults(healthCheckRunId) {
  const { data } = await queryPayList({
    fromSql: `${HEALTH_CHECK_RESULTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.HEALTH_CHECK_RUN_ID = :id', bind: 'id', value: healthCheckRunId }],
    defaultSort: 'v.CHECK_SEQUENCE ASC',
    page: 1,
    pageSize: 500,
    logTag: 'payrollHealthCheckResults'
  });
  return data;
}

/**
 * RUN_HEALTH_CHECKS(P_ENTERPRISE_ID, P_RUN_ID, P_REQUESTED_BY, OUT P_HEALTH_CHECK_RUN_ID, P_STATUS,
 *   P_PASS_COUNT, P_WARN_COUNT, P_FAIL_COUNT, P_SUCCESS, P_MESSAGE)
 */
export async function runHealthChecks(enterpriseId, runId, requestedBy) {
  const plsql = `
BEGIN
  ${PKG}.RUN_HEALTH_CHECKS(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_RUN_ID              => :p_run_id,
    P_REQUESTED_BY        => :p_requested_by,
    P_HEALTH_CHECK_RUN_ID => :p_health_check_run_id,
    P_STATUS              => :p_status,
    P_PASS_COUNT          => :p_pass_count,
    P_WARN_COUNT          => :p_warn_count,
    P_FAIL_COUNT          => :p_fail_count,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_run_id: numberBind(runId),
      p_requested_by: stringBind(requestedBy, 100),
      ...outNum('p_health_check_run_id'),
      ...outStr('p_status', 30),
      ...outNum('p_pass_count'),
      ...outNum('p_warn_count'),
      ...outNum('p_fail_count'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to run health checks. Please try again.',
      mapOut: (out, helpers) => ({
        health_check_run_id: helpers.num('p_health_check_run_id'),
        status: helpers.str('p_status'),
        pass_count: helpers.num('p_pass_count'),
        warn_count: helpers.num('p_warn_count'),
        fail_count: helpers.num('p_fail_count')
      })
    }
  );
}

// --- Certification --------------------------------------------------------------------------

export async function listCertifications(filters) {
  return queryPayList({
    fromSql: `${PROD_CERTIFICATIONS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.SOURCE_RUN_ID = :source_run_id', bind: 'source_run_id', value: filters.sourceRunId },
      { sql: 'v.SCOPE_CODE = :scope_code', bind: 'scope_code', value: filters.scopeCode },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.CERTIFICATION_NUMBER'], value: filters.search },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollProdCertifications'
  });
}

export async function getCertificationById(productionCertId) {
  return queryPayOne({
    fromSql: `${PROD_CERTIFICATIONS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.PRODUCTION_CERT_ID = :id', bind: 'id', value: productionCertId }],
    logTag: 'payrollProdCertifications'
  });
}

export async function listCertificationResults(productionCertId) {
  const { data } = await queryPayList({
    fromSql: `${PROD_CERT_RESULTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.PRODUCTION_CERT_ID = :id', bind: 'id', value: productionCertId }],
    defaultSort: 'v.GATE_SEQUENCE ASC',
    page: 1,
    pageSize: 500,
    logTag: 'payrollProdCertResults'
  });
  return data;
}

/**
 * RUN_CERTIFICATION(P_ENTERPRISE_ID, P_RUN_ID, P_CERTIFIED_BY, OUT P_PRODUCTION_CERT_ID, P_STATUS,
 *   P_PERCENTAGE, P_SUCCESS, P_MESSAGE)
 */
export async function runCertification(enterpriseId, runId, certifiedBy) {
  const plsql = `
BEGIN
  ${PKG}.RUN_CERTIFICATION(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_RUN_ID            => :p_run_id,
    P_CERTIFIED_BY      => :p_certified_by,
    P_PRODUCTION_CERT_ID=> :p_production_cert_id,
    P_STATUS            => :p_status,
    P_PERCENTAGE        => :p_percentage,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_run_id: numberBind(runId),
      p_certified_by: stringBind(certifiedBy, 100),
      ...outNum('p_production_cert_id'),
      ...outStr('p_status', 30),
      ...outNum('p_percentage'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to run production certification. Please try again.',
      mapOut: (out, helpers) => ({
        production_cert_id: helpers.num('p_production_cert_id'),
        status: helpers.str('p_status'),
        percentage: helpers.num('p_percentage')
      })
    }
  );
}

/** IS_CERTIFIED(P_ENTERPRISE_ID, P_RUN_ID, P_SCOPE_CODE) RETURN VARCHAR2 */
export async function isCertified(enterpriseId, runId, scopeCode) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(
      `BEGIN
         :result := ${PKG}.IS_CERTIFIED(
           P_ENTERPRISE_ID => :p_enterprise_id,
           P_RUN_ID        => :p_run_id,
           P_SCOPE_CODE    => :p_scope_code
         );
       END;`,
      {
        result: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
        p_enterprise_id: numberBind(enterpriseId),
        p_run_id: numberBind(runId),
        p_scope_code: stringBind(scopeCode, 100)
      }
    );
    const flag = String(result.outBinds?.result ?? '').trim().toUpperCase();
    return { certified: flag === 'Y' };
  } catch (err) {
    const mapped = mapPayrollOracleError(err);
    return { certified: false, message: mapped.message };
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}
