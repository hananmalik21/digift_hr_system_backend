/**
 * Statutory processing — PAY.PAY_STATUTORY_PROCESSING_PKG + regimes/rules master data (table DML).
 *
 * Views: V_PAY_STATUTORY_RUN_RESULTS, V_PAY_STATUTORY_FILINGS, V_PAY_STATUTORY_CERTIFICATES,
 *        V_PAY_STATUTORY_AMENDMENTS, V_PAY_STATUTORY_AUDIT
 * Tables (no package): PAY_STATUTORY_REGIMES, PAY_STATUTORY_RULES
 */

import oracledb from 'oracledb';
import { executePayDml, executePayrollPackage, numberBind, queryPayList, queryPayOne, stringBind, ynBind } from '../shared/index.js';

const PKG = 'PAY.PAY_STATUTORY_PROCESSING_PKG';
const RUN_RESULTS_VIEW = 'PAY.V_PAY_STATUTORY_RUN_RESULTS';
const FILINGS_VIEW = 'PAY.V_PAY_STATUTORY_FILINGS';
const CERTIFICATES_VIEW = 'PAY.V_PAY_STATUTORY_CERTIFICATES';
const AMENDMENTS_VIEW = 'PAY.V_PAY_STATUTORY_AMENDMENTS';
const AUDIT_VIEW = 'PAY.V_PAY_STATUTORY_AUDIT';
const REGIMES_TABLE = 'PAY.PAY_STATUTORY_REGIMES';
const RULES_TABLE = 'PAY.PAY_STATUTORY_RULES';

function outNum(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
}
function outStr(name, maxSize = 4000) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize } };
}

// --- Regimes (table DML) -----------------------------------------------------------------

