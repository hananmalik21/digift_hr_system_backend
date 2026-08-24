/**
 * Map REC.V_REQUISITION_COMPANY_INFO row → nested API JSON (snake_case).
 */

import {
  normalizeGuidValue,
  normalizeYnFlag,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from '../../applications/utils/recApplicationRowUtils.js';

function guid(v) {
  const hex = normalizeGuidValue(v);
  if (hex == null) return null;
  return String(hex).replace(/-/g, '').toUpperCase();
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{
 *   requisition: Record<string, unknown>,
 *   company: Record<string, unknown>
 * }}
 */
export function mapRequisitionCompanyInfoRow(row) {
  const m = rowKeyMap(row);

  return {
    requisition: {
      requisition_id: safeFiniteNumber(m.requisition_id),
      requisition_guid: guid(m.requisition_guid),
      requisition_number: strOrNull(m.requisition_number),
      requisition_title: strOrNull(m.requisition_title),
      enterprise_id: safeFiniteNumber(m.enterprise_id),
      org_unit: {
        org_unit_id: guid(m.requisition_org_unit_id),
        level_code: strOrNull(m.requisition_org_level_code),
        code: strOrNull(m.requisition_org_unit_code),
        name_en: strOrNull(m.requisition_org_unit_name_en),
        name_ar: strOrNull(m.requisition_org_unit_name_ar)
      }
    },
    company: {
      company_id: guid(m.company_id),
      company_code: strOrNull(m.company_code),
      company_name_en: strOrNull(m.company_name_en),
      company_name_ar: strOrNull(m.company_name_ar),
      level_code: strOrNull(m.company_level_code),
      status: strOrNull(m.company_status),
      is_active: normalizeYnFlag(m.company_is_active),
      legal_employer: normalizeYnFlag(m.legal_employer),
      currency_code: strOrNull(m.currency_code),
      manager: {
        name: strOrNull(m.company_manager_name),
        email: strOrNull(m.company_manager_email),
        phone: strOrNull(m.company_manager_phone)
      },
      location: {
        location: strOrNull(m.company_location),
        city: strOrNull(m.company_city),
        address: strOrNull(m.company_address)
      },
      description: strOrNull(m.company_description)
    }
  };
}
