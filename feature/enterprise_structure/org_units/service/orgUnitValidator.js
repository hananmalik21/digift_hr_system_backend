import OrgUnitModel from '../model/orgUnitModel.js';

/**
 * Org Unit Validator Service
 * Centralizes validation logic for parent org units and level hierarchy.
 */

/**
 * Normalize parent ID from request data (handles empty strings, trim)
 * @param {Object} data - Request body
 * @returns {string|null}
 */
export function normalizeParentId(data) {
  let parentId = data?.parent_org_unit_id ?? data?.PARENT_ORG_UNIT_ID ?? null;
  if (parentId && typeof parentId === 'string') {
    parentId = parentId.trim();
    if (parentId === '') parentId = null;
  }
  return parentId ?? null;
}

/**
 * Validate parent org unit for create/update.
 * @param {Object} params
 * @param {string} params.structureId - Structure ID
 * @param {string} params.levelCode - Current org unit level code
 * @param {string|null} params.parentId - Proposed parent org unit ID
 * @param {Function} params.getParentLevelCode - Resolver's getParentLevelCode
 * @param {Array} params.levelsOrdered - Resolver's levelsOrdered for error messages
 * @param {Object} params.parent - Fetched parent org unit (for non-root level, when parentId provided)
 * @throws {Error} With .message and optional .code
 */
