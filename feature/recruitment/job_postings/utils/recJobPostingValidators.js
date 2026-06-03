import {
  asObject,
  isBlank,
  parseHexGuidParam,
  requireNonBlankString,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors,
  validateOptionalYnInErrors
} from '../../shared/recValidationUtils.js';

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 */
function validateOptionalBulletListInErrors(errors, body, field) {
  const value = body[field];
  if (value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) return;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value.trim());
      if (Array.isArray(parsed)) return;
    } catch (_) {}
  }
  errors.push(`${field} must be an array of strings or a JSON array string`);
}

const POSTING_GUID_MESSAGES = {
  requiredMessage: 'posting_guid is required',
  invalidMessage: 'posting_guid must be a valid 32-character hex GUID'
};

const REQUISITION_GUID_MESSAGES = {
  requiredMessage: 'requisition_guid is required',
  invalidMessage: 'requisition_guid must be a valid 32-character hex GUID'
};

export function parsePostingGuidParam(value) {
  return parseHexGuidParam(value, POSTING_GUID_MESSAGES);
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {string|null}
 */
export function parseRequisitionGuidFromQuery(query) {
  if (isBlank(query?.requisition_guid)) return null;
  return parseHexGuidParam(query.requisition_guid, REQUISITION_GUID_MESSAGES);
}

/**
 * @param {string} postingGuid
 * @param {unknown} enterpriseIdRaw
 */
export function validateGuidEnterpriseParams(postingGuid, enterpriseIdRaw) {
  const errors = [];
  validateHexGuidInErrors(errors, postingGuid, 'posting_guid');
  const body = { enterprise_id: enterpriseIdRaw };
  requirePositiveEnterpriseId(errors, body);
  throwIfValidationErrors(errors);
  const enterprise_id = Number(enterpriseIdRaw);
  return { posting_guid: postingGuid, enterprise_id };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateJobPostingBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, b.requisition_guid, 'requisition_guid');
  requireNonBlankString(errors, b, 'posting_title');
  requireNonBlankString(errors, b, 'created_by');
  validateOptionalYnInErrors(errors, b, 'internal_site_flag');
  validateOptionalYnInErrors(errors, b, 'external_site_flag');
  validateOptionalYnInErrors(errors, b, 'linkedin_flag');
  validateOptionalBulletListInErrors(errors, b, 'responsibilities');
  validateOptionalBulletListInErrors(errors, b, 'qualifications');

  if (!isBlank(b.start_date) && Number.isNaN(new Date(b.start_date).getTime())) {
    errors.push('start_date must be a valid date');
  }
  if (!isBlank(b.end_date) && Number.isNaN(new Date(b.end_date).getTime())) {
    errors.push('end_date must be a valid date');
  }

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} postingGuid
 */
export function validateUpdateJobPostingBody(body, postingGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, postingGuid, 'posting_guid');
  requireNonBlankString(errors, b, 'last_updated_by');
  validateOptionalYnInErrors(errors, b, 'internal_site_flag');
  validateOptionalYnInErrors(errors, b, 'external_site_flag');
  validateOptionalYnInErrors(errors, b, 'linkedin_flag');
  validateOptionalBulletListInErrors(errors, b, 'responsibilities');
  validateOptionalBulletListInErrors(errors, b, 'qualifications');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} postingGuid
 * @param {string} actorField
 */
export function validateLifecycleBody(body, postingGuid, actorField) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, postingGuid, 'posting_guid');
  requireNonBlankString(errors, b, actorField);

  throwIfValidationErrors(errors);
}

/**
 * @param {string} postingGuid
 * @param {unknown} enterpriseIdRaw
 */
export function validateDeleteJobPostingParams(postingGuid, enterpriseIdRaw) {
  const errors = [];
  validateHexGuidInErrors(errors, postingGuid, 'posting_guid');
  requirePositiveEnterpriseId(errors, { enterprise_id: enterpriseIdRaw });
  throwIfValidationErrors(errors);
}
