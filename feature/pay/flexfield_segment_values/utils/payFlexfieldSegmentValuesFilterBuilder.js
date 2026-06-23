const SORT_COLUMNS = Object.freeze({
  value_code: 'VALUE_CODE',
  value_name: 'VALUE_NAME',
  creation_date: 'CREATION_DATE'
});

function parseSortOrder(raw, defaultOrder = 'ASC') {
  const order = String(raw ?? defaultOrder).trim().toUpperCase();
  return order === 'DESC' ? 'DESC' : 'ASC';
}

function resolveSortColumn(raw, fallback = 'value_code') {
  const key = String(raw ?? fallback).trim().toLowerCase();
  return SORT_COLUMNS[key] ?? SORT_COLUMNS[fallback];
}

/**
 * @param {object} filters
 * @returns {{ whereSql: string, binds: Record<string, unknown>, sortColumn: string, sortOrder: string }}
 */
export function buildFlexfieldSegmentValueListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.segment_code != null) {
    whereParts.push('UPPER(v.SEGMENT_CODE) = :segment_code');
    binds.segment_code = String(filters.segment_code).trim().toUpperCase();
  }

  if (filters.segment_guid != null) {
    whereParts.push('v.SEGMENT_GUID = :segment_guid');
    binds.segment_guid = String(filters.segment_guid).trim().toUpperCase();
  }

  if (filters.value_code != null) {
    whereParts.push('UPPER(v.VALUE_CODE) = :value_code');
    binds.value_code = String(filters.value_code).trim().toUpperCase();
  }

  if (filters.value_name != null) {
    whereParts.push('UPPER(v.VALUE_NAME) LIKE :value_name');
    binds.value_name = `%${String(filters.value_name).trim().toUpperCase()}%`;
  }

  if (filters.enabled_flag != null) {
    whereParts.push('v.ENABLED_FLAG = :enabled_flag');
    binds.enabled_flag = filters.enabled_flag;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds,
    sortColumn: resolveSortColumn(filters.sort_by),
    sortOrder: parseSortOrder(filters.sort_order, 'ASC')
  };
}
