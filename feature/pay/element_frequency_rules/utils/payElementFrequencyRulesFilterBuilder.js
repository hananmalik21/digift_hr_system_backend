const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  frequency_type_code: 'FREQUENCY_TYPE_CODE',
  effective_date: 'EFFECTIVE_DATE',
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
export function buildPayElementFrequencyRuleListWhereClause(filters) {
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

  if (filters.frequency_type_code != null) {
    whereParts.push('UPPER(v.FREQUENCY_TYPE_CODE) = :frequency_type_code');
    binds.frequency_type_code = String(filters.frequency_type_code).trim().toUpperCase();
  }

  if (filters.effective_date != null) {
    whereParts.push("TRUNC(v.EFFECTIVE_DATE) = TO_DATE(:effective_date, 'YYYY-MM-DD')");
    binds.effective_date = String(filters.effective_date).trim();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.FREQUENCY_TYPE_CODE) LIKE :search
      OR UPPER(v.FREQUENCY_FORMULA) LIKE :search
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
