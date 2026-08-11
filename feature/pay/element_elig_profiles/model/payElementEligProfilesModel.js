import oracledb from 'oracledb';
import {
  auditInBind,
  codeInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numberInBind,
  varcharInBind
} from '../../../../utils/oraclePackageUtils.js';
import { mapPackageBusinessMessage } from '../utils/payElementEligProfilesOracleErrors.js';
import {
  executeYnOnConnection,
  executeYnPackageMutation,
  successOutBinds,
  withPackageTransaction
} from '../utils/payElementEligProfilesPackageExecutor.js';

const PKG = 'PAY.PAY_ELEMENT_PROFILES_PKG';

const UPSERT_PLSQL = `
BEGIN
  ${PKG}.UPSERT_PROFILE(
    P_ENTERPRISE_ID        => :p_enterprise_id,
    P_PROFILE_CODE         => :p_profile_code,
    P_PROFILE_NAME         => :p_profile_name,
    P_DESCRIPTION          => :p_description,
    P_MATCH_LOGIC_CODE     => :p_match_logic_code,
    P_EFFECTIVE_START_DATE => TO_DATE(:p_effective_start_date, 'YYYY-MM-DD'),
    P_EFFECTIVE_END_DATE   => TO_DATE(:p_effective_end_date, 'YYYY-MM-DD'),
    P_STATUS               => :p_status,
    P_UPDATED_BY           => :p_updated_by,
    P_PROFILE_ID           => :p_profile_id,
    P_PROFILE_GUID         => :p_profile_guid,
    P_SUCCESS              => :p_success,
    P_MESSAGE              => :p_message
  );
END;`;

const LINK_RULE_PLSQL = `
BEGIN
  ${PKG}.LINK_RULE(
    P_PROFILE_ID          => :p_profile_id,
    P_ELIGIBILITY_RULE_ID => :p_eligibility_rule_id,
    P_RULE_SEQUENCE       => :p_rule_sequence,
    P_ACTIVE_FLAG         => :p_active_flag,
    P_UPDATED_BY          => :p_updated_by,
    P_PROFILE_RULE_ID     => :p_profile_rule_id,
    P_SUCCESS             => :p_success,
    P_MESSAGE             => :p_message
  );
END;`;

const SET_STATUS_PLSQL = `
BEGIN
  ${PKG}.SET_STATUS(
    P_ENTERPRISE_ID => :p_enterprise_id,
    P_PROFILE_CODE  => :p_profile_code,
    P_STATUS        => :p_status,
    P_UPDATED_BY    => :p_updated_by,
    P_SUCCESS       => :p_success,
    P_MESSAGE       => :p_message
  );
END;`;

function shapeUpsertResult({ success, message, outBinds }) {
  const result = { success, message };
  if (success) {
    const guid = normalizeOutString(outBinds.p_profile_guid);
    result.data = {
      profile_id: normalizeOutNumber(outBinds.p_profile_id),
      profile_guid: guid ? normalizeOutGuidHex(guid) || String(guid).replace(/-/g, '').toLowerCase() : null
    };
  }
  return result;
}

function shapeLinkRuleResult({ success, message, outBinds }, rule) {
  const result = { success, message, rule };
  if (success) {
    result.data = {
      profile_rule_id: normalizeOutNumber(outBinds.p_profile_rule_id),
      eligibility_rule_id: rule.eligibility_rule_id,
      rule_sequence: rule.rule_sequence,
      active_flag: rule.active_flag
    };
  }
  return result;
}

function buildUpsertBinds(payload, actor) {
  return {
    p_enterprise_id: numberInBind(payload.enterprise_id),
    p_profile_code: codeInBind(payload.profile_code, 100),
    p_profile_name: varcharInBind(payload.profile_name, 240),
    p_description: varcharInBind(payload.description, 1000),
    p_match_logic_code: codeInBind(payload.match_logic_code, 10),
    p_effective_start_date: varcharInBind(payload.effective_start_date, 10),
    p_effective_end_date: varcharInBind(payload.effective_end_date, 10),
    p_status: codeInBind(payload.status, 30),
    p_updated_by: auditInBind(actor),
    p_profile_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_profile_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 64 },
    ...successOutBinds('p')
  };
}

