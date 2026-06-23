const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  element_name: 'ELEMENT_NAME',
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
export function buildPayElementsListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.element_code != null) {
    whereParts.push('UPPER(v.ELEMENT_CODE) = :element_code');
    binds.element_code = String(filters.element_code).trim().toUpperCase();
  }

  if (filters.element_name != null) {
    whereParts.push('UPPER(v.ELEMENT_NAME) LIKE :element_name');
    binds.element_name = `%${String(filters.element_name).trim().toUpperCase()}%`;
  }

  if (filters.category_code != null) {
    whereParts.push('UPPER(v.CATEGORY_CODE) = :category_code');
    binds.category_code = String(filters.category_code).trim().toUpperCase();
  }

  if (filters.classification_code != null) {
    whereParts.push('UPPER(v.CLASSIFICATION_CODE) = :classification_code');
    binds.classification_code = String(filters.classification_code).trim().toUpperCase();
  }

  if (filters.recurring_flag != null) {
    whereParts.push('v.RECURRING_FLAG = :recurring_flag');
    binds.recurring_flag = filters.recurring_flag;
  }

  if (filters.costable_flag != null) {
    whereParts.push('v.COSTABLE_FLAG = :costable_flag');
    binds.costable_flag = filters.costable_flag;
  }

  if (filters.taxable_flag != null) {
    whereParts.push('v.TAXABLE_FLAG = :taxable_flag');
    binds.taxable_flag = filters.taxable_flag;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds,
    sortColumn: resolveSortColumn(filters.sort_by),
    sortOrder: parseSortOrder(filters.sort_order, 'ASC')
  };
}
