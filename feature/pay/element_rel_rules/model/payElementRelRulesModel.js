import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  outGuidHexBind,
  outNumberBind,
  strOrNull,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { resolvePayElementRelRulesUserMessage } from '../utils/payElementRelRulesOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENT_REL_RULES_PKG';
const CREATE_PROC = `${PKG}.CREATE_RULE`;
const UPDATE_PROC = `${PKG}.UPDATE_RULE`;
const DELETE_PROC = `${PKG}.DELETE_RULE`;

const LOG_TAG = 'payElementRelRulesModel';
const GENERIC_ERROR_MESSAGE = 'Unable to process element relationship rule. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_ELEMENT_ID               => :element_id,
    P_ENTERPRISE_ID            => :enterprise_id,
    P_SCOPE_CONFIGURATION_CODE => :scope_configuration_code,
    P_PAYROLL_ID               => :payroll_id,
    P_ORG_UNIT_GUID            => :org_unit_guid,
    P_GRADE_ID                 => :grade_id,
    P_POSITION_GUID            => :position_guid,
    P_ACTIVE_FLAG              => :active_flag,
    P_CREATED_BY               => :created_by,
    P_RULE_ID                  => :rule_id,
    P_RULE_GUID                => :rule_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_RULE_GUID                => :rule_guid,
    P_SCOPE_CONFIGURATION_CODE => :scope_configuration_code,
    P_PAYROLL_ID               => :payroll_id,
    P_ORG_UNIT_GUID            => :org_unit_guid,
    P_GRADE_ID                 => :grade_id,
    P_POSITION_GUID            => :position_guid,
    P_ACTIVE_FLAG              => :active_flag,
    P_UPDATED_BY               => :updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_RULE_GUID     => :rule_guid,
    P_HARD_DELETE   => :hard_delete,
    P_UPDATED_BY    => :updated_by
  );
END;`;

function optionalGuidInBind(value) {
  const hex = strOrNull(value);
  if (!hex) {
    return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 };
  }
  return guidHexInBind(hex.toUpperCase());
}

function buildScopeBinds(payload) {
  return {
    scope_configuration_code: varcharInBind(payload.scope_configuration_code, 50),
    payroll_id: numberInBind(payload.payroll_id),
    org_unit_guid: optionalGuidInBind(payload.org_unit_id),
    grade_id: numberInBind(payload.grade_id),
    position_guid: optionalGuidInBind(payload.position_id),
    active_flag: ynInBind(payload.active_flag, 'Y')
  };
}

function parseCreateOut(outBinds) {
  const ob = outBinds || {};
  const guid = normalizeOutString(ob.rule_guid);
  return {
    rule_id: normalizeOutNumber(ob.rule_id),
    rule_guid: guid ? normalizeOutGuidHex(guid) : null
  };
}

function logOracleError(err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${code}`, err?.message || err);
}

async function executePackageMutation(plsql, binds, parseOut = null) {
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
    throw new DatabaseError(
      GENERIC_ERROR_MESSAGE,
      err,
      resolvePayElementRelRulesUserMessage(null, err)
    );
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function createRelRuleViaPackage(payload, createdBy) {
  const binds = {
    element_id: numberInBind(payload.element_id),
    enterprise_id: numberInBind(payload.enterprise_id),
    ...buildScopeBinds(payload),
    created_by: auditInBind(createdBy),
    rule_id: outNumberBind(),
    rule_guid: outGuidHexBind()
  };

  return executePackageMutation(CREATE_PLSQL, binds, parseCreateOut);
}

export async function updateRelRuleViaPackage(ruleGuidHex, payload, updatedBy) {
  const binds = {
    rule_guid: guidHexInBind(ruleGuidHex),
    ...buildScopeBinds(payload),
    updated_by: auditInBind(updatedBy)
  };

  return executePackageMutation(UPDATE_PLSQL, binds);
}

export async function deleteRelRuleViaPackage(ruleGuidHex, hardDelete, updatedBy) {
  const binds = {
    rule_guid: guidHexInBind(ruleGuidHex),
    hard_delete: ynInBind(hardDelete, 'N'),
    updated_by: auditInBind(updatedBy)
  };

  return executePackageMutation(DELETE_PLSQL, binds);
}
