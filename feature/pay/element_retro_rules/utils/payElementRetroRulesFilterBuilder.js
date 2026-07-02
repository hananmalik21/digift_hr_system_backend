const SORT_COLUMNS = Object.freeze({
  element_code: 'ELEMENT_CODE',
  enable_retro_flag: 'ENABLE_RETRO_FLAG',
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
export function buildPayElementRetroRuleListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.element_id != null) {
    whereParts.push('v.ELEMENT_ID = :element_id');
    binds.element_id = filters.element_id;
  }

  if (filters.element_guid != null) {
    whereParts.push('v.ELEMENT_GUID = :element_guid');
    binds.element_guid = String(filters.element_guid).trim().toUpperCase();
  }

  if (filters.classification_code != null) {
    whereParts.push('UPPER(v.CLASSIFICATION_CODE) = :classification_code');
    binds.classification_code = String(filters.classification_code).trim().toUpperCase();
  }

  if (filters.category_code != null) {
    whereParts.push('UPPER(v.CATEGORY_CODE) = :category_code');
    binds.category_code = String(filters.category_code).trim().toUpperCase();
  }

  if (filters.enable_retro_flag != null) {
    whereParts.push('v.ENABLE_RETRO_FLAG = :enable_retro_flag');
    binds.enable_retro_flag = String(filters.enable_retro_flag).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
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
