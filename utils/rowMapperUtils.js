import { toIso, normalizeGuid } from '@digifyhr/common';

export { toIso, normalizeGuid };

export function mapEnterpriseIdField(row) {
  const val = row?.ENTERPRISE_ID ?? row?.enterprise_id;
  return val != null ? Number(val) : null;
}

export function mapLookupValueScope(enterpriseId) {
  return enterpriseId == null ? 'GLOBAL' : 'ENTERPRISE';
}
