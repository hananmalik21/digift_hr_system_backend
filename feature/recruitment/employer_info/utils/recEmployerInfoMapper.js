import {
  formatDateTimeIso,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from '../../applications/utils/recApplicationRowUtils.js';
import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { employerInfoLogoPath } from './recEmployerInfoLogoUrl.js';

const HEX_32 = /^[0-9A-Fa-f]{32}$/;

function normalizeGuidValue(v) {
  if (v == null || v === '') return null;
  const hex = normalizeApiGuidString(v, { uppercase: true }) ?? bufferToHex(v);
  if (hex == null) return null;
  return String(hex).replace(/-/g, '').toUpperCase();
}

function tryExactHex32(raw) {
  if (raw == null || raw === '') return null;
  const compact = String(raw).trim().replace(/-/g, '');
  return HEX_32.test(compact) ? compact.toUpperCase() : null;
}

/** Employer-info flags may arrive as Y/N or boolean-ish package values. */
function normalizeYnFlag(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  if (s === 'Y' || s === 'N') return s;
  if (s === '1' || s === 'TRUE') return 'Y';
  if (s === '0' || s === 'FALSE') return 'N';
  return String(v);
}

function resolveLogoAvailable(m) {
  const flagged = normalizeYnFlag(m.logo_available);
  if (flagged != null) return flagged;
  const hasMeta =
    (m.logo_file_name != null && String(m.logo_file_name).trim() !== '') ||
    (m.logo_mime_type != null && String(m.logo_mime_type).trim() !== '');
  return hasMeta ? 'Y' : 'N';
}

/**
 * Map one REC.V_EMPLOYER_INFO row to API JSON (no BLOB).
 * logo_url is relative; controllers call withPublicLogoUrls for absolute URLs.
 * @param {Record<string, unknown>} row
 */
export function mapEmployerInfoViewRow(row) {
  const m = rowKeyMap(row);
  const employerInfoGuid = normalizeGuidValue(m.employer_info_guid);
  const logoAvailable = resolveLogoAvailable(m);

  return {
    employer_info_id: safeFiniteNumber(m.employer_info_id),
    employer_info_guid: employerInfoGuid,
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    assignment_type: strOrNull(m.assignment_type)
      ? String(m.assignment_type).trim().toUpperCase()
      : null,

    company_id: normalizeGuidValue(m.company_id),
    company_code: strOrNull(m.company_code),
    company_name: strOrNull(m.company_name),
    company_name_ar: strOrNull(m.company_name_ar),

    employee_info: strOrNull(m.employee_info),
    information: strOrNull(m.information),
    industry: strOrNull(m.industry),
    about_company: strOrNull(m.about_company),

    logo_available: logoAvailable,
    logo_file_name: strOrNull(m.logo_file_name),
    logo_mime_type: strOrNull(m.logo_mime_type),
    logo_url:
      employerInfoGuid && logoAvailable === 'Y'
        ? employerInfoLogoPath(employerInfoGuid)
        : null,

    active_flag: normalizeYnFlag(m.active_flag),
    creation_date: formatDateTimeIso(m.creation_date),
    created_by: strOrNull(m.created_by),
    last_update_date: formatDateTimeIso(m.last_update_date ?? m.last_updated_date),
    last_updated_by: strOrNull(m.last_updated_by)
  };
}

/**
 * @param {unknown} data
 */
export function mapPackageResultData(data) {
  if (data == null) return null;
  if (Array.isArray(data)) {
    return data.map((row) =>
      row && typeof row === 'object' ? mapEmployerInfoViewRow(row) : row
    );
  }
  if (typeof data !== 'object') return data;

  if (data.data != null && typeof data.data === 'object' && !Array.isArray(data.data)) {
    return mapEmployerInfoViewRow(data.data);
  }
  if (
    data.employer_info_guid != null ||
    data.EMPLOYER_INFO_GUID != null ||
    data.employer_info_id != null ||
    data.EMPLOYER_INFO_ID != null
  ) {
    return mapEmployerInfoViewRow(data);
  }
  return data;
}

/**
 * Extract employer_info_guid from package OUT JSON (various key casings / envelopes).
 * @param {unknown} raw
 * @returns {string|null}
 */
export function extractGuidFromPackageResult(raw) {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    try {
      return extractGuidFromPackageResult(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const guid = extractGuidFromPackageResult(item);
      if (guid) return guid;
    }
    return null;
  }

  if (typeof raw !== 'object') return null;

  const candidates = [
    raw.employer_info_guid,
    raw.EMPLOYER_INFO_GUID,
    raw.data?.employer_info_guid,
    raw.data?.EMPLOYER_INFO_GUID,
    raw.result?.employer_info_guid,
    raw.result?.EMPLOYER_INFO_GUID
  ];

  for (const candidate of candidates) {
    const guid = tryExactHex32(candidate);
    if (guid) return guid;
  }
  return null;
}