export async function listRegimes(filters) {
  return queryPayList({
    fromSql: `${REGIMES_TABLE} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'UPPER(v.JURISDICTION_CODE) = UPPER(:jurisdiction_code)', bind: 'jurisdiction_code', value: filters.jurisdictionCode },
      { sql: 'v.TAX_YEAR = :tax_year', bind: 'tax_year', value: filters.taxYear },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.REGIME_CODE', 'v.REGIME_NAME'], value: filters.search },
    defaultSort: 'v.REGIME_NAME ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryRegimes'
  });
}

export async function getRegimeByGuid(guid) {
  return queryPayOne({
    fromSql: `${REGIMES_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(RAWTOHEX(v.STATUTORY_REGIME_GUID)) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollStatutoryRegimes'
  });
}

export async function createRegime(body, createdBy) {
  return executePayDml(
    `INSERT INTO ${REGIMES_TABLE} (
       ENTERPRISE_ID, JURISDICTION_CODE, REGIME_CODE, REGIME_NAME, TAX_YEAR, CURRENCY_CODE,
       STATUS_CODE, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :enterprise_id, :jurisdiction_code, :regime_code, :regime_name, :tax_year, :currency_code,
       NVL(:status_code, 'ACTIVE'), :effective_start_date, :effective_end_date, :created_by, :created_by
     )
     RETURNING STATUTORY_REGIME_ID, RAWTOHEX(STATUTORY_REGIME_GUID) INTO :id, :guid`,
    {
      enterprise_id: numberBind(body.enterprise_id),
      jurisdiction_code: stringBind(body.jurisdiction_code, 100),
      regime_code: stringBind(body.regime_code, 100),
      regime_name: stringBind(body.regime_name, 300),
      tax_year: numberBind(body.tax_year),
      currency_code: stringBind(body.currency_code, 10),
      status_code: stringBind(body.status_code, 30),
      effective_start_date: body.effective_start_date ? new Date(body.effective_start_date) : new Date(),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    {
      genericError: 'Unable to create statutory regime. Please try again.',
      mapOut: (out) => ({
        statutory_regime_id: out.id?.[0] ?? null,
        statutory_regime_guid: (out.guid?.[0] ?? '').toLowerCase() || null
      })
    }
  );
}

export async function updateRegime(guid, body, updatedBy) {
  return executePayDml(
    `UPDATE ${REGIMES_TABLE}
        SET REGIME_NAME        = NVL(:regime_name, REGIME_NAME),
            CURRENCY_CODE      = NVL(:currency_code, CURRENCY_CODE),
            STATUS_CODE        = NVL(:status_code, STATUS_CODE),
            EFFECTIVE_END_DATE = NVL(:effective_end_date, EFFECTIVE_END_DATE),
            LAST_UPDATED_BY    = :updated_by,
            LAST_UPDATE_DATE   = SYSDATE
      WHERE RAWTOHEX(STATUTORY_REGIME_GUID) = UPPER(:guid)
     RETURNING STATUTORY_REGIME_ID INTO :id`,
    {
      regime_name: stringBind(body.regime_name, 300),
      currency_code: stringBind(body.currency_code, 10),
      status_code: stringBind(body.status_code, 30),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update statutory regime. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

// --- Rules (table DML) --------------------------------------------------------------------

export async function listRules(filters) {
  return queryPayList({
    fromSql: `${RULES_TABLE} v`,
    alias: 'v',
    filters: [
      { sql: 'v.STATUTORY_REGIME_ID = :statutory_regime_id', bind: 'statutory_regime_id', value: filters.statutoryRegimeId },
      { sql: 'v.RULE_CLASS_CODE = :rule_class_code', bind: 'rule_class_code', value: filters.ruleClassCode },
      { sql: 'v.ACTIVE_FLAG = :active_flag', bind: 'active_flag', value: filters.activeFlag }
    ],
    search: { columns: ['v.RULE_CODE', 'v.RULE_NAME', 'v.SOURCE_ELEMENT_CODE'], value: filters.search },
    defaultSort: 'v.REPORTING_SEQUENCE ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryRules'
  });
}

export async function getRuleByGuid(guid) {
  return queryPayOne({
    fromSql: `${RULES_TABLE} v`,
    alias: 'v',
    filters: [{ sql: 'UPPER(RAWTOHEX(v.STATUTORY_RULE_GUID)) = UPPER(:guid)', bind: 'guid', value: guid }],
    logTag: 'payrollStatutoryRules'
  });
}

export async function createRule(body, createdBy) {
  return executePayDml(
    `INSERT INTO ${RULES_TABLE} (
       STATUTORY_REGIME_ID, RULE_CODE, RULE_NAME, RULE_CLASS_CODE, SOURCE_ELEMENT_CODE,
       AMOUNT_SIGN_CODE, REPORTING_SEQUENCE, ACTIVE_FLAG, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE,
       CREATED_BY, LAST_UPDATED_BY
     ) VALUES (
       :statutory_regime_id, :rule_code, :rule_name, :rule_class_code, :source_element_code,
       NVL(:amount_sign_code, 'ABS'), :reporting_sequence, :active_flag, :effective_start_date,
       :effective_end_date, :created_by, :created_by
     )
     RETURNING STATUTORY_RULE_ID, RAWTOHEX(STATUTORY_RULE_GUID) INTO :id, :guid`,
    {
      statutory_regime_id: numberBind(body.statutory_regime_id),
      rule_code: stringBind(body.rule_code, 100),
      rule_name: stringBind(body.rule_name, 300),
      rule_class_code: stringBind(body.rule_class_code, 50),
      source_element_code: stringBind(body.source_element_code, 100),
      amount_sign_code: stringBind(body.amount_sign_code, 30),
      reporting_sequence: numberBind(body.reporting_sequence ?? 1),
      active_flag: ynBind(body.active_flag, 'Y'),
      effective_start_date: body.effective_start_date ? new Date(body.effective_start_date) : new Date(),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      created_by: stringBind(createdBy, 100),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    {
      genericError: 'Unable to create statutory rule. Please try again.',
      mapOut: (out) => ({
        statutory_rule_id: out.id?.[0] ?? null,
        statutory_rule_guid: (out.guid?.[0] ?? '').toLowerCase() || null
      })
    }
  );
}

export async function updateRule(guid, body, updatedBy) {
  return executePayDml(
    `UPDATE ${RULES_TABLE}
        SET RULE_NAME          = NVL(:rule_name, RULE_NAME),
            AMOUNT_SIGN_CODE   = NVL(:amount_sign_code, AMOUNT_SIGN_CODE),
            REPORTING_SEQUENCE = NVL(:reporting_sequence, REPORTING_SEQUENCE),
            ACTIVE_FLAG        = NVL(:active_flag, ACTIVE_FLAG),
            EFFECTIVE_END_DATE = NVL(:effective_end_date, EFFECTIVE_END_DATE),
            LAST_UPDATED_BY    = :updated_by,
            LAST_UPDATE_DATE   = SYSDATE
      WHERE RAWTOHEX(STATUTORY_RULE_GUID) = UPPER(:guid)
     RETURNING STATUTORY_RULE_ID INTO :id`,
    {
      rule_name: stringBind(body.rule_name, 300),
      amount_sign_code: stringBind(body.amount_sign_code, 30),
      reporting_sequence: numberBind(body.reporting_sequence),
      active_flag: body.active_flag != null ? ynBind(body.active_flag) : stringBind(null, 1),
      effective_end_date: body.effective_end_date ? new Date(body.effective_end_date) : null,
      updated_by: stringBind(updatedBy, 100),
      guid: stringBind(guid, 32),
      id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to update statutory rule. Please try again.',
      mapOut: (out) => ({ updated: (out.id || []).length > 0 })
    }
  );
}

// --- Run processing / results ---------------------------------------------------------------

export async function listRunResults(filters) {
  return queryPayList({
    fromSql: `${RUN_RESULTS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.runId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.STATUTORY_REGIME_ID = :statutory_regime_id', bind: 'statutory_regime_id', value: filters.statutoryRegimeId },
      { sql: 'v.TAX_YEAR = :tax_year', bind: 'tax_year', value: filters.taxYear },
      { sql: 'v.RULE_CLASS_CODE = :rule_class_code', bind: 'rule_class_code', value: filters.ruleClassCode },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryResults'
  });
}

export async function getRunResultById(statutoryResultId) {
  return queryPayOne({
    fromSql: `${RUN_RESULTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.STATUTORY_RESULT_ID = :id', bind: 'id', value: statutoryResultId }],
    logTag: 'payrollStatutoryResults'
  });
}

/**
 * PROCESS_RUN(P_ENTERPRISE_ID, P_RUN_ID, P_REGIME_CODE, P_PROCESSED_BY,
 *   OUT P_STATUTORY_REGIME_ID, P_EMPLOYEE_COUNT, P_RESULT_COUNT, P_TAXABLE_WAGES, P_WITHHOLDING,
 *       P_EMPLOYEE_CONTRIB, P_EMPLOYER_CONTRIB, P_SUCCESS, P_MESSAGE)
 */
export async function processRun(enterpriseId, runId, regimeCode, processedBy) {
  const plsql = `
BEGIN
  ${PKG}.PROCESS_RUN(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_RUN_ID            => :p_run_id,
    P_REGIME_CODE       => :p_regime_code,
    P_PROCESSED_BY      => :p_processed_by,
    P_STATUTORY_REGIME_ID => :p_statutory_regime_id,
    P_EMPLOYEE_COUNT    => :p_employee_count,
    P_RESULT_COUNT      => :p_result_count,
    P_TAXABLE_WAGES     => :p_taxable_wages,
    P_WITHHOLDING       => :p_withholding,
    P_EMPLOYEE_CONTRIB  => :p_employee_contrib,
    P_EMPLOYER_CONTRIB  => :p_employer_contrib,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_run_id: numberBind(runId),
      p_regime_code: stringBind(regimeCode, 100),
      p_processed_by: stringBind(processedBy, 100),
      ...outNum('p_statutory_regime_id'),
      ...outNum('p_employee_count'),
      ...outNum('p_result_count'),
      ...outNum('p_taxable_wages'),
      ...outNum('p_withholding'),
      ...outNum('p_employee_contrib'),
      ...outNum('p_employer_contrib'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to process statutory run. Please try again.',
      mapOut: (out, helpers) => ({
        statutory_regime_id: helpers.num('p_statutory_regime_id'),
        employee_count: helpers.num('p_employee_count'),
        result_count: helpers.num('p_result_count'),
        taxable_wages: helpers.num('p_taxable_wages'),
        withholding: helpers.num('p_withholding'),
        employee_contrib: helpers.num('p_employee_contrib'),
        employer_contrib: helpers.num('p_employer_contrib')
      })
    }
  );
}

// --- Filings ----------------------------------------------------------------------------

export async function listFilings(filters) {
  return queryPayList({
    fromSql: `${FILINGS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.runId },
      { sql: 'v.STATUTORY_REGIME_ID = :statutory_regime_id', bind: 'statutory_regime_id', value: filters.statutoryRegimeId },
      { sql: 'v.TAX_YEAR = :tax_year', bind: 'tax_year', value: filters.taxYear },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.FILING_NUMBER', 'v.FILING_PERIOD_CODE'], value: filters.search },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryFilings'
  });
}

export async function getFilingById(filingId) {
  return queryPayOne({
    fromSql: `${FILINGS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.STATUTORY_FILING_ID = :id', bind: 'id', value: filingId }],
    logTag: 'payrollStatutoryFilings'
  });
}

/**
 * CREATE_FILING(P_ENTERPRISE_ID, P_RUN_ID, P_REGIME_CODE, P_CREATED_BY,
 *   OUT P_STATUTORY_FILING_ID, P_FILING_NUMBER, P_SUCCESS, P_MESSAGE)
 */
export async function createFiling(enterpriseId, runId, regimeCode, createdBy) {
  const plsql = `
BEGIN
  ${PKG}.CREATE_FILING(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_RUN_ID              => :p_run_id,
    P_REGIME_CODE         => :p_regime_code,
    P_CREATED_BY          => :p_created_by,
    P_STATUTORY_FILING_ID => :p_statutory_filing_id,
    P_FILING_NUMBER       => :p_filing_number,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_run_id: numberBind(runId),
      p_regime_code: stringBind(regimeCode, 100),
      p_created_by: stringBind(createdBy, 100),
      ...outNum('p_statutory_filing_id'),
      ...outStr('p_filing_number', 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to create statutory filing. Please try again.',
      mapOut: (out, helpers) => ({
        statutory_filing_id: helpers.num('p_statutory_filing_id'),
        filing_number: helpers.str('p_filing_number')
      })
    }
  );
}

/** VALIDATE_FILING(P_ENTERPRISE_ID, P_STATUTORY_FILING_ID, P_VALIDATED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function validateFiling(enterpriseId, filingId, validatedBy) {
  const plsql = `
BEGIN
  ${PKG}.VALIDATE_FILING(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_STATUTORY_FILING_ID => :p_statutory_filing_id,
    P_VALIDATED_BY        => :p_validated_by,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_statutory_filing_id: numberBind(filingId),
      p_validated_by: stringBind(validatedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to validate statutory filing. Please try again.' }
  );
}

/** FILE_FILING(P_ENTERPRISE_ID, P_STATUTORY_FILING_ID, P_FILING_REFERENCE, P_FILED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function fileFiling(enterpriseId, filingId, filingReference, filedBy) {
  const plsql = `
BEGIN
  ${PKG}.FILE_FILING(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_STATUTORY_FILING_ID => :p_statutory_filing_id,
    P_FILING_REFERENCE    => :p_filing_reference,
    P_FILED_BY            => :p_filed_by,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_statutory_filing_id: numberBind(filingId),
      p_filing_reference: stringBind(filingReference, 200),
      p_filed_by: stringBind(filedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to file statutory filing. Please try again.' }
  );
}

/** ACCEPT_FILING(P_ENTERPRISE_ID, P_STATUTORY_FILING_ID, P_ACCEPTANCE_REFERENCE, P_ACCEPTED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function acceptFiling(enterpriseId, filingId, acceptanceReference, acceptedBy) {
  const plsql = `
BEGIN
  ${PKG}.ACCEPT_FILING(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_STATUTORY_FILING_ID  => :p_statutory_filing_id,
    P_ACCEPTANCE_REFERENCE => :p_acceptance_reference,
    P_ACCEPTED_BY          => :p_accepted_by,
    P_SUCCESS              => :p_success,
    P_MESSAGE              => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_statutory_filing_id: numberBind(filingId),
      p_acceptance_reference: stringBind(acceptanceReference, 200),
      p_accepted_by: stringBind(acceptedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to record statutory filing acceptance. Please try again.' }
  );
}

// --- Certificates -------------------------------------------------------------------------

export async function listCertificates(filters) {
  return queryPayList({
    fromSql: `${CERTIFICATES_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.STATUTORY_REGIME_ID = :statutory_regime_id', bind: 'statutory_regime_id', value: filters.statutoryRegimeId },
      { sql: 'v.TAX_YEAR = :tax_year', bind: 'tax_year', value: filters.taxYear },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.CERTIFICATE_NUMBER'], value: filters.search },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryCertificates'
  });
}

export async function getCertificateById(certificateId) {
  return queryPayOne({
    fromSql: `${CERTIFICATES_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.STATUTORY_CERTIFICATE_ID = :id', bind: 'id', value: certificateId }],
    logTag: 'payrollStatutoryCertificates'
  });
}

/**
 * GENERATE_YEAR_END_CERT(P_ENTERPRISE_ID, P_REGIME_CODE, P_TAX_YEAR, P_EMPLOYEE_ID, P_GENERATED_BY,
 *   OUT P_CERTIFICATE_ID, P_CERTIFICATE_NUMBER, P_TAXABLE_WAGES, P_WITHHOLDING, P_EMPLOYEE_CONTRIB,
 *       P_EMPLOYER_CONTRIB, P_SUCCESS, P_MESSAGE)
 */
export async function generateYearEndCertificate(body, generatedBy) {
  const plsql = `
BEGIN
  ${PKG}.GENERATE_YEAR_END_CERT(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_REGIME_CODE       => :p_regime_code,
    P_TAX_YEAR          => :p_tax_year,
    P_EMPLOYEE_ID       => :p_employee_id,
    P_GENERATED_BY      => :p_generated_by,
    P_CERTIFICATE_ID    => :p_certificate_id,
    P_CERTIFICATE_NUMBER=> :p_certificate_number,
    P_TAXABLE_WAGES     => :p_taxable_wages,
    P_WITHHOLDING       => :p_withholding,
    P_EMPLOYEE_CONTRIB  => :p_employee_contrib,
    P_EMPLOYER_CONTRIB  => :p_employer_contrib,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_regime_code: stringBind(body.regime_code, 100),
      p_tax_year: numberBind(body.tax_year),
      p_employee_id: numberBind(body.employee_id),
      p_generated_by: stringBind(generatedBy, 100),
      ...outNum('p_certificate_id'),
      ...outStr('p_certificate_number', 100),
      ...outNum('p_taxable_wages'),
      ...outNum('p_withholding'),
      ...outNum('p_employee_contrib'),
      ...outNum('p_employer_contrib'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to generate year-end certificate. Please try again.',
      mapOut: (out, helpers) => ({
        certificate_id: helpers.num('p_certificate_id'),
        certificate_number: helpers.str('p_certificate_number'),
        taxable_wages: helpers.num('p_taxable_wages'),
        withholding: helpers.num('p_withholding'),
        employee_contrib: helpers.num('p_employee_contrib'),
        employer_contrib: helpers.num('p_employer_contrib')
      })
    }
  );
}

/** PUBLISH_CERTIFICATE(P_ENTERPRISE_ID, P_CERTIFICATE_ID, P_PUBLISHED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function publishCertificate(enterpriseId, certificateId, publishedBy) {
  const plsql = `
BEGIN
  ${PKG}.PUBLISH_CERTIFICATE(
    P_ENTERPRISE_ID  => :p_enterprise_id,
    P_CERTIFICATE_ID => :p_certificate_id,
    P_PUBLISHED_BY   => :p_published_by,
    P_SUCCESS        => :p_success,
    P_MESSAGE        => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_certificate_id: numberBind(certificateId),
      p_published_by: stringBind(publishedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to publish year-end certificate. Please try again.' }
  );
}

// --- Amendments ---------------------------------------------------------------------------

export async function listAmendments(filters) {
  return queryPayList({
    fromSql: `${AMENDMENTS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.runId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.STATUTORY_RESULT_ID = :statutory_result_id', bind: 'statutory_result_id', value: filters.statutoryResultId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.AMENDMENT_NUMBER', 'v.SOURCE_ELEMENT_CODE'], value: filters.search },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryAmendments'
  });
}

export async function getAmendmentById(amendmentId) {
  return queryPayOne({
    fromSql: `${AMENDMENTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.STATUTORY_AMENDMENT_ID = :id', bind: 'id', value: amendmentId }],
    logTag: 'payrollStatutoryAmendments'
  });
}

/**
 * CREATE_AMENDMENT(P_ENTERPRISE_ID, P_STATUTORY_RESULT_ID, P_ADJUSTMENT_AMOUNT, P_REASON, P_CREATED_BY,
 *   OUT P_AMENDMENT_ID, P_SUCCESS, P_MESSAGE)
 */
export async function createAmendment(body, createdBy) {
  const plsql = `
BEGIN
  ${PKG}.CREATE_AMENDMENT(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_STATUTORY_RESULT_ID  => :p_statutory_result_id,
    P_ADJUSTMENT_AMOUNT    => :p_adjustment_amount,
    P_REASON               => :p_reason,
    P_CREATED_BY           => :p_created_by,
    P_AMENDMENT_ID         => :p_amendment_id,
    P_SUCCESS              => :p_success,
    P_MESSAGE              => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_statutory_result_id: numberBind(body.statutory_result_id),
      p_adjustment_amount: numberBind(body.adjustment_amount),
      p_reason: stringBind(body.reason, 4000),
      p_created_by: stringBind(createdBy, 100),
      ...outNum('p_amendment_id'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to create statutory amendment. Please try again.',
      mapOut: (out, helpers) => ({ amendment_id: helpers.num('p_amendment_id') })
    }
  );
}

/** APPROVE_AMENDMENT(P_ENTERPRISE_ID, P_AMENDMENT_ID, P_APPROVED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function approveAmendment(enterpriseId, amendmentId, approvedBy) {
  const plsql = `
BEGIN
  ${PKG}.APPROVE_AMENDMENT(
    P_ENTERPRISE_ID => :p_enterprise_id,
    P_AMENDMENT_ID  => :p_amendment_id,
    P_APPROVED_BY   => :p_approved_by,
    P_SUCCESS       => :p_success,
    P_MESSAGE       => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_amendment_id: numberBind(amendmentId),
      p_approved_by: stringBind(approvedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to approve statutory amendment. Please try again.' }
  );
}

/** REVERSE_AMENDMENT(P_ENTERPRISE_ID, P_AMENDMENT_ID, P_REVERSAL_REASON, P_REVERSED_BY, OUT P_SUCCESS, P_MESSAGE) */
export async function reverseAmendment(enterpriseId, amendmentId, reversalReason, reversedBy) {
  const plsql = `
BEGIN
  ${PKG}.REVERSE_AMENDMENT(
    P_ENTERPRISE_ID    => :p_enterprise_id,
    P_AMENDMENT_ID     => :p_amendment_id,
    P_REVERSAL_REASON  => :p_reversal_reason,
    P_REVERSED_BY      => :p_reversed_by,
    P_SUCCESS          => :p_success,
    P_MESSAGE          => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_amendment_id: numberBind(amendmentId),
      p_reversal_reason: stringBind(reversalReason, 4000),
      p_reversed_by: stringBind(reversedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to reverse statutory amendment. Please try again.' }
  );
}

// --- Audit ----------------------------------------------------------------------------------

export async function listAudit(filters) {
  return queryPayList({
    fromSql: `${AUDIT_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.OBJECT_TYPE_CODE = :object_type_code', bind: 'object_type_code', value: filters.objectTypeCode },
      { sql: 'v.OBJECT_ID = :object_id', bind: 'object_id', value: filters.objectId },
      { sql: 'v.ACTION_CODE = :action_code', bind: 'action_code', value: filters.actionCode }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollStatutoryAudit'
  });
}
