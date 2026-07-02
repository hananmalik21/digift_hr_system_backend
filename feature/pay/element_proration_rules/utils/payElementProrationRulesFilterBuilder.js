const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  proration_method_code: 'PRORATION_METHOD_CODE',
  effective_date_rule: 'EFFECTIVE_DATE_RULE',
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
export function buildPayElementProrationRuleListWhereClause(filters) {
  const whereParts = ['1 = 1'];
  const binds = {};

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.element_guid != null) {
    whereParts.push('UPPER(v.ELEMENT_GUID) = :element_guid');
    binds.element_guid = String(filters.element_guid).trim().toUpperCase();
  }

  if (filters.element_code != null) {
    whereParts.push('UPPER(v.ELEMENT_CODE) = :element_code');
    binds.element_code = String(filters.element_code).trim().toUpperCase();
  }

  if (filters.element_name != null) {
    whereParts.push('UPPER(v.ELEMENT_NAME) LIKE :element_name');
    binds.element_name = `%${String(filters.element_name).trim().toUpperCase()}%`;
  }

  if (filters.proration_method_code != null) {
    whereParts.push('UPPER(v.PRORATION_METHOD_CODE) = :proration_method_code');
    binds.proration_method_code = String(filters.proration_method_code).trim().toUpperCase();
  }

  if (filters.effective_date_rule != null) {
    whereParts.push('UPPER(v.EFFECTIVE_DATE_RULE) = :effective_date_rule');
    binds.effective_date_rule = String(filters.effective_date_rule).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.PRORATION_METHOD_CODE) LIKE :search
      OR UPPER(v.PRORATION_FORMULA) LIKE :search
      OR UPPER(v.EFFECTIVE_DATE_RULE) LIKE :search
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
