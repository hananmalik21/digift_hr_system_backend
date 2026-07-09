import { buildPayElementRelRuleListWhereClause } from '../utils/payElementRelRulesFilterBuilder.js';
import {
  executeViewQuery,
  mapGuidField,
  normalizeRuleGuidHex,
  readScalarCount,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../utils/payElementRelRulesViewUtils.js';
import { getPayElementRelRuleHeaderFromTable } from './payElementRelRuleReferencesModel.js';

const VIEW = 'PAY.V_PAY_ELEMENT_REL_RULES';

const VIEW_SELECT_COLUMNS = `
  v.RULE_ID,
  v.RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ELEMENT_DESCRIPTION,
  v.CATEGORY_CODE,
  v.CLASSIFICATION_CODE,
  v.SECONDARY_CLASSIFICATION,
  v.LEGISLATIVE_DATA_GROUP,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.ENTERPRISE_ID,
  v.SCOPE_CONFIGURATION_CODE,
  v.SCOPE_CONFIGURATION_NAME,
  v.PAYROLL_ID,
  v.PAYROLL_DISPLAY,
  v.ORG_UNIT_ID,
  v.ORG_UNIT_GUID,
  v.ORG_UNIT_DISPLAY,
  v.GRADE_ID,
  v.GRADE_DISPLAY,
  v.POSITION_ID,
  v.POSITION_GUID,
  v.POSITION_DISPLAY,
  v.ACTIVE_FLAG,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

export function mapPayElementRelRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    rule_id: toNumberOrNull(g('RULE_ID')),
    rule_guid: mapGuidField(g('RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: mapGuidField(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    element_description: toStringOrNull(g('ELEMENT_DESCRIPTION')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    secondary_classification: toStringOrNull(g('SECONDARY_CLASSIFICATION')),
    legislative_data_group: toStringOrNull(g('LEGISLATIVE_DATA_GROUP')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    scope_configuration_code: toStringOrNull(g('SCOPE_CONFIGURATION_CODE')),
    scope_configuration_name: toStringOrNull(g('SCOPE_CONFIGURATION_NAME')),
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_display: toStringOrNull(g('PAYROLL_DISPLAY')),
    org_unit_id: mapGuidField(g('ORG_UNIT_GUID')),
    org_unit_display: toStringOrNull(g('ORG_UNIT_DISPLAY')),
    grade_id: toNumberOrNull(g('GRADE_ID')),
    grade_display: toStringOrNull(g('GRADE_DISPLAY')),
    position_id: mapGuidField(g('POSITION_GUID')),
    position_display: toStringOrNull(g('POSITION_DISPLAY')),
    active_flag: toStringOrNull(g('ACTIVE_FLAG')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

export async function listPayElementRelRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementRelRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  const [countResult, dataResult] = await Promise.all([
    executeViewQuery(countSql, binds, 'listPayElementRelRulesFromView.count'),
    executeViewQuery(
      dataSql,
      { ...binds, skip_rows: skipRows, fetch_next: filters.limit },
      'listPayElementRelRulesFromView.data'
    )
  ]);

  return {
    rows: (dataResult.rows || []).map(mapPayElementRelRuleViewRow),
    total: readScalarCount(countResult)
  };
}

export async function getPayElementRelRuleFromViewByGuid(ruleGuidHex, enterpriseId = null) {
  const whereParts = ['UPPER(v.RULE_GUID) = :rule_guid'];
  const binds = { rule_guid: normalizeRuleGuidHex(ruleGuidHex) };
  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  const result = await executeViewQuery(sql, binds, 'getPayElementRelRuleFromViewByGuid');
  const row = result.rows?.[0];
  return row ? mapPayElementRelRuleViewRow(row) : null;
}

export async function resolvePayElementRelRuleByGuid(ruleGuidHex, enterpriseId = null) {
  const fromView = await getPayElementRelRuleFromViewByGuid(ruleGuidHex, enterpriseId);
  if (fromView) return fromView;
  return getPayElementRelRuleHeaderFromTable(ruleGuidHex, enterpriseId);
}
