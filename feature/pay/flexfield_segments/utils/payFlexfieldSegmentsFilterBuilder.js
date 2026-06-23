import { strOrNull } from '../../../../utils/oraclePackageUtils.js';

const SORT_COLUMNS = Object.freeze({
  segment_name: 'SEGMENT_NAME',
  segment_code: 'SEGMENT_CODE',
  display_sequence: 'DISPLAY_SEQUENCE',
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
export function buildFlexfieldSegmentListWhereClause(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.segment_guid != null) {
    whereParts.push('v.SEGMENT_GUID = :segment_guid');
    binds.segment_guid = String(filters.segment_guid).trim().toUpperCase();
  }

  if (filters.segment_name != null) {
    whereParts.push('UPPER(v.SEGMENT_NAME) LIKE :segment_name');
    binds.segment_name = `%${String(filters.segment_name).trim().toUpperCase()}%`;
  }

  if (filters.segment_code != null) {
    whereParts.push('UPPER(v.SEGMENT_CODE) = :segment_code');
    binds.segment_code = String(filters.segment_code).trim().toUpperCase();
  }

  if (filters.data_type != null) {
    whereParts.push('v.DATA_TYPE = :data_type');
    binds.data_type = String(filters.data_type).trim().toUpperCase();
  }

  if (filters.enabled_flag != null) {
    whereParts.push('v.ENABLED_FLAG = :enabled_flag');
    binds.enabled_flag = filters.enabled_flag;
  }

  if (filters.required_flag != null) {
    whereParts.push('v.REQUIRED_FLAG = :required_flag');
    binds.required_flag = filters.required_flag;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds,
    sortColumn: resolveSortColumn(filters.sort_by),
    sortOrder: parseSortOrder(filters.sort_order, 'ASC')
  };
}

export { strOrNull };
