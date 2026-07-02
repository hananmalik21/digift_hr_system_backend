import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { textClobBind } from '../../../compensation/utils/oracleClobBinds.js';
import {
  auditInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { resolvePayElementFrequencyRulesUserMessage } from '../utils/payElementFrequencyRulesOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENT_FREQUENCY_RULES_PKG';
const CREATE_PROC = `${PKG}.CREATE_FREQUENCY_RULE`;
const UPDATE_PROC = `${PKG}.UPDATE_FREQUENCY_RULE`;
const DELETE_PROC = `${PKG}.DELETE_FREQUENCY_RULE`;

const LOG_TAG = 'payElementFrequencyRulesModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process element frequency rule. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_PAYLOAD_JSON        => :payload_json,
    P_CREATED_BY          => :created_by,
    P_FREQUENCY_RULE_ID   => :frequency_rule_id,
    P_FREQUENCY_RULE_GUID => :frequency_rule_guid,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_FREQUENCY_RULE_GUID => :frequency_rule_guid,
    P_PAYLOAD_JSON        => :payload_json,
    P_UPDATED_BY          => :updated_by,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_FREQUENCY_RULE_GUID => :frequency_rule_guid,
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

function payloadJsonInBind(payload) {
  return textClobBind(JSON.stringify(payload ?? {}));
}

function parseCreateOut(outBinds) {
  const ob = outBinds || {};
  const guid = normalizeOutString(ob.frequency_rule_guid);
  return {
    frequency_rule_id: normalizeOutNumber(ob.frequency_rule_id),
    frequency_rule_guid: guid ? normalizeOutGuidHex(guid) : null,
    status: normalizeOutString(ob.status),
    message: normalizeOutString(ob.message) ?? ''
  };
}

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
      resolvePayElementFrequencyRulesUserMessage(null, err)
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function createFrequencyRuleViaPackage(payload, createdBy) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      payload_json: payloadJsonInBind(payload),
      created_by: auditInBind(createdBy),
      frequency_rule_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      frequency_rule_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      ...statusOutBinds()
    },
    parseCreateOut
  );
}

export async function updateFrequencyRuleViaPackage(frequencyRuleGuidHex, payload, updatedBy) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      frequency_rule_guid: guidHexInBind(frequencyRuleGuidHex),
      payload_json: payloadJsonInBind(payload),
      updated_by: auditInBind(updatedBy),
      ...statusOutBinds()
    },
    parseActionOut
  );
}

export async function deleteFrequencyRuleViaPackage(frequencyRuleGuidHex, deletedBy) {
  return executePackageMutation(
    DELETE_PLSQL,
    {
      frequency_rule_guid: guidHexInBind(frequencyRuleGuidHex),
      deleted_by: auditInBind(deletedBy),
      ...statusOutBinds()
    },
    parseActionOut
  );
}
