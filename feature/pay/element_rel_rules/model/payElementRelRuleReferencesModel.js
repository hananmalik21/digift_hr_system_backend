import {
  executeViewQuery,
  mapGuidField,
  normalizeRuleGuidHex,
  toNumberOrNull
} from '../utils/payElementRelRulesViewUtils.js';

const TABLE = 'PAY.PAY_ELEMENT_REL_RULES';

function mapTableHeaderRow(row) {
  const ruleId = toNumberOrNull(row?.RULE_ID ?? row?.rule_id);
  const enterpriseId = toNumberOrNull(row?.ENTERPRISE_ID ?? row?.enterprise_id);
  const ruleGuid = mapGuidField(row?.RULE_GUID ?? row?.rule_guid);
  if (ruleId == null || enterpriseId == null) return null;
  return { rule_id: ruleId, rule_guid: ruleGuid, enterprise_id: enterpriseId };
}

/**
 * Fallback lookup when the view does not return a row.
 * @param {string} ruleGuidHex
 * @param {number|null} [enterpriseId]
 */
export async function getPayElementRelRuleHeaderFromTable(ruleGuidHex, enterpriseId = null) {
  const whereParts = ['UPPER(RAWTOHEX(R.RULE_GUID)) = :rule_guid'];
  const binds = { rule_guid: normalizeRuleGuidHex(ruleGuidHex) };
  if (enterpriseId != null) {
    whereParts.push('R.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT R.RULE_ID,
       UPPER(RAWTOHEX(R.RULE_GUID)) AS RULE_GUID,
       R.ENTERPRISE_ID
  FROM ${TABLE} R
 WHERE ${whereParts.join(' AND ')}`.trim();

  const result = await executeViewQuery(sql, binds, 'getPayElementRelRuleHeaderFromTable');
  return mapTableHeaderRow(result.rows?.[0]);
}
