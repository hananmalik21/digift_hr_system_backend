const SORT_COLUMNS = Object.freeze({
  input_value_name: 'INPUT_VALUE_NAME',
  display_sequence: 'DISPLAY_SEQUENCE',
  element_code: 'ELEMENT_CODE',
  creation_date: 'CREATION_DATE'
});

function parseSortOrder(raw, defaultOrder = 'ASC') {
  const order = String(raw ?? defaultOrder).trim().toUpperCase();
  return order === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortColumn(raw, fallback = 'display_sequence') {
  const key = String(raw ?? fallback).trim().toLowerCase();
  return SORT_COLUMNS[key] ?? SORT_COLUMNS[fallback];
}

/**
 * @param {object} filters
 * @returns {{ whereSql: string, binds: Record<string, unknown>, sortColumn: string, sortOrder: string }}
 */
export function buildPayElementInputValueListWhereClause(filters) {
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

  if (filters.status != null) {
    whereParts.push('UPPER(v.STATUS) = :status');
    binds.status = String(filters.status).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(`(
      UPPER(v.ELEMENT_CODE) LIKE :search
      OR UPPER(v.ELEMENT_NAME) LIKE :search
      OR UPPER(v.INPUT_VALUE_NAME) LIKE :search
      OR UPPER(v.DATA_TYPE_CODE) LIKE :search
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
