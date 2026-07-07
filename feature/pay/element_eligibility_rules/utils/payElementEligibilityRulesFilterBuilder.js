/**
 * @param {object} filters
 */
export function buildPayElementEligibilityRuleListWhereClause(filters) {
  const whereParts = ['1 = 1'];
  const binds = {};

  if (filters.enterprise_id != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = filters.enterprise_id;
  }

  if (filters.eligibility_rule_guid != null) {
    whereParts.push('v.ELIGIBILITY_RULE_GUID = :eligibility_rule_guid');
    binds.eligibility_rule_guid = String(filters.eligibility_rule_guid).trim().toUpperCase();
  }

  if (filters.status != null) {
    whereParts.push('v.STATUS = :status');
    binds.status = String(filters.status).trim().toUpperCase();
  }

  if (filters.effective_end_date != null) {
    whereParts.push('TRUNC(v.EFFECTIVE_END_DATE) = TO_DATE(:effective_end_date, \'YYYY-MM-DD\')');
    binds.effective_end_date = String(filters.effective_end_date).trim();
  }

  if (filters.search != null) {
    whereParts.push('UPPER(v.RULE_NAME) LIKE :search');
    binds.search = `%${String(filters.search).trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}
