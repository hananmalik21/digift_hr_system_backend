import { buildPayElementRelRuleListWhereClause } from '../utils/payElementRelRulesFilterBuilder.js';
import { resolveOrgUnitApiFields } from '../utils/payElementRelRulesOrgUnitUtils.js';
import {
  executeView,
  mapGuidField,
  normalizeRuleGuidHex,
  readScalarCount,
  rowKeysUpper,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull,
  withViewConnection
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
  v.ORG_UNIT_HIERARCHY_JSON,
  v.GRADE_ID,
  v.GRADE_DISPLAY,
  v.POSITION_GUID,
  v.POSITION_DISPLAY,
  v.ACTIVE_FLAG,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

/**
 * Map a PAY.V_PAY_ELEMENT_REL_RULES row to the public API shape.
 * Must run while the Oracle connection is still open if hierarchy is a Lob.
 * @param {Record<string, unknown>} row
 */
export async function mapPayElementRelRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];
  const num = (key) => toNumberOrNull(g(key));
  const str = (key) => toStringOrNull(g(key));
  const guid = (key) => mapGuidField(g(key));

  const orgUnitFields = await resolveOrgUnitApiFields({
    orgUnitId: g('ORG_UNIT_ID'),
    orgUnitGuid: g('ORG_UNIT_GUID'),
    orgUnitDisplay: g('ORG_UNIT_DISPLAY'),
    hierarchyJson: g('ORG_UNIT_HIERARCHY_JSON')
  });

  return {
    rule_id: num('RULE_ID'),
    rule_guid: guid('RULE_GUID'),
    element_id: num('ELEMENT_ID'),
    element_guid: guid('ELEMENT_GUID'),
    element_code: str('ELEMENT_CODE'),
    element_name: str('ELEMENT_NAME'),
    element_description: str('ELEMENT_DESCRIPTION'),
    category_code: str('CATEGORY_CODE'),
    classification_code: str('CLASSIFICATION_CODE'),
    secondary_classification: str('SECONDARY_CLASSIFICATION'),
    legislative_data_group: str('LEGISLATIVE_DATA_GROUP'),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    enterprise_id: num('ENTERPRISE_ID'),
    scope_configuration_code: str('SCOPE_CONFIGURATION_CODE'),
    scope_configuration_name: str('SCOPE_CONFIGURATION_NAME'),
    payroll_id: num('PAYROLL_ID'),
    payroll_display: str('PAYROLL_DISPLAY'),
    ...orgUnitFields,
    grade_id: num('GRADE_ID'),
    grade_display: str('GRADE_DISPLAY'),
    position_guid: guid('POSITION_GUID'),
    position_display: str('POSITION_DISPLAY'),
    active_flag: str('ACTIVE_FLAG'),
    created_by: str('CREATED_BY'),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: str('LAST_UPDATED_BY'),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

async function mapViewRows(rows) {
  return Promise.all((rows || []).map(mapPayElementRelRuleViewRow));
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

  return withViewConnection(async (connection) => {
    const [countResult, dataResult] = await Promise.all([
      executeView(connection, countSql, binds),
      executeView(connection, dataSql, {
        ...binds,
        skip_rows: skipRows,
        fetch_next: filters.limit
      })
    ]);

    return {
      rows: await mapViewRows(dataResult.rows),
      total: readScalarCount(countResult)
    };
  }, 'listPayElementRelRulesFromView');
}

export async function getPayElementRelRuleFromViewByGuid(ruleGuidHex, enterpriseId = null) {
  const whereParts = ['UPPER(TRIM(v.RULE_GUID)) = :rule_guid'];
  const binds = { rule_guid: normalizeRuleGuidHex(ruleGuidHex) };
  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  return withViewConnection(async (connection) => {
    const result = await executeView(connection, sql, binds);
    const row = result.rows?.[0];
    return row ? mapPayElementRelRuleViewRow(row) : null;
  }, 'getPayElementRelRuleFromViewByGuid');
}

export async function resolvePayElementRelRuleByGuid(ruleGuidHex, enterpriseId = null) {
  const fromView = await getPayElementRelRuleFromViewByGuid(ruleGuidHex, enterpriseId);
  if (fromView) return fromView;
  return getPayElementRelRuleHeaderFromTable(ruleGuidHex, enterpriseId);
}