export function validateParentForLevel({ structureId, levelCode, parentId, getParentLevelCode, levelsOrdered, parent }) {
  const expectedParentLevel = getParentLevelCode(levelCode);

  if (expectedParentLevel === null) {
    // Root level - parent must be null
    if (parentId !== null) {
      const err = new Error('parent_org_unit_id must be null for root level');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    return;
  }

  // Non-root level requires a parent
  if (parentId === null) {
    const err = new Error(`parent_org_unit_id is required for level '${levelCode}'`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!parent) {
    const err = new Error(`Parent org unit with ID ${parentId} not found`);
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const parentLevel = parent.level_code || parent.LEVEL_CODE;
  const parentLevelUpper = (parentLevel || '').toUpperCase().trim();
  const expectedParentLevelUpper = (expectedParentLevel || '').toUpperCase().trim();

  if (parentLevelUpper !== expectedParentLevelUpper) {
    const availableLevels = levelsOrdered.map(l => l.level_code || l.LEVEL_CODE).join(', ');
    const err = new Error(
      `Parent org unit validation failed: Current org unit level: '${levelCode}', ` +
      `Expected parent level: '${expectedParentLevel}', Provided parent level: '${parentLevel}'. ` +
      `Available levels in structure: ${availableLevels}`
    );
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const parentIsActive = parent.is_active || parent.IS_ACTIVE;
  if (parentIsActive !== 'Y' && parentIsActive !== true) {
    const err = new Error('Parent org unit must be active');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

/**
 * Validate parent for create - fetches parent if needed
 * @param {Object} params - Same as validateParentForLevel plus resolver
 * @returns {Promise<{ parentId: string|null }>}
 */
export async function validateParentForCreate(resolver, data, structureId) {
  const levelCode = data.level_code || data.LEVEL_CODE;
  const parentId = normalizeParentId(data);

  if (parentId) {
    const parent = await OrgUnitModel.findById(parentId, structureId);
    validateParentForLevel({
      structureId,
      levelCode,
      parentId,
      getParentLevelCode: resolver.getParentLevelCode.bind(resolver),
      levelsOrdered: resolver.levelsOrdered,
      parent
    });
  } else {
    validateParentForLevel({
      structureId,
      levelCode,
      parentId,
      getParentLevelCode: resolver.getParentLevelCode.bind(resolver),
      levelsOrdered: resolver.levelsOrdered,
      parent: null
    });
  }
  return { parentId };
}

/**
 * Validate parent for update - fetches parent if needed, mutates data.parent_org_unit_id
 * @param {Object} params
 * @param {Object} params.existingOrgUnit - Current org unit
 * @param {Object} params.data - Request body (mutated with normalized parent_org_unit_id)
 * @param {Object} params.resolver - StructureResolverService result
 * @param {string} params.structureId
 */
export async function validateParentForUpdate({ existingOrgUnit, data, resolver, structureId }) {
  if (data.parent_org_unit_id === undefined && data.PARENT_ORG_UNIT_ID === undefined) return;

  const levelCode = existingOrgUnit.level_code || existingOrgUnit.LEVEL_CODE;
  let newParentId = normalizeParentId(data);

  let parent = null;
  if (newParentId) {
    parent = await OrgUnitModel.findById(newParentId, structureId);
  }

  const expectedParentLevel = resolver.getParentLevelCode(levelCode);
  if (expectedParentLevel === null) {
    if (newParentId !== null) {
      const err = new Error('parent_org_unit_id must be null for root level');
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  } else {
    if (newParentId === null) {
      const err = new Error(`parent_org_unit_id is required for level '${levelCode}'`);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    validateParentForLevel({
      structureId,
      levelCode,
      parentId: newParentId,
      getParentLevelCode: resolver.getParentLevelCode.bind(resolver),
      levelsOrdered: resolver.levelsOrdered,
      parent
    });
  }

  data.parent_org_unit_id = newParentId;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj ?? {}, key);
}

function getValue(obj, lowerKey, upperKey) {
  if (hasOwn(obj, lowerKey)) return obj[lowerKey];
  if (hasOwn(obj, upperKey)) return obj[upperKey];
  return undefined;
}

function isMeaningfulNonNullString(value) {
  if (value === undefined || value === null) return false;
  return String(value).trim() !== '';
}

/**
 * Parse legal_employer input for COMPANY-level payloads.
 * @returns {('Y'|'N'|null|undefined)}
 */
export function parseCompanyLegalEmployer(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim().toUpperCase();
  if (s === '') return null;
  if (s !== 'Y' && s !== 'N') {
    const err = new Error('legal_employer must be Y or N');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return s;
}

/**
 * Parse currency_code input for COMPANY-level payloads.
 * @returns {(string|null|undefined)}
 */
export function parseCompanyCurrencyCode(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim().toUpperCase();
  if (s === '') return null;
  if (!/^[A-Z]{3}$/.test(s)) {
    const err = new Error('currency_code must be a 3-letter currency code');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return s;
}

const COMPANY_FIELDS_ALLOWED_MESSAGE = 'legal_employer and currency_code are allowed only for COMPANY level';

/**
 * COMPANY-only fields validation (CREATE).
 * Mutates `data` to normalized values when inputs are provided.
 */
export function validateCompanyLegalEmployerCurrencyOnCreate({ levelCode, data }) {
  const levelUpper = String(levelCode ?? '').trim().toUpperCase();
  const isCompany = levelUpper === 'COMPANY';

  const legalProvided = hasOwn(data, 'legal_employer') || hasOwn(data, 'LEGAL_EMPLOYER');
  const currencyProvided = hasOwn(data, 'currency_code') || hasOwn(data, 'CURRENCY_CODE');

  const legalRaw = getValue(data, 'legal_employer', 'LEGAL_EMPLOYER');
  const currencyRaw = getValue(data, 'currency_code', 'CURRENCY_CODE');

  if (!isCompany) {
    const hasMeaningfulLegal = legalProvided && isMeaningfulNonNullString(legalRaw);
    const hasMeaningfulCurrency = currencyProvided && isMeaningfulNonNullString(currencyRaw);

    if (hasMeaningfulLegal || hasMeaningfulCurrency) {
      const err = new Error(COMPANY_FIELDS_ALLOWED_MESSAGE);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // If client explicitly provided null/blank, normalize to null and clear uppercase keys.
    if (legalProvided) {
      data.legal_employer = null;
      delete data.LEGAL_EMPLOYER;
    }
    if (currencyProvided) {
      data.currency_code = null;
      delete data.CURRENCY_CODE;
    }
    return;
  }

  // COMPANY-level: validate & normalize only when fields are provided.
  if (legalProvided) {
    data.legal_employer = parseCompanyLegalEmployer(legalRaw);
    delete data.LEGAL_EMPLOYER;
  }
  if (currencyProvided) {
    data.currency_code = parseCompanyCurrencyCode(currencyRaw);
    delete data.CURRENCY_CODE;
  }
}

/**
 * COMPANY-only fields validation (UPDATE).
 * Uses existing org-unit info to enforce non-COMPANY updates.
 * Mutates `data` to normalized values when inputs are provided.
 */
export function validateCompanyLegalEmployerCurrencyOnUpdate({ existingOrgUnit, data }) {
  const existingLevelUpper = String(existingOrgUnit?.level_code ?? existingOrgUnit?.LEVEL_CODE ?? '').trim().toUpperCase();

  const requestedLevelProvided = hasOwn(data, 'level_code') || hasOwn(data, 'LEVEL_CODE');
  const requestedLevelRaw = requestedLevelProvided ? getValue(data, 'level_code', 'LEVEL_CODE') : undefined;
  const effectiveLevelUpper = requestedLevelProvided
    ? String(requestedLevelRaw).trim().toUpperCase()
    : existingLevelUpper;

  const isExistingCompany = existingLevelUpper === 'COMPANY';
  const isEffectiveCompany = effectiveLevelUpper === 'COMPANY';

  const legalProvided = hasOwn(data, 'legal_employer') || hasOwn(data, 'LEGAL_EMPLOYER');
  const currencyProvided = hasOwn(data, 'currency_code') || hasOwn(data, 'CURRENCY_CODE');

  const legalRaw = getValue(data, 'legal_employer', 'LEGAL_EMPLOYER');
  const currencyRaw = getValue(data, 'currency_code', 'CURRENCY_CODE');

  // If switching away from COMPANY, force clear regardless of what was provided.
  if (isExistingCompany && !isEffectiveCompany) {
    data.legal_employer = null;
    data.currency_code = null;
    delete data.LEGAL_EMPLOYER;
    delete data.CURRENCY_CODE;
    return;
  }

  if (!isEffectiveCompany) {
    const hasMeaningfulLegal = legalProvided && isMeaningfulNonNullString(legalRaw);
    const hasMeaningfulCurrency = currencyProvided && isMeaningfulNonNullString(currencyRaw);

    if (hasMeaningfulLegal || hasMeaningfulCurrency) {
      const err = new Error(COMPANY_FIELDS_ALLOWED_MESSAGE);
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    // If client explicitly provided null/blank, normalize to null and clear uppercase keys.
    if (legalProvided) {
      data.legal_employer = null;
      delete data.LEGAL_EMPLOYER;
    }
    if (currencyProvided) {
      data.currency_code = null;
      delete data.CURRENCY_CODE;
    }
    return;
  }

  // COMPANY-level update: validate & normalize only when fields are provided.
  if (legalProvided) {
    data.legal_employer = parseCompanyLegalEmployer(legalRaw);
    delete data.LEGAL_EMPLOYER;
  }
  if (currencyProvided) {
    data.currency_code = parseCompanyCurrencyCode(currencyRaw);
    delete data.CURRENCY_CODE;
  }
}
