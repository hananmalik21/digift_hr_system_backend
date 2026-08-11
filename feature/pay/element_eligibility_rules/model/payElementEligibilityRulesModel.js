import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import {
  auditInBind,
  codeInBind,
  guidHexInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { mapPackageBusinessMessage } from '../utils/payElementEligibilityRulesOracleErrors.js';

const PKG = 'PAY.PAY_ELEMENT_ELIGIBILITY_RULES_PKG';
const CREATE_PROC = `${PKG}.CREATE_RULE`;
const UPDATE_PROC = `${PKG}.UPDATE_RULE`;
const DELETE_PROC = `${PKG}.DELETE_RULE`;
const SET_STATUS_PROC = `${PKG}.SET_STATUS`;

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    P_ENTERPRISE_ID         => :p_enterprise_id,
    P_RULE_NAME             => :p_rule_name,
    P_CRITERIA_VALUES_JSON  => :p_criteria_values_json,
    P_EFFECTIVE_START_DATE  => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE    => TO_DATE(:p_effective_end_date, 'YYYY-MM-DD'),
    P_STATUS                => :p_status,
    P_CREATED_BY            => :p_created_by,
    P_CREATION_DATE         => :p_creation_date,
    P_LAST_UPDATED_BY       => :p_last_updated_by,
    P_LAST_UPDATE_DATE      => :p_last_update_date,
    X_SUCCESS               => :x_success,
    X_MESSAGE               => :x_message,
    X_ELIGIBILITY_RULE_ID   => :x_eligibility_rule_id,
    X_ELIGIBILITY_RULE_GUID => :x_eligibility_rule_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    P_ENTERPRISE_ID         => :p_enterprise_id,
    P_ELIGIBILITY_RULE_GUID => :p_eligibility_rule_guid,
    P_RULE_NAME             => :p_rule_name,
    P_CRITERIA_VALUES_JSON  => :p_criteria_values_json,
    P_EFFECTIVE_START_DATE  => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE    => TO_DATE(:p_effective_end_date, 'YYYY-MM-DD'),
    P_STATUS                => :p_status,
    P_LAST_UPDATED_BY       => :p_last_updated_by,
    P_LAST_UPDATE_DATE      => :p_last_update_date,
    X_SUCCESS               => :x_success,
    X_MESSAGE               => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    P_ENTERPRISE_ID         => :p_enterprise_id,
    P_ELIGIBILITY_RULE_GUID => :p_eligibility_rule_guid,
    P_HARD_DELETE           => :p_hard_delete,
    P_LAST_UPDATED_BY       => :p_last_updated_by,
    P_LAST_UPDATE_DATE      => :p_last_update_date,
    X_SUCCESS               => :x_success,
    X_MESSAGE               => :x_message
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${SET_STATUS_PROC}(
    P_ENTERPRISE_ID         => :p_enterprise_id,
    P_ELIGIBILITY_RULE_GUID => :p_eligibility_rule_guid,
    P_STATUS                => :p_status,
    P_LAST_UPDATED_BY       => :p_last_updated_by,
    P_LAST_UPDATE_DATE      => :p_last_update_date,
    X_SUCCESS               => :x_success,
    X_MESSAGE               => :x_message
  );
END;`;

function successOutBinds() {
  return {
    x_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
    x_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

function packageSuccessIsTrue(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase() === 'Y';
}

function parsePackageOut(outBinds, { includeCreateFields = false } = {}) {
  const ob = outBinds || {};
  const success = packageSuccessIsTrue(ob.x_success);
  const rawMessage = normalizeOutString(ob.x_message) ?? '';
  const message = success ? rawMessage : mapPackageBusinessMessage(rawMessage);
  const result = { success, message };

  if (includeCreateFields && success) {
    const guid = normalizeOutString(ob.x_eligibility_rule_guid);
    result.data = {
      eligibility_rule_id: normalizeOutNumber(ob.x_eligibility_rule_id),
      eligibility_rule_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }

  return result;
}

function criteriaJsonClobBind(criteriaValuesJson) {
  return {
    val: criteriaValuesJson == null ? null : String(criteriaValuesJson),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function buildRuleBinds(payload) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_rule_name: varcharInBind(payload.rule_name, 200),
    p_criteria_values_json: criteriaJsonClobBind(payload.criteria_values_json),
    p_effective_start_date: varcharInBind(payload.effective_start_date, 10),
    p_effective_end_date: varcharInBind(payload.effective_end_date, 10),
    p_status: codeInBind(payload.status, 20)
  };
}

function whoTimestampBind() {
  return { val: new Date(), dir: oracledb.BIND_IN, type: oracledb.DATE };
}

function whoCreateBinds(actor) {
  const auditActor = auditInBind(actor);
  const timestamp = whoTimestampBind();
  return {
    p_created_by: auditActor,
    p_creation_date: timestamp,
    p_last_updated_by: auditActor,
    p_last_update_date: timestamp
  };
}

function whoUpdateBinds(actor) {
  return {
    p_last_updated_by: auditInBind(actor),
    p_last_update_date: whoTimestampBind()
  };
}

async function executePackageMutation(plsql, binds, options = {}) {
  const connection = await db.getConnection();
  try {
    const result = await connection.execute(plsql, binds);
    const parsed = parsePackageOut(result?.outBinds, options);

    if (parsed.success) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    return parsed;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    throw new DatabaseError(GENERIC_TECHNICAL_ERROR, err, GENERIC_TECHNICAL_ERROR);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function createEligibilityRuleViaPackage(payload, actor) {
  return executePackageMutation(
    CREATE_PLSQL,
    {
      ...buildRuleBinds(payload),
      ...whoCreateBinds(actor),
      ...successOutBinds(),
      x_eligibility_rule_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_eligibility_rule_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    { includeCreateFields: true }
  );
}

export async function updateEligibilityRuleViaPackage(
  enterpriseId,
  eligibilityRuleGuidHex,
  payload,
  actor
) {
  return executePackageMutation(UPDATE_PLSQL, {
    p_enterprise_id: numberInBind(enterpriseId),
    p_eligibility_rule_guid: guidHexInBind(eligibilityRuleGuidHex),
    ...buildRuleBinds(payload),
    ...whoUpdateBinds(actor),
    ...successOutBinds()
  });
}

export async function setEligibilityRuleStatusViaPackage(
  enterpriseId,
  eligibilityRuleGuidHex,
  ruleStatus,
  actor
) {
  return executePackageMutation(SET_STATUS_PLSQL, {
    p_enterprise_id: numberInBind(enterpriseId),
    p_eligibility_rule_guid: guidHexInBind(eligibilityRuleGuidHex),
    p_status: codeInBind(ruleStatus, 20),
    ...whoUpdateBinds(actor),
    ...successOutBinds()
  });
}

export async function deleteEligibilityRuleViaPackage(
  enterpriseId,
  eligibilityRuleGuidHex,
  hardDelete,
  actor
) {
  return executePackageMutation(DELETE_PLSQL, {
    p_enterprise_id: numberInBind(enterpriseId),
    p_eligibility_rule_guid: guidHexInBind(eligibilityRuleGuidHex),
    p_hard_delete: ynInBind(hardDelete, 'N'),
    ...whoUpdateBinds(actor),
    ...successOutBinds()
  });
}
