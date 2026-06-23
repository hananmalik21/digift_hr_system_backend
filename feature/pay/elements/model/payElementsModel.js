import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  clobInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  numberInBind,
  outGuidHexBind,
  outNumberBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { resolvePayElementsUserMessage } from '../utils/payElementsOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENTS_PKG';
const CREATE_PROC = `${PKG}.CREATE_ELEMENT`;
const UPDATE_PROC = `${PKG}.UPDATE_ELEMENT`;
const DELETE_PROC = `${PKG}.DELETE_ELEMENT`;

const LOG_TAG = 'payElementsModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process pay element. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID              => :enterprise_id,
    P_ELEMENT_CODE               => :element_code,
    P_ELEMENT_NAME               => :element_name,
    P_DESCRIPTION                => :description,
    P_CATEGORY_CODE              => :category_code,
    P_CLASSIFICATION_CODE        => :classification_code,
    P_SECONDARY_CLASSIFICATION   => :secondary_classification,
    P_LEGISLATIVE_DATA_GROUP     => :legislative_data_group,
    P_EFFECTIVE_START_DATE       => :effective_start_date,
    P_EFFECTIVE_END_DATE         => :effective_end_date,
    P_RECURRING_FLAG             => :recurring_flag,
    P_COSTABLE_FLAG              => :costable_flag,
    P_TAXABLE_FLAG               => :taxable_flag,
    P_PENSIONABLE_FLAG           => :pensionable_flag,
    P_RETRO_ENABLED_FLAG         => :retro_enabled_flag,
    P_PRORATION_ENABLED_FLAG     => :proration_enabled_flag,
    P_PRIORITY                   => :priority,
    P_PROCESSING_FREQUENCY       => :processing_frequency,
    P_COSTING_JSON               => :costing_json,
    P_CREATED_BY                 => :created_by,
    P_ELEMENT_ID                 => :element_id,
    P_ELEMENT_GUID               => :element_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_ELEMENT_GUID               => :element_guid,
    P_ENTERPRISE_ID              => :enterprise_id,
    P_ELEMENT_CODE               => :element_code,
    P_ELEMENT_NAME               => :element_name,
    P_DESCRIPTION                => :description,
    P_CATEGORY_CODE              => :category_code,
    P_CLASSIFICATION_CODE        => :classification_code,
    P_SECONDARY_CLASSIFICATION   => :secondary_classification,
    P_LEGISLATIVE_DATA_GROUP     => :legislative_data_group,
    P_EFFECTIVE_START_DATE         => :effective_start_date,
    P_EFFECTIVE_END_DATE           => :effective_end_date,
    P_RECURRING_FLAG               => :recurring_flag,
    P_COSTABLE_FLAG                => :costable_flag,
    P_TAXABLE_FLAG                 => :taxable_flag,
    P_PENSIONABLE_FLAG             => :pensionable_flag,
    P_RETRO_ENABLED_FLAG           => :retro_enabled_flag,
    P_PRORATION_ENABLED_FLAG       => :proration_enabled_flag,
    P_PRIORITY                     => :priority,
    P_PROCESSING_FREQUENCY         => :processing_frequency,
    P_COSTING_JSON                 => :costing_json,
    P_LAST_UPDATED_BY              => :last_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_ELEMENT_GUID => :element_guid
  );
END;`;

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

/**
 * @param {Array<{ segment_id: number, segment_value_id: number }>|null|undefined} costingValues
 */
function costingJsonBind(costingValues) {
  if (costingValues == null) return clobInBind(null);
  if (!Array.isArray(costingValues)) return clobInBind(null);
  const payload = costingValues.map((item) => ({
    segment_id: Number(item.segment_id),
    segment_value_id: Number(item.segment_value_id)
  }));
  return clobInBind(JSON.stringify(payload));
}

function buildElementBinds(payload) {
  return {
    enterprise_id: numberInBind(payload.enterprise_id),
    element_code: codeInBind(payload.element_code, 100),
    element_name: varcharInBind(payload.element_name, 200),
    description: varcharInBind(payload.description, 4000),
    category_code: codeInBind(payload.category_code, 50),
    classification_code: codeInBind(payload.classification_code, 50),
    secondary_classification: codeInBind(payload.secondary_classification, 50),
    legislative_data_group: codeInBind(payload.legislative_data_group, 50),
    effective_start_date: dateInBind(payload.effective_start_date),
    effective_end_date: dateInBind(payload.effective_end_date),
    recurring_flag: ynInBind(payload.recurring_flag, 'N'),
    costable_flag: ynInBind(payload.costable_flag, 'N'),
    taxable_flag: ynInBind(payload.taxable_flag, 'N'),
    pensionable_flag: ynInBind(payload.pensionable_flag, 'N'),
    retro_enabled_flag: ynInBind(payload.retro_enabled_flag, 'N'),
    proration_enabled_flag: ynInBind(payload.proration_enabled_flag, 'N'),
    priority: numberInBind(payload.priority),
    processing_frequency: codeInBind(payload.processing_frequency, 30),
    costing_json: costingJsonBind(payload.costing_values)
  };
}

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(outBinds: Record<string, unknown>|undefined) => Record<string, unknown>} [parseOut]
 */
async function executePackageMutation(plsql, binds, parseOut) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    await connection.commit();
    return parseOut ? parseOut(result?.outBinds) : {};
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err);
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementsUserMessage(null, err));
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {string} createdBy
 */
export async function createElementViaPackage(payload, createdBy) {
  const binds = {
    ...buildElementBinds(payload),
    created_by: auditInBind(createdBy),
    element_id: outNumberBind(),
    element_guid: outGuidHexBind()
  };

  return executePackageMutation(CREATE_PLSQL, binds, (outBinds) => ({
    element_id: normalizeOutNumber(outBinds?.element_id),
    element_guid: normalizeOutGuidHex(outBinds?.element_guid)
  }));
}

/**
 * @param {string} elementGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateElementViaPackage(elementGuidHex, payload, updatedBy) {
  const binds = {
    element_guid: guidHexInBind(elementGuidHex),
    ...buildElementBinds(payload),
    last_updated_by: auditInBind(updatedBy)
  };

  await executePackageMutation(UPDATE_PLSQL, binds);
}

/**
 * @param {string} elementGuidHex
 */
export async function deleteElementViaPackage(elementGuidHex) {
  await executePackageMutation(DELETE_PLSQL, {
    element_guid: guidHexInBind(elementGuidHex)
  });
}
