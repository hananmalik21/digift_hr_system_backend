import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { buildPayElementEligProfileListWhereClause } from '../utils/payElementEligProfilesFilterBuilder.js';
import {
  normalizeGuidField,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../utils/payElementEligProfilesViewUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payElementEligProfiles.constants.js';

const VIEW = 'PAY.V_PAY_ELEMENT_PROFILES';
const RULES_TABLE = 'PAY.PAY_ELEMENT_PROFILE_RULES';
const LINKS_VIEW = 'PAY.V_PAY_ELEMENT_PROFILE_LINKS';
const GENERIC_ERROR_MESSAGE = GENERIC_TECHNICAL_ERROR;
const QUERY_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const LIST_SELECT_COLUMNS = `
  v.PROFILE_ID,
  v.PROFILE_GUID,
  v.ENTERPRISE_ID,
  v.PROFILE_CODE,
  v.PROFILE_NAME,
  v.DESCRIPTION,
  v.MATCH_LOGIC_CODE,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.STATUS,
  v.RULE_COUNT,
  v.LINKED_ELEMENT_COUNT,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

async function queryViewRows(sql, binds) {
  try {
    const result = await db.executeQuery(sql, binds, QUERY_OPTIONS);
    return result.rows ?? [];
  } catch (err) {
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  }
}

async function listRulesForProfile(profileId) {
  if (profileId == null) return [];
  const rows = await queryViewRows(
    `
SELECT
    PROFILE_RULE_ID,
    ELIGIBILITY_RULE_ID,
    RULE_SEQUENCE,
    ACTIVE_FLAG
  FROM ${RULES_TABLE}
 WHERE PROFILE_ID = :profile_id
 ORDER BY RULE_SEQUENCE, PROFILE_RULE_ID`.trim(),
    { profile_id: profileId }
  );

  return rows.map((row) => {
    const r = rowKeysUpper(row);
    return {
      profile_rule_id: toNumberOrNull(r.PROFILE_RULE_ID),
      eligibility_rule_id: toNumberOrNull(r.ELIGIBILITY_RULE_ID),
      rule_sequence: toNumberOrNull(r.RULE_SEQUENCE),
      active_flag: toStringOrNull(r.ACTIVE_FLAG)
    };
  });
}

async function listLinkedElementsForProfile(profileId, enterpriseId = null) {
  if (profileId == null) return [];
  const where = ['v.PROFILE_ID = :profile_id'];
  const binds = { profile_id: profileId };
  if (enterpriseId != null) {
    where.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const rows = await queryViewRows(
    `
SELECT
    v.PROFILE_LINK_ID,
    v.PROFILE_LINK_GUID,
    v.ELEMENT_ID,
    v.ELEMENT_CODE,
    v.ELEMENT_NAME,
    v.EFFECTIVE_START_DATE,
    v.EFFECTIVE_END_DATE,
    v.STATUS
  FROM ${LINKS_VIEW} v
 WHERE ${where.join(' AND ')}
 ORDER BY v.ELEMENT_CODE`.trim(),
    binds
  );

  return rows.map((row) => {
    const r = rowKeysUpper(row);
    return {
      profile_link_id: toNumberOrNull(r.PROFILE_LINK_ID),
      profile_link_guid: normalizeGuidField(r.PROFILE_LINK_GUID),
      element_id: toNumberOrNull(r.ELEMENT_ID),
      element_code: toStringOrNull(r.ELEMENT_CODE),
      element_name: toStringOrNull(r.ELEMENT_NAME),
      effective_start_date: toIsoDateOrNull(r.EFFECTIVE_START_DATE),
      effective_end_date: toIsoDateOrNull(r.EFFECTIVE_END_DATE),
      status: toStringOrNull(r.STATUS)
    };
  });
}

async function mapProfileViewRow(row, { includeCollections = true } = {}) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];
  const profileId = toNumberOrNull(g('PROFILE_ID'));

  const eligibilityRules = includeCollections ? await listRulesForProfile(profileId) : [];
  const linkedElements = includeCollections
    ? await listLinkedElementsForProfile(profileId, toNumberOrNull(g('ENTERPRISE_ID')))
    : [];

  return {
    profile_id: profileId,
    profile_guid: normalizeGuidField(g('PROFILE_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    profile_code: toStringOrNull(g('PROFILE_CODE')),
    profile_name: toStringOrNull(g('PROFILE_NAME')),
    description: toStringOrNull(g('DESCRIPTION')),
    profile_description: toStringOrNull(g('DESCRIPTION')),
    match_logic_code: toStringOrNull(g('MATCH_LOGIC_CODE')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    status: toStringOrNull(g('STATUS')),
    eligibility_rule_count: toNumberOrNull(g('RULE_COUNT')) ?? eligibilityRules.length,
    linked_rule_count: eligibilityRules.length,
    eligibility_rules: eligibilityRules,
    linked_element_count: toNumberOrNull(g('LINKED_ELEMENT_COUNT')) ?? linkedElements.length,
    linked_elements: linkedElements,
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

export async function listElementEligProfilesFromView(filters) {
  const { whereSql, binds } = buildPayElementEligProfileListWhereClause(filters);
  const sql = `
SELECT ${LIST_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.CREATION_DATE DESC`.trim();

  const rows = await queryViewRows(sql, binds);
  return Promise.all(rows.map((row) => mapProfileViewRow(row)));
}

export async function getElementEligProfileFromViewByGuid(profileGuidHex, enterpriseId = null) {
  const whereParts = ['UPPER(v.PROFILE_GUID) = :profile_guid'];
  const binds = { profile_guid: String(profileGuidHex).trim().toUpperCase() };

  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${LIST_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  const rows = await queryViewRows(sql, binds);
  return rows[0] ? mapProfileViewRow(rows[0]) : null;
}

export function mapProfileCreateData(row, linkedRules = []) {
  return {
    profile_id: row.profile_id,
    profile_guid: row.profile_guid,
    enterprise_id: row.enterprise_id,
    profile_code: row.profile_code,
    profile_name: row.profile_name,
    description: row.description ?? row.profile_description ?? null,
    match_logic_code: row.match_logic_code,
    linked_rule_count: linkedRules.length || row.linked_rule_count || row.eligibility_rules?.length || 0,
    eligibility_rules: linkedRules.length ? linkedRules : row.eligibility_rules || []
  };
}
