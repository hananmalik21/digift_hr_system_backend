import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { textClobBind } from '../../../../utils/oracleClobBinds.js';
import {
  auditInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { resolvePayElementEntryControlsUserMessage } from '../utils/payElementEntryControlsOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENT_ENTRY_CONTROLS_PKG';
const CREATE_PROC = `${PKG}.CREATE_ENTRY_CONTROL`;
const UPDATE_PROC = `${PKG}.UPDATE_ENTRY_CONTROL`;
const DELETE_PROC = `${PKG}.DELETE_ENTRY_CONTROL`;

const LOG_TAG = 'payElementEntryControlsModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process element entry controls. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_PAYLOAD_JSON       => :payload_json,
    P_CREATED_BY         => :created_by,
    P_ENTRY_CONTROL_ID   => :entry_control_id,
    P_ENTRY_CONTROL_GUID => :entry_control_guid,
    P_STATUS             => :status,
    P_MESSAGE            => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_ENTRY_CONTROL_GUID => :entry_control_guid,
    P_PAYLOAD_JSON       => :payload_json,
    P_UPDATED_BY         => :updated_by,
    P_STATUS             => :status,
    P_MESSAGE            => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_ENTRY_CONTROL_GUID => :entry_control_guid,
    P_DELETED_BY         => :deleted_by,
    P_STATUS             => :status,
    P_MESSAGE            => :message
  );
END;`;

function statusOutBinds() {
  return {
    status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
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
  const guid = normalizeOutString(ob.entry_control_guid);
  return {
    entry_control_id: normalizeOutNumber(ob.entry_control_id),
    entry_control_guid: guid ? normalizeOutGuidHex(guid) : null,
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
    throw new DatabaseError(
      GENERIC_ERROR_MESSAGE,
      err,
      resolvePayElementEntryControlsUserMessage(null, err)
    );
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
export async function createEntryControlViaPackage(payload, createdBy) {
  const binds = {
    payload_json: payloadJsonInBind(payload),
    created_by: auditInBind(createdBy),
    entry_control_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    entry_control_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
    ...statusOutBinds()
  };

  return executePackageMutation(CREATE_PLSQL, binds, parseCreateOut);
}

/**
 * @param {string} entryControlGuidHex
 * @param {Record<string, unknown>} payload
 * @param {string} updatedBy
 */
export async function updateEntryControlViaPackage(entryControlGuidHex, payload, updatedBy) {
  const binds = {
    entry_control_guid: guidHexInBind(entryControlGuidHex),
    payload_json: payloadJsonInBind(payload),
    updated_by: auditInBind(updatedBy),
    ...statusOutBinds()
  };

  return executePackageMutation(UPDATE_PLSQL, binds, parseActionOut);
}

/**
 * @param {string} entryControlGuidHex
 * @param {string} deletedBy
 */
export async function deleteEntryControlViaPackage(entryControlGuidHex, deletedBy) {
  const binds = {
    entry_control_guid: guidHexInBind(entryControlGuidHex),
    deleted_by: auditInBind(deletedBy),
    ...statusOutBinds()
  };

  return executePackageMutation(DELETE_PLSQL, binds, parseActionOut);
}
