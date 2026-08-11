/**
 * @param {object} filters
 */
export function buildPayElementEligProfileListWhereClause(filters) {
  const whereParts = ['1 = 1'];
  const binds = {};

  if (filters.enterprise_id != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = filters.enterprise_id;
  }

  if (filters.profile_guid != null) {
    whereParts.push('UPPER(v.PROFILE_GUID) = :profile_guid');
    binds.profile_guid = String(filters.profile_guid).trim().toUpperCase();
  }

  if (filters.status != null) {
    whereParts.push('v.STATUS = :status');
    binds.status = String(filters.status).trim().toUpperCase();
  }

  if (filters.search != null) {
    whereParts.push(
      "(UPPER(v.PROFILE_NAME) LIKE :search OR UPPER(NVL(v.PROFILE_CODE, ' ')) LIKE :search OR UPPER(NVL(v.DESCRIPTION, ' ')) LIKE :search)"
    );
    binds.search = `%${String(filters.search).trim().toUpperCase()}%`;
  }

  return {
    whereSql: `WHERE ${whereParts.join(' AND ')}`,
    binds
  };
}
