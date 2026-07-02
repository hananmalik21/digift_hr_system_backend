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
import { resolvePayElementProrationRulesUserMessage } from '../utils/payElementProrationRulesOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENT_PRORATION_RULES_PKG';
const CREATE_PROC = `${PKG}.CREATE_PRORATION_RULE`;
const UPDATE_PROC = `${PKG}.UPDATE_PRORATION_RULE`;
const DELETE_PROC = `${PKG}.DELETE_PRORATION_RULE`;

const LOG_TAG = 'payElementProrationRulesModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process element proration rule. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_PAYLOAD_JSON        => :payload_json,
    P_CREATED_BY          => :created_by,
    P_PRORATION_RULE_ID   => :proration_rule_id,
    P_PRORATION_RULE_GUID => :proration_rule_guid,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_PRORATION_RULE_GUID => :proration_rule_guid,
    P_PAYLOAD_JSON        => :payload_json,
    P_UPDATED_BY          => :updated_by,
    P_STATUS              => :status,
    P_MESSAGE             => :message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_PRORATION_RULE_GUID => :proration_rule_guid,
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
  const guid = normalizeOutString(ob.proration_rule_guid);
  return {
    proration_rule_id: normalizeOutNumber(ob.proration_rule_id),
    proration_rule_guid: guid ? normalizeOutGuidHex(guid) : null,
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
      resolvePayElementProrationRulesUserMessage(null, err)
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function createProrationRuleViaPackage(payload, createdBy) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      payload_json: payloadJsonInBind(payload),
      created_by: auditInBind(createdBy),
      proration_rule_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      proration_rule_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 },
      ...statusOutBinds()
    },
    parseCreateOut
  );
}

export async function updateProrationRuleViaPackage(prorationRuleGuidHex, payload, updatedBy) {
  return executePackageMutation(
    UPDATE_PLSQL,
    {
      proration_rule_guid: guidHexInBind(prorationRuleGuidHex),
      payload_json: payloadJsonInBind(payload),
      updated_by: auditInBind(updatedBy),
      ...statusOutBinds()
    },
    parseActionOut
  );
}

export async function deleteProrationRuleViaPackage(prorationRuleGuidHex, deletedBy) {
  return executePackageMutation(
    DELETE_PLSQL,
    {
      proration_rule_guid: guidHexInBind(prorationRuleGuidHex),
      deleted_by: auditInBind(deletedBy),
      ...statusOutBinds()
    },
    parseActionOut
  );
}
