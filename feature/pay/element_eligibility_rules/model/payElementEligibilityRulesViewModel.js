import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { buildPayElementEligibilityRuleListWhereClause } from '../utils/payElementEligibilityRulesFilterBuilder.js';
import {
  normalizeGuidField,
  parseJsonArray,
  readClobValue,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../utils/payElementEligibilityRulesViewUtils.js';
import { GENERIC_TECHNICAL_ERROR } from './payElementEligibilityRulesModel.js';

const VIEW = 'PAY.V_PAY_ELEMENT_ELIGIBILITY_RULES';
const GENERIC_ERROR_MESSAGE = GENERIC_TECHNICAL_ERROR;
const QUERY_OPTIONS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const LIST_SELECT_COLUMNS = `
  v.ELIGIBILITY_RULE_ID,
  v.ELIGIBILITY_RULE_GUID,
  v.ENTERPRISE_ID,
  v.RULE_NAME,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.STATUS,
  v.STATUS_NAME,
  v.CRITERIA_VALUE_COUNT,
  v.CRITERIA_VALUES_JSON,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

function mapCriteriaJsonItem(item) {
  if (item == null || typeof item !== 'object') return null;

  return {
    eligibility_rule_value_id: toNumberOrNull(
      item.eligibility_rule_value_id ?? item.ELIGIBILITY_RULE_VALUE_ID
    ),
    eligibility_rule_value_guid: normalizeGuidField(
      item.eligibility_rule_value_guid ?? item.ELIGIBILITY_RULE_VALUE_GUID
    ),
    criteria_type_code: toStringOrNull(item.criteria_type_code ?? item.CRITERIA_TYPE_CODE),
    criteria_value: toStringOrNull(item.criteria_value ?? item.CRITERIA_VALUE),
    criteria_value_name: toStringOrNull(item.criteria_value_name ?? item.CRITERIA_VALUE_NAME),
    legal_employer_id: normalizeGuidField(item.legal_employer_id ?? item.LEGAL_EMPLOYER_ID),
    org_unit_id: normalizeGuidField(item.org_unit_id ?? item.ORG_UNIT_ID),
    grade_id: toNumberOrNull(item.grade_id ?? item.GRADE_ID),
    position_id: normalizeGuidField(item.position_id ?? item.POSITION_ID),
    employment_type_code: toStringOrNull(item.employment_type_code ?? item.EMPLOYMENT_TYPE_CODE),
    location_code: toStringOrNull(item.location_code ?? item.LOCATION_CODE),
    created_by: toStringOrNull(item.created_by ?? item.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(item.creation_date ?? item.CREATION_DATE),
    last_updated_by: toStringOrNull(item.last_updated_by ?? item.LAST_UPDATED_BY),
    last_update_date: toIsoDateTimeOrNull(item.last_update_date ?? item.LAST_UPDATE_DATE)
  };
}

async function mapPayElementEligibilityRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  const criteriaRaw = await readClobValue(g('CRITERIA_VALUES_JSON'));
  const criteria = parseJsonArray(criteriaRaw).map(mapCriteriaJsonItem).filter(Boolean);
  const criteriaCount = toNumberOrNull(g('CRITERIA_VALUE_COUNT')) ?? criteria.length;

  return {
    eligibility_rule_id: toNumberOrNull(g('ELIGIBILITY_RULE_ID')),
    eligibility_rule_guid: normalizeGuidField(g('ELIGIBILITY_RULE_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    rule_name: toStringOrNull(g('RULE_NAME')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    status: toStringOrNull(g('STATUS')),
    status_name: toStringOrNull(g('STATUS_NAME')),
    criteria_count: criteriaCount,
    criteria_value_count: criteriaCount,
    criteria,
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

export function mapPayElementEligibilityRuleCreateData(row) {
  return {
    eligibility_rule_id: row.eligibility_rule_id,
    eligibility_rule_guid: row.eligibility_rule_guid,
    enterprise_id: row.enterprise_id,
    rule_name: row.rule_name,
    criteria_count: row.criteria_count,
    criteria: row.criteria
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

export async function listPayElementEligibilityRulesFromView(filters) {
  const { whereSql, binds } = buildPayElementEligibilityRuleListWhereClause(filters);
  const sql = `
SELECT ${LIST_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.CREATION_DATE DESC`.trim();

  const rows = await queryViewRows(sql, binds);
  return Promise.all(rows.map((row) => mapPayElementEligibilityRuleViewRow(row)));
}

export async function getPayElementEligibilityRuleFromViewByGuid(
  eligibilityRuleGuidHex,
  enterpriseId = null
) {
  const whereParts = ['v.ELIGIBILITY_RULE_GUID = :eligibility_rule_guid'];
  const binds = { eligibility_rule_guid: String(eligibilityRuleGuidHex).trim().toUpperCase() };

  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${LIST_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  const rows = await queryViewRows(sql, binds);
  return rows[0] ? mapPayElementEligibilityRuleViewRow(rows[0]) : null;
}
