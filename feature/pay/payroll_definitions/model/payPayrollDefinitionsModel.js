import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const PKG = 'PAY.PAY_PAYROLL_DEFINITIONS_PKG';
const VIEW = 'PAY.V_PAYROLL_DEFINITIONS';

const LOG_TAG = 'payPayrollDefinitionsModel';
export const GENERIC_ERROR_MESSAGE = 'Unable to process the payroll definition request.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const LIST_SELECT_COLUMNS = `
  v.PAYROLL_ID,
  v.PAYROLL_GUID,
  v.ENTERPRISE_ID,
  v.PAYROLL_NAME,
  v.PAYROLL_CODE,
  v.PAYROLL_DISPLAY,
  v.COUNTRY_CODE,
  v.COUNTRY,
  v.LEGAL_ENTITY_GUID,
  v.LEGAL_ENTITY_CODE,
  v.LEGAL_NAME,
  v.LEGAL_ENTITY_DISPLAY,
  v.BUSINESS_UNIT_GUID,
  v.BUSINESS_UNIT_NAME,
  v.BUSINESS_UNIT_DISPLAY,
  v.PAY_FREQUENCY_CODE,
  v.PAY_FREQUENCY_DISPLAY,
  v.PERIODS_PER_YEAR,
  v.CURRENCY_CODE,
  v.STATUS_CODE,
  v.STATUS,
  v.ACTIVE_FLAG,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

const CREATE_RESULT_SELECT_COLUMNS = `
  v.PAYROLL_ID,
  v.PAYROLL_GUID,
  v.ENTERPRISE_ID,
  v.PAYROLL_NAME,
  v.PAYROLL_CODE,
  v.PAYROLL_DISPLAY,
  v.STATUS_CODE,
  v.STATUS,
  v.ACTIVE_FLAG,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

const DETAIL_SELECT_COLUMNS = `
  v.PAYROLL_ID,
  v.PAYROLL_GUID,
  v.ENTERPRISE_ID,
  v.PAYROLL_NAME,
  v.PAYROLL_CODE,
  v.PAYROLL_DISPLAY,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.COUNTRY_CODE,
  v.COUNTRY,
  v.LEGAL_ENTITY_ID,
  v.LEGAL_ENTITY_GUID,
  v.LEGAL_ENTITY_CODE,
  v.LEGAL_NAME,
  v.LEGAL_ENTITY_DISPLAY,
  v.BUSINESS_UNIT_GUID,
  v.BUSINESS_UNIT_NAME,
  v.BUSINESS_UNIT_DISPLAY,
  v.PAY_FREQUENCY_CODE,
  v.PAY_FREQUENCY_DISPLAY,
  v.PERIODS_PER_YEAR,
  v.DEFAULT_PAYROLL_CALENDAR_ID,
  v.DEFAULT_PAYROLL_CALENDAR_GUID,
  v.DEFAULT_PAYROLL_CALENDAR_NAME,
  v.CURRENCY_CODE,
  v.PAYMENT_TIMING,
  v.TAX_REGIME_CODE,
  v.SOCIAL_SECURITY_SYSTEM_CODE,
  v.WORK_WEEK_CODE,
  v.LANGUAGE_LOCALE,
  v.PAYMENT_METHOD_CODE,
  v.COMPENSATION_SOURCE_CODE,
  v.TIME_INPUT_SOURCE_CODE,
  v.ABSENCE_INPUT_SOURCE_CODE,
  v.OFF_CYCLE_PAYMENT_FLAG,
  v.OFF_CYCLE_PAYMENT_DISPLAY,
  v.RETRO_PAY_PROCESSING_FLAG,
  v.RETRO_PAY_PROCESSING_DISPLAY,
  v.THIRD_PARTY_PAYMENT_FLAG,
  v.THIRD_PARTY_PAYMENT_DISPLAY,
  v.STATUS_CODE,
  v.STATUS,
  v.ACTIVE_FLAG,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

