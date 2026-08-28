import { ValidationError } from '../../../../utils/errors/index.js';
import { isValidCalendarDateOnly } from '../../../../utils/dateOnlyUtils.js';
import { isBlank } from '../../shared/recValidationUtils.js';

/** Canonical API child-array fields (map to Oracle P_*_JSON CLOB binds). */
export const CANDIDATE_EDUCATION_FIELD = 'education';
export const CANDIDATE_EXPERIENCE_FIELD = 'experience';
export const CANDIDATE_SKILLS_FIELD = 'skills';

/** Legacy request aliases kept for backward compatibility. */
export const CANDIDATE_EDUCATION_LEGACY_FIELD = 'education_json';
export const CANDIDATE_EXPERIENCE_LEGACY_FIELD = 'experience_json';
export const CANDIDATE_SKILLS_LEGACY_FIELD = 'skills_json';

/** View column names on REC.CANDIDATES_FULL_V. */
export const CANDIDATE_EDUCATION_VIEW_COLUMN = 'education_json';
export const CANDIDATE_EXPERIENCE_VIEW_COLUMN = 'experience_json';
export const CANDIDATE_SKILLS_VIEW_COLUMN = 'skills_json';

/** Canonical API fields exposed on list/detail/export responses. */
export const CANDIDATE_CHILD_JSON_API_FIELDS = [
  CANDIDATE_EDUCATION_FIELD,
  CANDIDATE_EXPERIENCE_FIELD,
  CANDIDATE_SKILLS_FIELD
];

/** Skill fields returned on candidate detail/list GET (request accepts skill_name only). */
export const CANDIDATE_SKILL_RESPONSE_FIELDS = ['candidate_skill_guid', 'skill_name'];

/** View column -> API response field for all JSON collections on REC.CANDIDATES_FULL_V. */
export const CANDIDATE_JSON_COLLECTION_VIEW_TO_API = {
  [CANDIDATE_EDUCATION_VIEW_COLUMN]: CANDIDATE_EDUCATION_FIELD,
  [CANDIDATE_EXPERIENCE_VIEW_COLUMN]: CANDIDATE_EXPERIENCE_FIELD,
  [CANDIDATE_SKILLS_VIEW_COLUMN]: CANDIDATE_SKILLS_FIELD,
  resumes_json: 'resumes',
  background_checks_json: 'background_checks',
  assessments_json: 'assessments',
  talent_pools_json: 'talent_pools'
};

/** @deprecated Use CANDIDATE_JSON_COLLECTION_VIEW_TO_API */
export const CANDIDATE_CHILD_JSON_VIEW_TO_API = {
  [CANDIDATE_EDUCATION_VIEW_COLUMN]: CANDIDATE_EDUCATION_FIELD,
  [CANDIDATE_EXPERIENCE_VIEW_COLUMN]: CANDIDATE_EXPERIENCE_FIELD
};

/** Canonical API JSON collection field names returned on detail GET. */
export const CANDIDATE_JSON_COLLECTION_API_FIELDS = Object.values(
  CANDIDATE_JSON_COLLECTION_VIEW_TO_API
);

/** Education/experience canonical + legacy alias pairs. */
export const CANDIDATE_CHILD_JSON_ALIASES = [
  { canonical: CANDIDATE_EDUCATION_FIELD, legacy: CANDIDATE_EDUCATION_LEGACY_FIELD },
  { canonical: CANDIDATE_EXPERIENCE_FIELD, legacy: CANDIDATE_EXPERIENCE_LEGACY_FIELD }
];

/** All JSON collection view columns mapped in GET detail responses. */
export const CANDIDATE_JSON_COLLECTION_VIEW_COLUMNS = new Set(
  Object.keys(CANDIDATE_JSON_COLLECTION_VIEW_TO_API)
);

/** @deprecated Use CANDIDATE_JSON_COLLECTION_VIEW_COLUMNS */
export const CANDIDATE_CHILD_JSON_VIEW_COLUMNS = CANDIDATE_JSON_COLLECTION_VIEW_COLUMNS;

