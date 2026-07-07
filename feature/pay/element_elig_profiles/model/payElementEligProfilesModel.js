import oracledb from 'oracledb';
import {
  codeInBind,
  guidHexInBind,
  jsonArrayToClobString,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind,
  ynInBind
} from '../../../../utils/oraclePackageUtils.js';
import { mapPackageBusinessMessage } from '../utils/payElementEligProfilesOracleErrors.js';
import {
  executeYnPackageMutation,
  successOutBinds,
  whoCreateBinds,
  whoUpdateBinds
} from '../utils/payElementEligProfilesPackageExecutor.js';

const PKG = 'PAY.PAY_ELEMENT_ELIG_PROFILES_PKG';

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_PROFILE(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PROFILE_NAME           => :p_profile_name,
    P_PROFILE_DESCRIPTION    => :p_profile_description,
    P_STATUS                 => :p_status,
    P_ELIGIBILITY_RULES_JSON => :p_eligibility_rules_json,
    P_CREATED_BY             => :p_created_by,
    P_CREATION_DATE          => :p_creation_date,
    P_LAST_UPDATED_BY        => :p_last_updated_by,
    P_LAST_UPDATE_DATE       => :p_last_update_date,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message,
    X_PROFILE_ID             => :x_profile_id,
    X_PROFILE_GUID           => :x_profile_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_PROFILE(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PROFILE_GUID           => :p_profile_guid,
    P_PROFILE_NAME           => :p_profile_name,
    P_PROFILE_DESCRIPTION    => :p_profile_description,
    P_STATUS                 => :p_status,
    P_ELIGIBILITY_RULES_JSON => :p_eligibility_rules_json,
    P_LAST_UPDATED_BY        => :p_last_updated_by,
    P_LAST_UPDATE_DATE       => :p_last_update_date,
    X_SUCCESS                => :x_success,
    X_MESSAGE                => :x_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_PROFILE(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_PROFILE_GUID        => :p_profile_guid,
    P_HARD_DELETE         => :p_hard_delete,
    P_LAST_UPDATED_BY     => :p_last_updated_by,
    P_LAST_UPDATE_DATE    => :p_last_update_date,
    X_SUCCESS             => :x_success,
    X_MESSAGE             => :x_message
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_STATUS(
    P_ENTERPRISE_ID       => :p_enterprise_id,
    P_PROFILE_GUID        => :p_profile_guid,
    P_STATUS              => :p_status,
    P_LAST_UPDATED_BY     => :p_last_updated_by,
    P_LAST_UPDATE_DATE    => :p_last_update_date,
    X_SUCCESS             => :x_success,
    X_MESSAGE             => :x_message
  );
END;`;

function eligibilityRulesJsonClobBind(eligibilityRules) {
  const json = jsonArrayToClobString(eligibilityRules ?? [], { allowEmptyArray: false });
  return {
    val: json ?? '[]',
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function buildProfileBinds(payload) {
  return {
    p_profile_name: varcharInBind(payload.profile_name, 240),
    p_profile_description: varcharInBind(payload.profile_description, 1000),
    p_status: codeInBind(payload.status, 30),
    p_eligibility_rules_json: eligibilityRulesJsonClobBind(payload.eligibility_rules)
  };
}

function shapeCreateResult({ success, message, outBinds }) {
  const result = { success, message };
  if (success) {
    const guid = normalizeOutString(outBinds.x_profile_guid);
    result.data = {
      profile_id: normalizeOutNumber(outBinds.x_profile_id),
      profile_guid: guid ? normalizeOutGuidHex(guid) : null
    };
  }
  return result;
}

export async function createProfileViaPackage(payload, actor) {
  return executeYnPackageMutation(
    CREATE_PLSQL,
    {
      p_enterprise_id: numberInBind(payload.enterprise_id),
      ...buildProfileBinds(payload),
      ...whoCreateBinds(actor),
      ...successOutBinds(),
      x_profile_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      x_profile_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
    },
    mapPackageBusinessMessage,
    shapeCreateResult
  );
}

export async function updateProfileViaPackage(enterpriseId, profileGuidHex, payload, actor) {
  return executeYnPackageMutation(
    UPDATE_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_guid: guidHexInBind(profileGuidHex),
      ...buildProfileBinds(payload),
      ...whoUpdateBinds(actor),
      ...successOutBinds()
    },
    mapPackageBusinessMessage
  );
}

export async function setProfileStatusViaPackage(enterpriseId, profileGuidHex, status, actor) {
  return executeYnPackageMutation(
    SET_STATUS_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_guid: guidHexInBind(profileGuidHex),
      p_status: codeInBind(status, 30),
      ...whoUpdateBinds(actor),
      ...successOutBinds()
    },
    mapPackageBusinessMessage
  );
}

export async function deleteProfileViaPackage(enterpriseId, profileGuidHex, hardDelete, actor) {
  return executeYnPackageMutation(
    DELETE_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_guid: guidHexInBind(profileGuidHex),
      p_hard_delete: ynInBind(hardDelete, 'N'),
      ...whoUpdateBinds(actor),
      ...successOutBinds()
    },
    mapPackageBusinessMessage
  );
}