const DROPDOWN_SELECT_COLUMNS = `
  v.PAYROLL_ID,
  v.PAYROLL_GUID,
  v.PAYROLL_CODE,
  v.PAYROLL_NAME,
  v.PAYROLL_DISPLAY,
  v.COUNTRY_CODE,
  v.LEGAL_ENTITY_GUID,
  v.LEGAL_ENTITY_DISPLAY,
  v.BUSINESS_UNIT_GUID,
  v.BUSINESS_UNIT_DISPLAY,
  v.PAY_FREQUENCY_CODE,
  v.PAY_FREQUENCY_DISPLAY,
  v.CURRENCY_CODE
`.trim();

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_PAYROLL_DEFINITION(
    P_ENTERPRISE_ID                    => :p_enterprise_id,
    P_PAYROLL_NAME                     => :p_payroll_name,
    P_PAYROLL_CODE                     => :p_payroll_code,
    P_EFFECTIVE_START_DATE             => :p_effective_start_date,
    P_EFFECTIVE_END_DATE               => :p_effective_end_date,
    P_COUNTRY_CODE                     => :p_country_code,
    P_LEGAL_ENTITY_GUID                => :p_legal_entity_guid,
    P_BUSINESS_UNIT_GUID               => :p_business_unit_guid,
    P_PAY_FREQUENCY_CODE               => :p_pay_frequency_code,
    P_DEFAULT_PAYROLL_CALENDAR_GUID    => :p_default_payroll_calendar_guid,
    P_CURRENCY_CODE                    => :p_currency_code,
    P_PAYMENT_TIMING                   => :p_payment_timing,
    P_TAX_REGIME_CODE                  => :p_tax_regime_code,
    P_SOCIAL_SECURITY_SYSTEM_CODE      => :p_social_security_system_code,
    P_WORK_WEEK_CODE                   => :p_work_week_code,
    P_LANGUAGE_LOCALE                  => :p_language_locale,
    P_PAYMENT_METHOD_CODE              => :p_payment_method_code,
    P_COMPENSATION_SOURCE_CODE         => :p_compensation_source_code,
    P_TIME_INPUT_SOURCE_CODE           => :p_time_input_source_code,
    P_ABSENCE_INPUT_SOURCE_CODE        => :p_absence_input_source_code,
    P_OFF_CYCLE_PAYMENT_FLAG           => :p_off_cycle_payment_flag,
    P_RETRO_PAY_PROCESSING_FLAG        => :p_retro_pay_processing_flag,
    P_THIRD_PARTY_PAYMENT_FLAG         => :p_third_party_payment_flag,
    P_CREATED_BY                       => :p_created_by,
    X_PAYROLL_ID                       => :x_payroll_id,
    X_PAYROLL_GUID                     => :x_payroll_guid,
    X_SUCCESS                          => :x_success,
    X_MESSAGE                          => :x_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_PAYROLL_DEFINITION(
    P_ENTERPRISE_ID                    => :p_enterprise_id,
    P_PAYROLL_GUID                     => :p_payroll_guid,
    P_PAYROLL_NAME                     => :p_payroll_name,
    P_PAYROLL_CODE                     => :p_payroll_code,
    P_EFFECTIVE_START_DATE             => :p_effective_start_date,
    P_EFFECTIVE_END_DATE               => :p_effective_end_date,
    P_STATUS                           => :p_status,
    P_COUNTRY_CODE                     => :p_country_code,
    P_LEGAL_ENTITY_GUID                => :p_legal_entity_guid,
    P_BUSINESS_UNIT_GUID               => :p_business_unit_guid,
    P_PAY_FREQUENCY_CODE               => :p_pay_frequency_code,
    P_DEFAULT_PAYROLL_CALENDAR_GUID    => :p_default_payroll_calendar_guid,
    P_CURRENCY_CODE                    => :p_currency_code,
    P_PAYMENT_TIMING                   => :p_payment_timing,
    P_TAX_REGIME_CODE                  => :p_tax_regime_code,
    P_SOCIAL_SECURITY_SYSTEM_CODE      => :p_social_security_system_code,
    P_WORK_WEEK_CODE                   => :p_work_week_code,
    P_LANGUAGE_LOCALE                  => :p_language_locale,
    P_PAYMENT_METHOD_CODE              => :p_payment_method_code,
    P_COMPENSATION_SOURCE_CODE         => :p_compensation_source_code,
    P_TIME_INPUT_SOURCE_CODE           => :p_time_input_source_code,
    P_ABSENCE_INPUT_SOURCE_CODE        => :p_absence_input_source_code,
    P_OFF_CYCLE_PAYMENT_FLAG           => :p_off_cycle_payment_flag,
    P_RETRO_PAY_PROCESSING_FLAG        => :p_retro_pay_processing_flag,
    P_THIRD_PARTY_PAYMENT_FLAG         => :p_third_party_payment_flag,
    P_LAST_UPDATED_BY                  => :p_last_updated_by,
    X_SUCCESS                          => :x_success,
    X_MESSAGE                          => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_PAYROLL_DEFINITION(
    P_ENTERPRISE_ID => :p_enterprise_id,
    P_PAYROLL_GUID  => :p_payroll_guid,
    X_SUCCESS       => :x_success,
    X_MESSAGE       => :x_message
  );
END;`;

function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const s = String(value).trim().slice(0, 10);
  const d = new Date(`${s}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateInBind(value) {
  return {
    val: parseDate(value),
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

function normalizeGuidFromView(value) {
  return normalizeApiGuidString(value) ?? normalizeOutGuidHex(value);
}

/** View stores GUID text via LOWER(RAWTOHEX(...)); bind lowercase for exact match. */
function toViewGuidText(value) {
  const hex = normalizeGuidFromView(value) ?? normalizeOutString(value);
  return hex ? String(hex).replace(/-/g, '').toLowerCase() : null;
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

export function sanitizePackageMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  if (/ORA-|PL\/SQL|SQL statement|constraint|PAY\.|stack trace/i.test(msg)) {
    return GENERIC_ERROR_MESSAGE;
  }
  return msg;
}

const PACKAGE_MESSAGE_MAP = [
  {
    pattern: /already\s*exists|duplicate.*(name|code)/i,
    message: 'A payroll definition with this name or code already exists.'
  },
  {
    pattern: /payroll\s+definition.*(not\s*found|does\s*not\s*exist)/i,
    message: 'Payroll definition was not found.'
  },
  {
    pattern: /being\s*used|referenced|child\s*record|integrity/i,
    message: 'This payroll definition cannot be deleted because it is being used by another record.'
  }
];

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return GENERIC_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  // Prefer the package X_MESSAGE for business-rule failures (legal entity, calendar, etc.).
  return sanitizePackageMessage(msg);
}

function parsePackageOut(outBinds) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.x_success);
  const message = mapPackageBusinessMessage(normalizeOutString(ob.x_message));
  return { success, message, outBinds: ob };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(parsed: { success: boolean, message: string, outBinds: Record<string, unknown> }) => Record<string, unknown>} [shapeResult]
 */
async function executePackageMutation(plsql, binds, shapeResult = null) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parsePackageOut(result?.outBinds);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return shapeResult ? shapeResult(parsed) : parsed;
  } catch (err) {
    await rollbackQuietly(connection);
    logOracleError(err, 'executePackageMutation');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

function buildDefinitionBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_payroll_name: varcharInBind(payload.payroll_name, 200),
    p_payroll_code: codeInBind(payload.payroll_code, 50),
    p_effective_start_date: dateInBind(payload.effective_start_date),
    p_effective_end_date: dateInBind(payload.effective_end_date),
    p_country_code: codeInBind(payload.country_code, 10),
    p_legal_entity_guid: guidHexInBind(payload.legal_entity_guid),
    p_business_unit_guid: guidHexInBind(payload.business_unit_guid),
    p_pay_frequency_code: codeInBind(payload.pay_frequency_code, 30),
    p_default_payroll_calendar_guid: guidHexInBind(payload.default_payroll_calendar_guid),
    p_currency_code: codeInBind(payload.currency_code, 10),
    p_payment_timing: varcharInBind(payload.payment_timing, 250),
    p_tax_regime_code: varcharInBind(payload.tax_regime_code, 50),
    p_social_security_system_code: varcharInBind(payload.social_security_system_code, 50),
    p_work_week_code: varcharInBind(payload.work_week_code, 50),
    p_language_locale: varcharInBind(payload.language_locale, 30),
    p_payment_method_code: varcharInBind(payload.payment_method_code, 50),
    p_compensation_source_code: varcharInBind(payload.compensation_source_code, 50),
    p_time_input_source_code: varcharInBind(payload.time_input_source_code, 50),
    p_absence_input_source_code: varcharInBind(payload.absence_input_source_code, 50),
    p_off_cycle_payment_flag: ynInBind(payload.off_cycle_payment_flag, 'N'),
    p_retro_pay_processing_flag: ynInBind(payload.retro_pay_processing_flag, 'N'),
    p_third_party_payment_flag: ynInBind(payload.third_party_payment_flag, 'N')
  };
}