/**
 * @param {Record<string, unknown>} body
 * @param {string} field
 */
export function bodyHasField(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

/**
 * Copy legacy education_json / experience_json onto canonical keys when canonical is omitted.
 * @param {Record<string, unknown>} body
 */
export function normalizeCandidateChildJsonRequestFields(body) {
  for (const { canonical, legacy } of CANDIDATE_CHILD_JSON_ALIASES) {
    if (bodyHasField(body, canonical)) continue;
    if (bodyHasField(body, legacy)) {
      body[canonical] = body[legacy];
    }
  }

  if (!bodyHasField(body, CANDIDATE_SKILLS_FIELD) && bodyHasField(body, CANDIDATE_SKILLS_LEGACY_FIELD)) {
    body[CANDIDATE_SKILLS_FIELD] = body[CANDIDATE_SKILLS_LEGACY_FIELD];
  }
}

/**
 * Parse skills from multipart/form-data JSON strings (or legacy alias) into a JS array.
 * Safe to call for application/json requests — arrays pass through unchanged.
 * @param {Record<string, unknown>} body
 */
export function normalizeSkillsFieldInBody(body) {
  normalizeCandidateChildJsonRequestFields(body);

  if (!bodyHasField(body, CANDIDATE_SKILLS_FIELD)) {
    return;
  }

  const value = body[CANDIDATE_SKILLS_FIELD];
  if (typeof value === 'string') {
    body[CANDIDATE_SKILLS_FIELD] = parseChildJsonArrayField(value, CANDIDATE_SKILLS_FIELD);
  }
}

/**
 * Parse multipart / JSON child arrays preserving empty arrays.
 * @param {unknown} value
 * @param {string} fieldName
 */
export function parseChildJsonArrayField(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new ValidationError('Validation failed', [`${fieldName} must be a JSON array`]);
    }
    return parsed;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError('Validation failed', [`${fieldName} must be valid JSON`]);
  }
}

/**
 * Parse education, experience, and skills from request body.
 * Skills/education/experience may arrive as JSON strings (multipart/form-data).
 * @param {Record<string, unknown>} body
 */
export function parseCandidateMultipartChildJsonFields(body) {
  for (const { canonical, legacy } of CANDIDATE_CHILD_JSON_ALIASES) {
    if (bodyHasField(body, canonical)) {
      body[canonical] = parseChildJsonArrayField(body[canonical], canonical);
      continue;
    }
    if (bodyHasField(body, legacy)) {
      body[canonical] = parseChildJsonArrayField(body[legacy], legacy);
    }
  }

  normalizeSkillsFieldInBody(body);
}

/**
 * Parse skills request value to a JS array (or null when empty).
 * @param {unknown} value
 * @returns {unknown[]|null|undefined} undefined when value is invalid
 */
function parseSkillsArrayInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Coerce skills to a JS array for validation (parses JSON strings once).
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {unknown[]|null|undefined} undefined when invalid
 */
function coerceSkillsArrayValue(value, errors) {
  const parsed = parseSkillsArrayInput(value);
  if (parsed === undefined) {
    if (typeof value === 'string') {
      errors.push('skills must be valid JSON');
    } else {
      errors.push('skills must be an array');
    }
    return undefined;
  }
  return parsed;
}

/**
 * Parse a child JSON array field value (array or JSON string) for binds / validation.
 * @param {unknown} value
 * @returns {unknown[]|null|undefined} undefined when invalid
 */
