/**
 * Map REC.V_JOB_POSTING_EMPLOYER_INFO row → API JSON (no LOGO BLOB).
 */

import {
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from '../../applications/utils/recApplicationRowUtils.js';
import { bufferToHex, normalizeApiGuidString } from '@digifyhr/common';
import { employerInfoLogoPath } from '../../employer_info/utils/recEmployerInfoLogoUrl.js';

function guid(v) {
  if (v == null || v === '') return null;
  const hex = normalizeApiGuidString(v, { uppercase: true }) ?? bufferToHex(v);
  if (hex == null) return null;
  return String(hex).replace(/-/g, '').toUpperCase();
}

function yn(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'Y' || s === 'N') return s;
  if (s === '1' || s === 'TRUE') return 'Y';
  if (s === '0' || s === 'FALSE') return 'N';
  return String(v);
}

function source(v) {
  const s = strOrNull(v);
  if (!s) return null;
  const u = s.toUpperCase();
  return u === 'COMPANY_LEVEL' || u === 'ENTERPRISE_LEVEL' ? u : null;
}

function resolveLogoAvailable(m, employerInfoGuid) {
  if (!employerInfoGuid) return 'N';
  const flagged = yn(m.logo_available);
  if (flagged === 'Y' || flagged === 'N') return flagged;
  const hasMeta =
    (m.logo_file_name != null && String(m.logo_file_name).trim() !== '') ||
    (m.logo_mime_type != null && String(m.logo_mime_type).trim() !== '');
  return hasMeta ? 'Y' : 'N';
}

/**
 * Map REC.V_JOB_POSTING_EMPLOYER_INFO row → API JSON (no LOGO BLOB).
 * logo_url is relative; controller applies withPublicLogoUrls for absolute URLs.
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
export function mapJobPostingEmployerInfoRow(row) {
  const m = rowKeyMap(row);
  const employerInfoGuid = guid(m.employer_info_guid);
  const logoAvailable = resolveLogoAvailable(m, employerInfoGuid);

  return {
    posting_guid: guid(m.posting_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),

    requisition_id: safeFiniteNumber(m.requisition_id),
    requisition_org_unit_id: guid(m.requisition_org_unit_id),
    requisition_found: yn(m.requisition_found) || 'Y',

    company_id: guid(m.company_id),
    company_code: strOrNull(m.company_code),
    company_name: strOrNull(m.company_name),
    company_name_ar: strOrNull(m.company_name_ar),

    employer_info_source: source(m.employer_info_source),
    employer_info_id: safeFiniteNumber(m.employer_info_id),
    employer_info_guid: employerInfoGuid,

    employee_info: strOrNull(m.employee_info),
    information: strOrNull(m.information),
    industry: strOrNull(m.industry),
    about_company: strOrNull(m.about_company),

    logo_available: logoAvailable,
    logo_file_name: employerInfoGuid ? strOrNull(m.logo_file_name) : null,
    logo_mime_type: employerInfoGuid ? strOrNull(m.logo_mime_type) : null,
    logo_url:
      employerInfoGuid && logoAvailable === 'Y'
        ? employerInfoLogoPath(employerInfoGuid)
        : null,

    active_flag: yn(m.active_flag)
  };
}

/**
 * Public API payload (drops internal requisition_found).
 * @param {Record<string, unknown>} mapped
 */
export function toJobPostingEmployerInfoApiData(mapped) {
  if (!mapped) return null;
  const { requisition_found: _ignored, ...data } = mapped;
  return data;
}