function buildLinkRuleBinds(profileId, rule, actor) {
  return {
    p_profile_id: numberInBind(profileId),
    p_eligibility_rule_id: numberInBind(rule.eligibility_rule_id),
    p_rule_sequence: numberInBind(rule.rule_sequence ?? 1),
    p_active_flag: codeInBind(rule.active_flag ?? 'Y', 1),
    p_updated_by: auditInBind(actor),
    p_profile_rule_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    ...successOutBinds('p')
  };
}

/**
 * UPSERT_PROFILE then LINK_RULE for each eligibility rule on one connection.
 * Commits only when profile upsert and every link succeed.
 */
export async function upsertProfileWithRulesViaPackage(payload, actor) {
  const rules = Array.isArray(payload.eligibility_rules) ? payload.eligibility_rules : [];

  return withPackageTransaction(async (connection) => {
    const upsert = await executeYnOnConnection(
      connection,
      UPSERT_PLSQL,
      buildUpsertBinds(payload, actor),
      mapPackageBusinessMessage,
      { shapeResult: shapeUpsertResult }
    );

    if (!upsert.success) {
      return upsert;
    }

    const profileId = upsert.data?.profile_id;
    const linkedRules = [];

    for (const rule of rules) {
      const link = await executeYnOnConnection(
        connection,
        LINK_RULE_PLSQL,
        buildLinkRuleBinds(profileId, rule, actor),
        mapPackageBusinessMessage,
        { shapeResult: (parsed) => shapeLinkRuleResult(parsed, rule) }
      );

      if (!link.success) {
        return {
          success: false,
          message: link.message || 'Unable to link eligibility rule to profile.',
          data: {
            profile_id: profileId,
            profile_guid: upsert.data?.profile_guid ?? null,
            eligibility_rule_id: rule.eligibility_rule_id,
            linked_rules: linkedRules
          }
        };
      }

      linkedRules.push(link.data);
    }

    return {
      success: true,
      message: upsert.message || 'Eligibility profile saved successfully.',
      data: {
        profile_id: profileId,
        profile_guid: upsert.data?.profile_guid ?? null,
        linked_rules: linkedRules
      }
    };
  });
}

/** Profile-only upsert (no rule linking). Used when update omits eligibility_rules_json. */
export async function upsertProfileViaPackage(payload, actor) {
  return executeYnPackageMutation(
    UPSERT_PLSQL,
    buildUpsertBinds(payload, actor),
    mapPackageBusinessMessage,
    shapeUpsertResult
  );
}

export async function linkRuleViaPackage(profileId, rule, actor) {
  return executeYnPackageMutation(
    LINK_RULE_PLSQL,
    buildLinkRuleBinds(profileId, rule, actor),
    mapPackageBusinessMessage,
    (parsed) => shapeLinkRuleResult(parsed, rule)
  );
}

export async function setProfileStatusViaPackage(enterpriseId, profileCode, status, actor) {
  return executeYnPackageMutation(
    SET_STATUS_PLSQL,
    {
      p_enterprise_id: numberInBind(enterpriseId),
      p_profile_code: codeInBind(profileCode, 100),
      p_status: codeInBind(status, 30),
      p_updated_by: auditInBind(actor),
      ...successOutBinds('p')
    },
    mapPackageBusinessMessage
  );
}

/** Soft-delete via SET_STATUS (package has no DELETE). */
export async function deleteProfileViaPackage(enterpriseId, profileCode, _hardDelete, actor) {
  return setProfileStatusViaPackage(enterpriseId, profileCode, 'INACTIVE', actor);
}

/** @deprecated Use upsertProfileWithRulesViaPackage */
export async function createProfileViaPackage(payload, actor) {
  return upsertProfileWithRulesViaPackage(payload, actor);
}

/** @deprecated Use upsertProfileWithRulesViaPackage / upsertProfileViaPackage */
export async function updateProfileViaPackage(enterpriseId, _profileGuidHex, payload, actor) {
  return upsertProfileWithRulesViaPackage(
    { ...payload, enterprise_id: enterpriseId },
    actor
  );
}
