const SORT_COLUMNS = Object.freeze({
  employee_id: 'EMPLOYEE_ID',
  element_id: 'ELEMENT_ID',
  effective_start_date: 'EFFECTIVE_START_DATE',
  creation_date: 'CREATION_DATE'
});

function parseSortOrder(raw, defaultOrder = 'DESC') {
  const order = String(raw ?? defaultOrder).trim().toUpperCase();
  return order === 'ASC' ? 'ASC' : 'DESC';
}

function resolveSortColumn(raw, fallback = 'creation_date') {
  const key = String(raw ?? fallback).trim().toLowerCase();
  return SORT_COLUMNS[key] ?? SORT_COLUMNS[fallback];
}

/**
 * @param {object} filters
 * @returns {{ whereSql: string, binds: Record<string, unknown>, sortColumn: string, sortOrder: string }}
 */
export function buildPayElementEntriesListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.employee_id != null) {
    whereParts.push('v.EMPLOYEE_ID = :employee_id');
    binds.employee_id = filters.employee_id;
  }

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.payroll_id != null) {
    whereParts.push('v.PAYROLL_ID = :payroll_id');
    binds.payroll_id = filters.payroll_id;
  }

  if (filters.approval_status_code != null) {
    whereParts.push('v.STATUS = :approval_status_code');
    binds.approval_status_code = filters.approval_status_code;
  }

  if (filters.effective_start_date != null) {
    whereParts.push('v.EFFECTIVE_START_DATE >= TO_DATE(:effective_start_date, \'YYYY-MM-DD\')');
    binds.effective_start_date = filters.effective_start_date;
  }

  if (filters.effective_end_date != null) {
    whereParts.push(
      '(v.EFFECTIVE_END_DATE IS NULL OR v.EFFECTIVE_END_DATE <= TO_DATE(:effective_end_date, \'YYYY-MM-DD\'))'
    );
    binds.effective_end_date = filters.effective_end_date;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds,
    sortColumn: resolveSortColumn(filters.sort_by),
    sortOrder: parseSortOrder(filters.sort_order, 'DESC')
  };
}
