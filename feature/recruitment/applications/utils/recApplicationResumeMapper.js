import { normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { normalizeYnFlag, safeFiniteNumber, strOrNull } from './recApplicationRowUtils.js';

/** Relative download path (no query string; enterprise_id passed when calling the API). */
export const APPLICATION_RESUME_URL_PREFIX = '/api/recruitment/applications';

/**
 * @param {string|null|undefined} applicationGuidHex
 * @returns {string|null}
 */
export function buildApplicationResumeUrl(applicationGuidHex) {
  const guid = normalizeApiGuidString(applicationGuidHex) ?? strOrNull(applicationGuidHex);
  if (!guid) return null;
  return `${APPLICATION_RESUME_URL_PREFIX}/${guid}/resume`;
}

/**
 * @param {Record<string, unknown>} m — lower-case row map
 * @returns {'Y'|'N'}
 */
export function resolveHasResumeFlag(m) {
  const fromView = normalizeYnFlag(m.has_resume);
  if (fromView === 'Y' || fromView === 'N') return fromView;

  const fileName = strOrNull(m.resume_file_name);
  const fileSize = safeFiniteNumber(m.resume_file_size);
  if (fileName || (fileSize != null && fileSize > 0)) return 'Y';
  return 'N';
}

/**
 * @param {Record<string, unknown>} m
 * @param {string|null|undefined} applicationGuidHex
 */
export function mapApplicationResumeFields(m, applicationGuidHex) {
  const guid = normalizeApiGuidString(applicationGuidHex ?? m.application_guid) ?? null;
  const has_resume = resolveHasResumeFlag(m);
  const fromViewUrl = strOrNull(m.resume_url);
  const resume_url =
    has_resume === 'Y' ? fromViewUrl ?? buildApplicationResumeUrl(guid) : null;

  return {
    resume_file_name: strOrNull(m.resume_file_name),
    resume_file_type: strOrNull(m.resume_file_type),
    resume_file_size: safeFiniteNumber(m.resume_file_size),
    has_resume,
    resume_url
  };
}
