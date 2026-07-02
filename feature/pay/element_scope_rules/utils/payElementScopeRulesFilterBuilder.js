const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  scope_level_code: 'SCOPE_LEVEL_CODE',
  payroll_code: 'PAYROLL_CODE',
  creation_date: 'CREATION_DATE'
});

function parseSortOrder(raw, defaultOrder = 'ASC') {
  const order = String(raw ?? defaultOrder).trim().toUpperCase();
  return order === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortColumn(raw, fallback = 'element_code') {
  const key = String(raw ?? fallback).trim().toLowerCase();
  return SORT_COLUMNS[key] ?? SORT_COLUMNS[fallback];
}

/**
 * @param {object} filters
 */
export function buildPayElementScopeRuleListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.scope_level_code != null) {
    whereParts.push('UPPER(v.SCOPE_LEVEL_CODE) = :scope_level_code');
    binds.scope_level_code = String(filters.scope_level_code).trim().toUpperCase();
  }

  if (filters.payroll_id != null) {
    whereParts.push('v.PAYROLL_ID = :payroll_id');
    binds.payroll_id = filters.payroll_id;
  }

  if (filters.legal_employer_id != null) {
    whereParts.push('v.LEGAL_EMPLOYER_GUID = :legal_employer_id');
    binds.legal_employer_id = String(filters.legal_employer_id).trim().toUpperCase();
  }

  if (filters.org_unit_id != null) {
    whereParts.push('v.ORG_UNIT_GUID = :org_unit_id');
    binds.org_unit_id = String(filters.org_unit_id).trim().toUpperCase();
  }

  if (filters.grade_id != null) {
    whereParts.push('v.GRADE_ID = :grade_id');
    binds.grade_id = filters.grade_id;
  }

  if (filters.position_id != null) {
    whereParts.push('v.POSITION_GUID = :position_id');
    binds.position_id = String(filters.position_id).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.SCOPE_LEVEL_CODE) LIKE :search
      OR UPPER(v.PAYROLL_CODE) LIKE :search
      OR UPPER(v.PAYROLL_NAME) LIKE :search
      OR UPPER(v.LEGAL_EMPLOYER_CODE) LIKE :search
      OR UPPER(v.LEGAL_EMPLOYER_NAME) LIKE :search
      OR UPPER(v.ORG_UNIT_CODE) LIKE :search
      OR UPPER(v.ORG_UNIT_NAME) LIKE :search
      OR UPPER(v.POSITION_CODE) LIKE :search
      OR UPPER(v.POSITION_NAME) LIKE :search
    )`);
    binds.search = `%${String(filters.search).trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds,
    sortColumn: resolveSortColumn(filters.sort_by),
    sortOrder: parseSortOrder(filters.sort_order, 'ASC')
  };
}