export function parseChildJsonArrayInput(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Bind helper for P_EDUCATION_JSON / P_EXPERIENCE_JSON / P_SKILLS_JSON.
 * Parses JSON strings once, then stringifies once — never double-encodes.
 * Omitted key -> NULL; explicit [] -> '[]'; items -> JSON.stringify.
 * @param {Record<string, unknown>} body
 * @param {string} fieldName
 * @returns {string|null}
 */
export function candidateChildJsonToClobString(body, fieldName) {
  if (!bodyHasField(body, fieldName)) {
    return null;
  }

  const parsed = parseChildJsonArrayInput(body[fieldName]);
  if (parsed == null) {
    return null;
  }

  return JSON.stringify(parsed);
}

/**
 * Bind helper for P_SKILLS_JSON.
 * Parses JSON strings once, then stringifies the array once — never double-encodes.
 * Omitted key -> NULL; explicit [] -> '[]'; items -> JSON.stringify.
 * @param {Record<string, unknown>} body
 * @returns {string|null}
 */
export function candidateSkillsToClobString(body) {
  return candidateChildJsonToClobString(body, CANDIDATE_SKILLS_FIELD);
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} fieldName
 */
export function validateCandidateChildJsonArrayInErrors(errors, body, fieldName) {
  if (!bodyHasField(body, fieldName)) {
    return;
  }

  const value = body[fieldName];
  if (value === null || value === undefined || value === '') {
    body[fieldName] = null;
    return;
  }

  if (typeof value === 'string') {
    const parsed = parseChildJsonArrayInput(value);
    if (parsed === undefined) {
      errors.push(`${fieldName} must be valid JSON`);
      return;
    }
    if (parsed === null) {
      body[fieldName] = null;
      return;
    }
    body[fieldName] = parsed;
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array`);
  }
}

/**
 * @param {string} label
 * @param {unknown} value
 * @param {string[]} errors
 * @returns {string|null|undefined} undefined when invalid; null when blank
 */
function optionalDateOnlyOnItem(label, value, errors) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const s = String(value).trim();
  if (!isValidCalendarDateOnly(s)) {
    errors.push(`${label} must be a valid date (YYYY-MM-DD)`);
    return undefined;
  }
  return s;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {string|null}
 */
function optionalTrimmedStringOnItem(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return String(value).trim();
}

/**
 * @param {unknown} item
 * @param {number} index
 * @param {string[]} errors
 * @returns {Record<string, unknown>|null}
 */
function validateEducationItemInErrors(item, index, errors) {
  const label = `education[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${label} must be an object`);
    return null;
  }

  const row = /** @type {Record<string, unknown>} */ (item);
  const startRaw = row.start_date ?? row.startDate;
  const endRaw = row.end_date ?? row.endDate;
  const start = optionalDateOnlyOnItem(`${label}.start_date`, startRaw, errors);
  const end = optionalDateOnlyOnItem(`${label}.end_date`, endRaw, errors);
  if (start === undefined || end === undefined) {
    return null;
  }
  if (start && end && end < start) {
    errors.push(`${label}.end_date must be on or after start_date`);
    return null;
  }

  return {
    degree_name: optionalTrimmedStringOnItem(row.degree_name ?? row.degreeName ?? row.degree),
    institution_name: optionalTrimmedStringOnItem(
      row.institution_name ?? row.institutionName ?? row.institution ?? row.school
    ),
    field_of_study: optionalTrimmedStringOnItem(row.field_of_study ?? row.fieldOfStudy ?? row.field),
    start_date: start,
    end_date: end,
    grade: optionalTrimmedStringOnItem(row.grade),
    description: optionalTrimmedStringOnItem(row.description)
  };
}

/**
 * @param {unknown} item
 * @param {number} index
 * @param {string[]} errors
 * @returns {Record<string, unknown>|null}
 */
function validateExperienceItemInErrors(item, index, errors) {
  const label = `experience[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${label} must be an object`);
    return null;
  }

  const row = /** @type {Record<string, unknown>} */ (item);
  const currentRaw = row.current_job_flag ?? row.currentJobFlag ?? row.isCurrent ?? row.current;
  let currentFlag = null;
  if (!isBlank(currentRaw)) {
    const u = String(currentRaw).trim().toUpperCase();
    if (u === 'TRUE' || u === 'YES' || u === '1') {
      currentFlag = 'Y';
    } else if (u === 'FALSE' || u === 'NO' || u === '0') {
      currentFlag = 'N';
    } else if (u === 'Y' || u === 'N') {
      currentFlag = u;
    } else {
      errors.push(`${label}.current_job_flag must be Y or N`);
      return null;
    }
  }

  const startRaw = row.start_date ?? row.startDate;
  const endRaw = row.end_date ?? row.endDate;
  const start = optionalDateOnlyOnItem(`${label}.start_date`, startRaw, errors);
  let end = optionalDateOnlyOnItem(`${label}.end_date`, endRaw, errors);
  if (start === undefined || end === undefined) {
    return null;
  }
  if (currentFlag === 'Y') {
    end = null;
  } else if (start && end && end < start) {
    errors.push(`${label}.end_date must be on or after start_date`);
    return null;
  }

  return {
    company_name: optionalTrimmedStringOnItem(
      row.company_name ?? row.companyName ?? row.company ?? row.employer
    ),
    job_title: optionalTrimmedStringOnItem(row.job_title ?? row.jobTitle ?? row.title),
    location: optionalTrimmedStringOnItem(row.location),
    start_date: start,
    end_date: end,
    current_job_flag: currentFlag,
    description: optionalTrimmedStringOnItem(row.description)
  };
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateEducationInErrors(errors, body) {
  validateCandidateChildJsonArrayInErrors(errors, body, CANDIDATE_EDUCATION_FIELD);
  if (errors.length || !bodyHasField(body, CANDIDATE_EDUCATION_FIELD)) return;

  const education = body[CANDIDATE_EDUCATION_FIELD];
  if (!Array.isArray(education)) return;

  const normalized = [];
  education.forEach((item, index) => {
    const row = validateEducationItemInErrors(item, index, errors);
    if (row) normalized.push(row);
  });
  if (!errors.length) {
    body[CANDIDATE_EDUCATION_FIELD] = normalized;
  }
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateExperienceInErrors(errors, body) {
  validateCandidateChildJsonArrayInErrors(errors, body, CANDIDATE_EXPERIENCE_FIELD);
  if (errors.length || !bodyHasField(body, CANDIDATE_EXPERIENCE_FIELD)) return;

  const experience = body[CANDIDATE_EXPERIENCE_FIELD];
  if (!Array.isArray(experience)) return;

  const normalized = [];
  experience.forEach((item, index) => {
    const row = validateExperienceItemInErrors(item, index, errors);
    if (row) normalized.push(row);
  });
  if (!errors.length) {
    body[CANDIDATE_EXPERIENCE_FIELD] = normalized;
  }
}

/**
 * @param {unknown} item
 * @param {number} index
 * @param {string[]} errors
 * @returns {{ skill_name: string }|null}
 */
function validateSkillItemInErrors(item, index, errors) {
  const label = `skills[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    errors.push(`${label} must be an object`);
    return null;
  }

  const row = /** @type {Record<string, unknown>} */ (item);
  if (isBlank(row.skill_name)) {
    errors.push(`${label}.skill_name is required`);
    return null;
  }

  return { skill_name: String(row.skill_name).trim() };
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateSkillsInErrors(errors, body) {
  if (!bodyHasField(body, CANDIDATE_SKILLS_FIELD)) {
    return;
  }

  const coerced = coerceSkillsArrayValue(body[CANDIDATE_SKILLS_FIELD], errors);
  if (errors.length || coerced === undefined) {
    return;
  }

  if (coerced === null) {
    body[CANDIDATE_SKILLS_FIELD] = null;
    return;
  }

  const normalized = [];
  coerced.forEach((item, index) => {
    const row = validateSkillItemInErrors(item, index, errors);
    if (row) normalized.push(row);
  });

  if (!errors.length) {
    body[CANDIDATE_SKILLS_FIELD] = normalized;
  }
}

/**
 * Validate optional education, experience, and skills child arrays.
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateChildJsonFieldsInErrors(errors, body) {
  validateCandidateEducationInErrors(errors, body);
  validateCandidateExperienceInErrors(errors, body);
  validateCandidateSkillsInErrors(errors, body);
}
