import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { textClobBind } from '../../../compensation/utils/oracleClobBinds.js';
import {
  normalizeOutNumber,
  normalizeOutString,
  packageStatusIsSuccess
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

export { packageStatusIsSuccess };

const PKG = 'PAY.PAY_ELEMENT_ENTRIES_PKG';
const CREATE_PROC = `${PKG}.CREATE_ELEMENT_ENTRY`;
const UPDATE_PROC = `${PKG}.UPDATE_ELEMENT_ENTRY`;
const DELETE_PROC = `${PKG}.DELETE_ELEMENT_ENTRY`;

const LOG_TAG = 'payElementEntriesModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process element entry. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_PAYLOAD_JSON        => :payload_json,
    P_CREATED_BY          => :created_by,
    P_ELEMENT_ENTRY_ID    => :element_entry_id,
    P_ELEMENT_ENTRY_GUID  => :element_entry_guid,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_ELEMENT_ENTRY_GUID  => :element_entry_guid,
    P_PAYLOAD_JSON        => :payload_json,
    P_UPDATED_BY          => :updated_by,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_ELEMENT_ENTRY_GUID  => :element_entry_guid,
    P_DELETED_BY          => :deleted_by,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

function statusOutBinds() {
  return {
    status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function auditInBind(value) {
  const s = value == null ? '' : String(value).trim();
  return {
    val: s || 'SYSTEM',
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 200
  };
}

function guidInBind(hex) {
  return {
    val: hex,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 32
  };
}

function payloadJsonInBind(payload) {
  return textClobBind(JSON.stringify(payload ?? {}));
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
function parseCreateOut(outBinds) {
  const ob = outBinds || {};
  return {
    element_entry_id: normalizeOutNumber(ob.element_entry_id),
    element_entry_guid: normalizeOutString(ob.element_entry_guid),
    status: normalizeOutString(ob.status),
    message: normalizeOutString(ob.message) ?? ''
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
function parseActionOut(outBinds) {
  const ob = outBinds || {};
  return {
    status: normalizeOutString(ob.status),
    message: normalizeOutString(ob.message) ?? ''
  };
}

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(outBinds: Record<string, unknown>|undefined) => Record<string, unknown>} parseOut
 */
async function executePackageMutation(plsql, binds, parseOut) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    await connection.commit();
    return parseOut(result?.outBinds);
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    logOracleError(err);
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err);
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
export async function createElementEntryViaPackage(payload, createdBy) {
  const binds = {
    payload_json: payloadJsonInBind(payload),
    created_by: auditInBind(createdBy),
    element_entry_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    element_entry_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
    ...statusOutBinds()
  };

  return executePackageMutation(CREATE_PLSQL, binds, parseCreateOut);
}

/**
 * @param {string} elementEntryGuid
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateElementEntryViaPackage(elementEntryGuid, payload, updatedBy) {
  const binds = {
    element_entry_guid: guidInBind(elementEntryGuid),
    payload_json: payloadJsonInBind(payload),
    updated_by: auditInBind(updatedBy),
    ...statusOutBinds()
  };

  return executePackageMutation(UPDATE_PLSQL, binds, parseActionOut);
}

/**
 * @param {string} elementEntryGuid
 * @param {string} deletedBy
 */
export async function deleteElementEntryViaPackage(elementEntryGuid, deletedBy) {
  const binds = {
    element_entry_guid: guidInBind(elementEntryGuid),
    deleted_by: auditInBind(deletedBy),
    ...statusOutBinds()
  };

  return executePackageMutation(DELETE_PLSQL, binds, parseActionOut);
}
