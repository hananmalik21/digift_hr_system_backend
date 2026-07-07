import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { buildPayElementEligProfileListWhereClause } from '../utils/payElementEligProfilesFilterBuilder.js';
import {
  normalizeGuidField,
  parseJsonArray,
  readClobValue,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../utils/payElementEligProfilesViewUtils.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payElementEligProfiles.constants.js';

const VIEW = 'PAY.V_PAY_ELEMENT_ELIG_PROFILES';
const GENERIC_ERROR_MESSAGE = GENERIC_TECHNICAL_ERROR;
const QUERY_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const LIST_SELECT_COLUMNS = `
  v.PROFILE_ID,
  v.PROFILE_GUID,
  v.ENTERPRISE_ID,
  v.PROFILE_NAME,
  v.PROFILE_DESCRIPTION,
  v.STATUS,
  v.ELIGIBILITY_RULE_COUNT,
  v.ELIGIBILITY_RULES_JSON,
  v.LINKED_ELEMENT_COUNT,
  v.LINKED_ELEMENTS_JSON,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

async function mapJsonCollection(raw, mapper) {
  const parsed = parseJsonArray(await readClobValue(raw));
  return parsed.map(mapper).filter(Boolean);
}

function mapLinkedElementJsonItem(item) {
  if (item == null || typeof item !== 'object') return null;

  return {
    profile_element_id: toNumberOrNull(item.profile_element_id ?? item.PROFILE_ELEMENT_ID),
    profile_element_guid: normalizeGuidField(
      item.profile_element_guid ?? item.PROFILE_ELEMENT_GUID
    ),
    element_id: toNumberOrNull(item.element_id ?? item.ELEMENT_ID),
    element_guid: normalizeGuidField(item.element_guid ?? item.ELEMENT_GUID),
    element_code: toStringOrNull(item.element_code ?? item.ELEMENT_CODE),
    element_name: toStringOrNull(item.element_name ?? item.ELEMENT_NAME),
    description: toStringOrNull(item.description ?? item.DESCRIPTION),
    category_code: toStringOrNull(item.category_code ?? item.CATEGORY_CODE),
    classification_code: toStringOrNull(item.classification_code ?? item.CLASSIFICATION_CODE),
    effective_start_date: toIsoDateOrNull(item.effective_start_date ?? item.EFFECTIVE_START_DATE),
    effective_end_date: toIsoDateOrNull(item.effective_end_date ?? item.EFFECTIVE_END_DATE),
    created_by: toStringOrNull(item.created_by ?? item.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(item.creation_date ?? item.CREATION_DATE),
    last_updated_by: toStringOrNull(item.last_updated_by ?? item.LAST_UPDATED_BY),
    last_update_date: toIsoDateTimeOrNull(item.last_update_date ?? item.LAST_UPDATE_DATE)
  };
}

function mapRuleJsonItem(item) {
  if (item == null || typeof item !== 'object') return null;

  let criteriaValues = item.criteria_values ?? item.CRITERIA_VALUES;
  if (typeof criteriaValues === 'string') {
    criteriaValues = parseJsonArray(criteriaValues);
  } else if (!Array.isArray(criteriaValues)) {
    criteriaValues = [];
  }

  return {
    profile_rule_id: toNumberOrNull(item.profile_rule_id ?? item.PROFILE_RULE_ID),
    profile_rule_guid: normalizeGuidField(item.profile_rule_guid ?? item.PROFILE_RULE_GUID),
    eligibility_rule_id: toNumberOrNull(item.eligibility_rule_id ?? item.ELIGIBILITY_RULE_ID),
    eligibility_rule_guid: normalizeGuidField(
      item.eligibility_rule_guid ?? item.ELIGIBILITY_RULE_GUID
    ),
    rule_name: toStringOrNull(item.rule_name ?? item.RULE_NAME),
    rule_status: toStringOrNull(item.rule_status ?? item.RULE_STATUS),
    effective_start_date: toIsoDateOrNull(item.effective_start_date ?? item.EFFECTIVE_START_DATE),
    effective_end_date: toIsoDateOrNull(item.effective_end_date ?? item.EFFECTIVE_END_DATE),
    criteria_values: criteriaValues,
    created_by: toStringOrNull(item.created_by ?? item.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(item.creation_date ?? item.CREATION_DATE),
    last_updated_by: toStringOrNull(item.last_updated_by ?? item.LAST_UPDATED_BY),
    last_update_date: toIsoDateTimeOrNull(item.last_update_date ?? item.LAST_UPDATE_DATE)
  };
}

async function mapProfileViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  const rulesRaw = g('ELIGIBILITY_RULES_JSON');
  const elementsRaw = g('LINKED_ELEMENTS_JSON');

  const eligibilityRules = await mapJsonCollection(rulesRaw, mapRuleJsonItem);
  const linkedElements = await mapJsonCollection(elementsRaw, mapLinkedElementJsonItem);

  return {
    profile_id: toNumberOrNull(g('PROFILE_ID')),
    profile_guid: normalizeGuidField(g('PROFILE_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    profile_name: toStringOrNull(g('PROFILE_NAME')),
    profile_description: toStringOrNull(g('PROFILE_DESCRIPTION')),
    status: toStringOrNull(g('STATUS')),
    eligibility_rule_count: toNumberOrNull(g('ELIGIBILITY_RULE_COUNT')) ?? eligibilityRules.length,
    eligibility_rules: eligibilityRules,
    linked_element_count: toNumberOrNull(g('LINKED_ELEMENT_COUNT')) ?? linkedElements.length,
    linked_elements: linkedElements,
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

async function queryViewRows(sql, binds) {
  try {
    const result = await db.executeQuery(sql, binds, QUERY_OPTIONS);
    return result.rows ?? [];
  } catch (err) {
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, GENERIC_ERROR_MESSAGE);
  }
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
  const whereParts = ['v.PROFILE_GUID = :profile_guid'];
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