/**
 * Maps the post-create view row returned after CREATE_PAYROLL_DEFINITION.
 * Status fields come from PAY.V_PAYROLL_DEFINITIONS (package assigns ACTIVE).
 * @param {Record<string, unknown>} row
 */
export function mapCreatedPayrollDefinitionRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_guid: normalizeGuidFromView(g('PAYROLL_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    payroll_name: toStringOrNull(g('PAYROLL_NAME')),
    payroll_code: toStringOrNull(g('PAYROLL_CODE')),
    payroll_display: toStringOrNull(g('PAYROLL_DISPLAY')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status: toStringOrNull(g('STATUS')),
    active_flag: toStringOrNull(g('ACTIVE_FLAG')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollDefinitionListRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_guid: normalizeGuidFromView(g('PAYROLL_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    payroll_name: toStringOrNull(g('PAYROLL_NAME')),
    payroll_code: toStringOrNull(g('PAYROLL_CODE')),
    payroll_display: toStringOrNull(g('PAYROLL_DISPLAY')),
    country_code: toStringOrNull(g('COUNTRY_CODE')),
    country: toStringOrNull(g('COUNTRY')),
    legal_entity_guid: normalizeGuidFromView(g('LEGAL_ENTITY_GUID')),
    legal_entity_code: toStringOrNull(g('LEGAL_ENTITY_CODE')),
    legal_name: toStringOrNull(g('LEGAL_NAME')),
    legal_entity_display: toStringOrNull(g('LEGAL_ENTITY_DISPLAY')),
    business_unit_guid: normalizeGuidFromView(g('BUSINESS_UNIT_GUID')),
    business_unit_name: toStringOrNull(g('BUSINESS_UNIT_NAME')),
    business_unit_display: toStringOrNull(g('BUSINESS_UNIT_DISPLAY')),
    pay_frequency_code: toStringOrNull(g('PAY_FREQUENCY_CODE')),
    pay_frequency_display: toStringOrNull(g('PAY_FREQUENCY_DISPLAY')),
    periods_per_year: toNumberOrNull(g('PERIODS_PER_YEAR')),
    currency_code: toStringOrNull(g('CURRENCY_CODE')),
    status_code: toStringOrNull(g('STATUS_CODE')),
    status: toStringOrNull(g('STATUS')),
    active_flag: toStringOrNull(g('ACTIVE_FLAG')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollDefinitionDetailRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_guid: normalizeGuidFromView(g('PAYROLL_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    payroll_header: {
      payroll_name: toStringOrNull(g('PAYROLL_NAME')),
      payroll_code: toStringOrNull(g('PAYROLL_CODE')),
      payroll_display: toStringOrNull(g('PAYROLL_DISPLAY')),
      effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
      effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
      status_code: toStringOrNull(g('STATUS_CODE')),
      status: toStringOrNull(g('STATUS')),
      active_flag: toStringOrNull(g('ACTIVE_FLAG'))
    },
    organization_assignment: {
      country_code: toStringOrNull(g('COUNTRY_CODE')),
      country: toStringOrNull(g('COUNTRY')),
      legal_entity_guid: normalizeGuidFromView(g('LEGAL_ENTITY_GUID')),
      legal_entity_code: toStringOrNull(g('LEGAL_ENTITY_CODE')),
      legal_name: toStringOrNull(g('LEGAL_NAME')),
      legal_entity_display: toStringOrNull(g('LEGAL_ENTITY_DISPLAY')),
      business_unit_guid: normalizeGuidFromView(g('BUSINESS_UNIT_GUID')),
      business_unit_name: toStringOrNull(g('BUSINESS_UNIT_NAME')),
      business_unit_display: toStringOrNull(g('BUSINESS_UNIT_DISPLAY'))
    },
    processing_rules: {
      pay_frequency_code: toStringOrNull(g('PAY_FREQUENCY_CODE')),
      pay_frequency_display: toStringOrNull(g('PAY_FREQUENCY_DISPLAY')),
      periods_per_year: toNumberOrNull(g('PERIODS_PER_YEAR')),
      default_payroll_calendar_guid: normalizeGuidFromView(g('DEFAULT_PAYROLL_CALENDAR_GUID')),
      default_payroll_calendar_name: toStringOrNull(g('DEFAULT_PAYROLL_CALENDAR_NAME')),
      currency_code: toStringOrNull(g('CURRENCY_CODE')),
      payment_timing: toStringOrNull(g('PAYMENT_TIMING'))
    },
    compliance_settings: {
      tax_regime_code: toStringOrNull(g('TAX_REGIME_CODE')),
      social_security_system_code: toStringOrNull(g('SOCIAL_SECURITY_SYSTEM_CODE')),
      work_week_code: toStringOrNull(g('WORK_WEEK_CODE')),
      language_locale: toStringOrNull(g('LANGUAGE_LOCALE'))
    },
    payment_settings: {
      payment_method_code: toStringOrNull(g('PAYMENT_METHOD_CODE')),
      compensation_source_code: toStringOrNull(g('COMPENSATION_SOURCE_CODE')),
      time_input_source_code: toStringOrNull(g('TIME_INPUT_SOURCE_CODE')),
      absence_input_source_code: toStringOrNull(g('ABSENCE_INPUT_SOURCE_CODE'))
    },
    advanced_options: {
      off_cycle_payment_flag: toStringOrNull(g('OFF_CYCLE_PAYMENT_FLAG')),
      off_cycle_payment_display: toStringOrNull(g('OFF_CYCLE_PAYMENT_DISPLAY')),
      retro_pay_processing_flag: toStringOrNull(g('RETRO_PAY_PROCESSING_FLAG')),
      retro_pay_processing_display: toStringOrNull(g('RETRO_PAY_PROCESSING_DISPLAY')),
      third_party_payment_flag: toStringOrNull(g('THIRD_PARTY_PAYMENT_FLAG')),
      third_party_payment_display: toStringOrNull(g('THIRD_PARTY_PAYMENT_DISPLAY'))
    },
    audit: {
      created_by: toStringOrNull(g('CREATED_BY')),
      creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
      last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
      last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
    }
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayrollDefinitionDropdownRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_guid: normalizeGuidFromView(g('PAYROLL_GUID')),
    payroll_code: toStringOrNull(g('PAYROLL_CODE')),
    payroll_name: toStringOrNull(g('PAYROLL_NAME')),
    payroll_display: toStringOrNull(g('PAYROLL_DISPLAY')),
    country_code: toStringOrNull(g('COUNTRY_CODE')),
    legal_entity_guid: normalizeGuidFromView(g('LEGAL_ENTITY_GUID')),
    legal_entity_display: toStringOrNull(g('LEGAL_ENTITY_DISPLAY')),
    business_unit_guid: normalizeGuidFromView(g('BUSINESS_UNIT_GUID')),
    business_unit_display: toStringOrNull(g('BUSINESS_UNIT_DISPLAY')),
    pay_frequency_code: toStringOrNull(g('PAY_FREQUENCY_CODE')),
    pay_frequency_display: toStringOrNull(g('PAY_FREQUENCY_DISPLAY')),
    currency_code: toStringOrNull(g('CURRENCY_CODE'))
  };
}

/**
 * @param {object} filters
 * @param {{ activeOnly?: boolean }} [options]
 */
function buildWhereClause(filters, { activeOnly = false } = {}) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (activeOnly) {
    whereParts.push("v.STATUS_CODE = 'ACTIVE'");
    whereParts.push("v.ACTIVE_FLAG = 'Y'");
  }

  const equalityFilters = [
    ['country_code', 'v.COUNTRY_CODE = :country_code'],
    ['pay_frequency_code', 'v.PAY_FREQUENCY_CODE = :pay_frequency_code'],
    ['currency_code', 'v.CURRENCY_CODE = :currency_code'],
    ['status', 'v.STATUS_CODE = :status'],
    ['active_flag', 'v.ACTIVE_FLAG = :active_flag']
  ];

  for (const [key, clause] of equalityFilters) {
    if (filters[key] && !(activeOnly && (key === 'status' || key === 'active_flag'))) {
      whereParts.push(clause);
      binds[key] = filters[key];
    }
  }

  if (filters.legal_entity_guid) {
    whereParts.push('LOWER(v.LEGAL_ENTITY_GUID) = :legal_entity_guid');
    binds.legal_entity_guid = toViewGuidText(filters.legal_entity_guid);
  }

  if (filters.business_unit_guid) {
    whereParts.push('LOWER(v.BUSINESS_UNIT_GUID) = :business_unit_guid');
    binds.business_unit_guid = toViewGuidText(filters.business_unit_guid);
  }

  if (filters.search) {
    whereParts.push(`(
      UPPER(v.PAYROLL_NAME) LIKE :search
      OR UPPER(v.PAYROLL_CODE) LIKE :search
      OR UPPER(v.PAYROLL_DISPLAY) LIKE :search
      OR UPPER(v.COUNTRY_CODE) LIKE :search
      OR UPPER(v.LEGAL_ENTITY_CODE) LIKE :search
      OR UPPER(v.LEGAL_NAME) LIKE :search
      OR UPPER(v.LEGAL_ENTITY_DISPLAY) LIKE :search
      OR UPPER(v.BUSINESS_UNIT_NAME) LIKE :search
      OR UPPER(v.PAY_FREQUENCY_CODE) LIKE :search
      OR UPPER(v.PAY_FREQUENCY_DISPLAY) LIKE :search
      OR UPPER(v.CURRENCY_CODE) LIKE :search
      OR UPPER(v.STATUS) LIKE :search
    )`);
    binds.search = `%${String(filters.search).trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}

function buildListWhereClause(filters) {
  return buildWhereClause(filters);
}

function buildDropdownWhereClause(filters) {
  return buildWhereClause(filters, { activeOnly: true });
}

async function closeConnection(connection) {
  if (!connection) return;
  try {
    await connection.close();
  } catch (_) {}
}

async function rollbackQuietly(connection) {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (_) {}
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayrollDefinitionsFromView(filters) {
  const { whereSql, binds } = buildListWhereClause(filters);
  const offset = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${LIST_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.PAYROLL_NAME ASC
 OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`.trim();

  const filterBinds = { ...binds };
  const dataBinds = {
    ...filterBinds,
    offset,
    limit: filters.limit
  };

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, filterBinds, ROW_OBJECT),
      connection.execute(dataSql, dataBinds, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayrollDefinitionListRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayrollDefinitionsFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

/**
 * @param {object} filters
 * @returns {Promise<object>}
 */
export async function getPayrollDefinitionSummaryFromView(filters) {
  const { whereSql, binds } = buildListWhereClause(filters);

  const sql = `
SELECT
    COUNT(*) AS TOTAL_DEFINITIONS,
    SUM(
      CASE
        WHEN v.STATUS_CODE = 'ACTIVE'
         AND v.ACTIVE_FLAG = 'Y'
        THEN 1
        ELSE 0
      END
    ) AS ACTIVE_PAYROLLS,
    COUNT(DISTINCT v.COUNTRY_CODE) AS COUNTRIES_COVERED,
    COUNT(DISTINCT v.BUSINESS_UNIT_GUID) AS BUSINESS_UNITS_COVERED,
    COUNT(DISTINCT v.LEGAL_ENTITY_GUID) AS LEGAL_ENTITIES_COVERED,
    0 AS VALIDATION_ISSUES
  FROM ${VIEW} v
  ${whereSql}`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = rowKeysUpper(result.rows?.[0] || {});
    return {
      total_definitions: toNumberOrNull(row.TOTAL_DEFINITIONS) ?? 0,
      active_payrolls: toNumberOrNull(row.ACTIVE_PAYROLLS) ?? 0,
      countries_covered: toNumberOrNull(row.COUNTRIES_COVERED) ?? 0,
      business_units_covered: toNumberOrNull(row.BUSINESS_UNITS_COVERED) ?? 0,
      legal_entities_covered: toNumberOrNull(row.LEGAL_ENTITIES_COVERED) ?? 0,
      validation_issues: toNumberOrNull(row.VALIDATION_ISSUES) ?? 0
    };
  } catch (err) {
    logOracleError(err, 'getPayrollDefinitionSummaryFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

/**
 * @param {object} filters
 * @returns {Promise<object[]>}
 */
export async function listPayrollDefinitionDropdownFromView(filters) {
  const { whereSql, binds } = buildDropdownWhereClause(filters);
  const sql = `
SELECT ${DROPDOWN_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.PAYROLL_NAME ASC`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    return (result.rows || []).map(mapPayrollDefinitionDropdownRow);
  } catch (err) {
    logOracleError(err, 'listPayrollDefinitionDropdownFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

/**
 * @param {string} payrollGuid
 * @param {number} enterpriseId
 * @returns {Promise<object|null>}
 */
export async function getPayrollDefinitionFromViewByGuid(payrollGuid, enterpriseId) {
  const sql = `
SELECT ${DETAIL_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE LOWER(v.PAYROLL_GUID) = :payroll_guid
   AND v.ENTERPRISE_ID = :enterprise_id`.trim();

  const binds = {
    payroll_guid: toViewGuidText(payrollGuid),
    enterprise_id: enterpriseId
  };

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = result.rows?.[0];
    return row ? mapPayrollDefinitionDetailRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayrollDefinitionFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

/**
 * Creates a payroll definition via package, then reads the stored row from the view.
 * Package assigns STATUS = ACTIVE automatically (no P_STATUS on create).
 * @param {Record<string, unknown>} payload
 */
export async function createPayrollDefinitionViaPackage(payload) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(CREATE_PLSQL, {
      ...buildDefinitionBinds(payload),
      p_created_by: auditInBind(payload.created_by),
      x_payroll_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_payroll_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 100 },
      ...successOutBinds()
    });

    const outBinds = result?.outBinds || {};
    const packageSuccess = packageSuccessIsTrue(outBinds.x_success);
    const packageMessage =
      mapPackageBusinessMessage(normalizeOutString(outBinds.x_message)) ||
      'Unable to create the payroll definition.';

    if (!packageSuccess) {
      await connection.rollback();
      return { success: false, message: packageMessage };
    }

    const payrollGuid =
      normalizeGuidFromView(outBinds.x_payroll_guid) ??
      normalizeOutGuidHex(outBinds.x_payroll_guid) ??
      normalizeOutString(outBinds.x_payroll_guid);

    const createdResult = await connection.execute(
      `
SELECT ${CREATE_RESULT_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE LOWER(v.PAYROLL_GUID) = :payroll_guid
   AND v.ENTERPRISE_ID = :enterprise_id`.trim(),
      {
        payroll_guid: toViewGuidText(payrollGuid),
        enterprise_id: Number(payload.enterprise_id)
      },
      ROW_OBJECT
    );

    if (!createdResult.rows || createdResult.rows.length === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Payroll definition was created but could not be retrieved.'
      };
    }

    await connection.commit();

    return {
      success: true,
      message: packageMessage || 'Payroll definition created successfully.',
      data: mapCreatedPayrollDefinitionRow(createdResult.rows[0])
    };
  } catch (err) {
    await rollbackQuietly(connection);
    logOracleError(err, 'createPayrollDefinitionViaPackage');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  } finally {
    await closeConnection(connection);
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function updatePayrollDefinitionViaPackage(payload) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      ...buildDefinitionBinds(payload),
      p_payroll_guid: guidHexInBind(payload.payroll_guid),
      p_status: codeInBind(payload.status, 30),
      p_last_updated_by: auditInBind(payload.last_updated_by),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export async function deletePayrollDefinitionViaPackage(payload) {
  return executePackageMutation(
    DELETE_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      p_payroll_guid: guidHexInBind(payload.payroll_guid),
      ...successOutBinds()
    },
    ({ success, message }) => ({ success, message })
  );
}
