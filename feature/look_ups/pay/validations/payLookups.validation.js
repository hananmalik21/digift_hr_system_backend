import { ValidationError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { validateActiveFlag, validateDisplaySequence } from '../../../../utils/validationUtils.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function requireString(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
  }
}

function requireEnterpriseIdField(errors, body, { required = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(body, 'enterprise_id')) {
    if (required) {
      errors.push('enterprise_id is required (use null for global values)');
    }
    return;
  }
  if (body.enterprise_id !== undefined && body.enterprise_id !== null && body.enterprise_id !== '') {
    try {
      parseEnterpriseId(body.enterprise_id);
    } catch (err) {
      errors.push(err.message);
    }
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateLookupTypeBody(body) {
  const errors = [];
  requireString(errors, body, 'type_code');
  requireString(errors, body, 'type_name');
  throwIfErrors(errors);

  return {
    type_code: String(body.type_code).trim(),
    type_name: String(body.type_name).trim(),
    description: body.description != null ? String(body.description).trim() : null
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateLookupTypeBody(body) {
  const errors = [];

  if (body.type_code !== undefined && isBlank(body.type_code)) {
    errors.push('type_code cannot be empty');
  }
  if (body.type_name !== undefined && isBlank(body.type_name)) {
    errors.push('type_name cannot be empty');
  }
  if (body.active_flag !== undefined) {
    try {
      validateActiveFlag(body.active_flag);
    } catch (err) {
      errors.push(err.message);
    }
  }

  throwIfErrors(errors);

  const validated = {};
  if (body.type_code !== undefined) validated.type_code = String(body.type_code).trim();
  if (body.type_name !== undefined) validated.type_name = String(body.type_name).trim();
  if (body.description !== undefined) {
    validated.description = body.description != null ? String(body.description).trim() : null;
  }
  if (body.active_flag !== undefined) {
    validated.active_flag = String(body.active_flag).trim().toUpperCase();
  }

  return validated;
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListLookupTypesQuery(query = {}) {
  const errors = [];

  if (query.active_flag !== undefined && query.active_flag !== null && query.active_flag !== '') {
    try {
      validateActiveFlag(query.active_flag);
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (query.sort_order !== undefined) {
    const order = String(query.sort_order).trim().toUpperCase();
    if (order !== 'ASC' && order !== 'DESC') {
      errors.push('sort_order must be ASC or DESC');
    }
  }

  if (query.sort_by !== undefined) {
    const allowed = new Set(['type_code', 'type_name']);
    if (!allowed.has(String(query.sort_by).trim().toLowerCase())) {
      errors.push('sort_by must be one of: type_code, type_name');
    }
  }

  throwIfErrors(errors);

  return {
    search: query.search,
    active_flag: query.active_flag,
    sort_by: query.sort_by,
    sort_order: query.sort_order
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateListLookupValuesQuery(query = {}) {
  const errors = [];

  try {
    parseEnterpriseId(query.enterprise_id, 'enterprise_id is required');
  } catch (err) {
    errors.push(err.message);
  }

  if (query.active_flag !== undefined && query.active_flag !== null && query.active_flag !== '') {
    try {
      validateActiveFlag(query.active_flag);
    } catch (err) {
      errors.push(err.message);
    }
  }

  throwIfErrors(errors);

  return {
    enterprise_id: query.enterprise_id,
    type_code: query.type_code,
    active_flag: query.active_flag,
    search: query.search
  };
}

/**
 * @param {Record<string, unknown>} query
 */
export function validateGetLookupValueQuery(query = {}) {
  const errors = [];

  try {
    parseEnterpriseId(query.enterprise_id, 'enterprise_id is required');
  } catch (err) {
    errors.push(err.message);
  }

  throwIfErrors(errors);

  return {
    enterprise_id: query.enterprise_id
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateLookupValueBody(body) {
  const errors = [];
  requireString(errors, body, 'type_code');
  requireString(errors, body, 'value_code');
  requireString(errors, body, 'value_name');
  requireEnterpriseIdField(errors, body);

  try {
    validateDisplaySequence(body.display_sequence);
  } catch (err) {
    errors.push(err.message);
  }

  throwIfErrors(errors);

  return {
    type_code: String(body.type_code).trim(),
    value_code: String(body.value_code).trim(),
    value_name: String(body.value_name).trim(),
    enterprise_id: body.enterprise_id ?? null,
    display_sequence: body.display_sequence ?? null
  };
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateUpdateLookupValueBody(body) {
  const errors = [];

  if (body.value_code !== undefined && isBlank(body.value_code)) {
    errors.push('value_code cannot be empty');
  }
  if (body.value_name !== undefined && isBlank(body.value_name)) {
    errors.push('value_name cannot be empty');
  }
  requireEnterpriseIdField(errors, body);
  if (body.active_flag !== undefined) {
    try {
      validateActiveFlag(body.active_flag);
    } catch (err) {
      errors.push(err.message);
    }
  }
  try {
    validateDisplaySequence(body.display_sequence);
  } catch (err) {
    errors.push(err.message);
  }

  throwIfErrors(errors);

  const validated = {};
  if (body.value_code !== undefined) validated.value_code = String(body.value_code).trim();
  if (body.value_name !== undefined) validated.value_name = String(body.value_name).trim();
  if (body.display_sequence !== undefined) validated.display_sequence = body.display_sequence;
  if (body.active_flag !== undefined) {
    validated.active_flag = String(body.active_flag).trim().toUpperCase();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'enterprise_id')) {
    validated.enterprise_id = body.enterprise_id ?? null;
  }

  return validated;
}

/**
 * @param {unknown} value
 */
export function parseLookupTypeGuidParam(value) {
  return parseGuid(value, 'lookup_type_guid');
}

/**
 * @param {unknown} value
 */
export function parseLookupValueGuidParam(value) {
  return parseGuid(value, 'lookup_value_guid');
}
