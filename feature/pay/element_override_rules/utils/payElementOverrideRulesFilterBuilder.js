const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  max_override_percent: 'MAX_OVERRIDE_PERCENT',
  max_override_amount: 'MAX_OVERRIDE_AMOUNT',
  approval_required_code: 'APPROVAL_REQUIRED_CODE',
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
 * @returns {{ whereSql: string, binds: Record<string, unknown>, sortColumn: string, sortOrder: string }}
 */
export function buildPayElementOverrideRuleListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.approval_required_code != null) {
    whereParts.push('UPPER(v.APPROVAL_REQUIRED_CODE) = :approval_required_code');
    binds.approval_required_code = String(filters.approval_required_code).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.APPROVAL_REQUIRED_CODE) LIKE :search
      OR UPPER(v.CLASSIFICATION_CODE) LIKE :search
      OR UPPER(v.CATEGORY_CODE) LIKE :search
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
