import {
  asObject,
  parseHexGuidParam,
  requireNonBlankString,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';

export function parsePoolGuidParam(value) {
  return parseHexGuidParam(value, {
    requiredMessage: 'pool_guid is required',
    invalidMessage: 'pool_guid must be a valid 32-character hex GUID'
  });
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreatePoolBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireNonBlankString(errors, b, 'pool_name');
  requireNonBlankString(errors, b, 'created_by');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} poolGuid
 */
export function validateUpdatePoolBody(body, poolGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireNonBlankString(errors, b, 'pool_name');
  requireNonBlankString(errors, b, 'updated_by');
  validateHexGuidInErrors(errors, poolGuid, 'pool_guid');

  throwIfValidationErrors(errors);
}

/**
 * @param {unknown} pools
 * @param {string[]} errors
 */
function validatePoolsArray(pools, errors) {
  if (!Array.isArray(pools)) {
    errors.push('pools must be an array');
    return;
  }

  pools.forEach((item, index) => {
    const row = item && typeof item === 'object' && !Array.isArray(item) ? item : null;
    validateHexGuidInErrors(errors, row?.pool_guid, `pools[${index}].pool_guid`);
  });
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} candidateGuid
 */
export function validateSyncCandidatePoolsBody(body, candidateGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireNonBlankString(errors, b, 'updated_by');
  validatePoolsArray(b.pools, errors);
  validateHexGuidInErrors(errors, candidateGuid, 'candidate_guid');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [poolGuid]
 */
export function validateDeletePoolBody(body, poolGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireNonBlankString(errors, b, 'deleted_by');
  validateHexGuidInErrors(errors, poolGuid ?? b.pool_guid, 'pool_guid');

  throwIfValidationErrors(errors);
}
