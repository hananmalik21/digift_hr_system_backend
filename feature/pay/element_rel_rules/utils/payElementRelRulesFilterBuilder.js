const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  scope_configuration_code: 'SCOPE_CONFIGURATION_CODE',
  payroll_display: 'PAYROLL_DISPLAY',
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
export function buildPayElementRelRuleListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.scope_configuration_code != null) {
    whereParts.push('UPPER(v.SCOPE_CONFIGURATION_CODE) = :scope_configuration_code');
    binds.scope_configuration_code = String(filters.scope_configuration_code).trim().toUpperCase();
  }

  if (filters.payroll_id != null) {
    whereParts.push('v.PAYROLL_ID = :payroll_id');
    binds.payroll_id = filters.payroll_id;
  }

  if (filters.org_unit_id != null) {
    whereParts.push('UPPER(v.ORG_UNIT_GUID) = :org_unit_id');
    binds.org_unit_id = String(filters.org_unit_id).trim().toUpperCase();
  }

  if (filters.grade_id != null) {
    whereParts.push('v.GRADE_ID = :grade_id');
    binds.grade_id = filters.grade_id;
  }

  if (filters.position_id != null) {
    whereParts.push('UPPER(v.POSITION_GUID) = :position_id');
    binds.position_id = String(filters.position_id).trim().toUpperCase();
  }

  if (filters.active_flag != null) {
    whereParts.push('UPPER(v.ACTIVE_FLAG) = :active_flag');
    binds.active_flag = String(filters.active_flag).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.ELEMENT_DESCRIPTION) LIKE :search
      OR UPPER(v.SCOPE_CONFIGURATION_CODE) LIKE :search
      OR UPPER(v.SCOPE_CONFIGURATION_NAME) LIKE :search
      OR UPPER(v.PAYROLL_DISPLAY) LIKE :search
      OR UPPER(v.ORG_UNIT_DISPLAY) LIKE :search
      OR UPPER(v.GRADE_DISPLAY) LIKE :search
      OR UPPER(v.POSITION_DISPLAY) LIKE :search
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
