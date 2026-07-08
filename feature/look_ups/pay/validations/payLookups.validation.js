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

export const MAX_BULK_LOOKUP_VALUES = 100;

/**
 * Validates bulk create payload.
 * Top-level `enterprise_id` is the default for rows that omit it.
 *
 * @param {Record<string, unknown>} body
 */
export function validateCreateLookupValuesBulkBody(body) {
  const errors = [];
  const payload = body || {};

  requireString(errors, payload, 'type_code');
  requireEnterpriseIdField(errors, payload);

  if (!Array.isArray(payload.values) || payload.values.length === 0) {
    errors.push('values must be a non-empty array');
  } else if (payload.values.length > MAX_BULK_LOOKUP_VALUES) {
    errors.push(`values may include at most ${MAX_BULK_LOOKUP_VALUES} item(s)`);
  }

  const values = [];
  const seenByScope = new Map();

  if (Array.isArray(payload.values)) {
    for (let index = 0; index < payload.values.length; index++) {
      const row = payload.values[index] || {};
      const label = `values[${index}]`;

      if (isBlank(row.value_code)) {
        errors.push(`${label}: value_code is required`);
      }
      if (isBlank(row.value_name)) {
        errors.push(`${label}: value_name is required`);
      }

      if (
        Object.prototype.hasOwnProperty.call(row, 'enterprise_id') &&
        row.enterprise_id !== undefined &&
        row.enterprise_id !== null &&
        row.enterprise_id !== ''
      ) {
        try {
          parseEnterpriseId(row.enterprise_id);
        } catch (err) {
          errors.push(`${label}: ${err.message}`);
        }
      }

      try {
        validateDisplaySequence(row.display_sequence);
      } catch (err) {
        errors.push(`${label}: ${err.message}`);
      }

      const valueCode = isBlank(row.value_code) ? null : String(row.value_code).trim().toUpperCase();
      const rowEnterpriseId = Object.prototype.hasOwnProperty.call(row, 'enterprise_id')
        ? (row.enterprise_id ?? null)
        : (payload.enterprise_id ?? null);
      const scopeKey = `${rowEnterpriseId ?? 'null'}:${valueCode ?? ''}`;

      if (valueCode) {
        if (!seenByScope.has(scopeKey)) {
          seenByScope.set(scopeKey, true);
        } else {
          errors.push(`${label}: Duplicate value_code "${valueCode}" in request`);
        }
      }

      values.push({
        value_code: isBlank(row.value_code) ? null : String(row.value_code).trim(),
        value_name: isBlank(row.value_name) ? null : String(row.value_name).trim(),
        enterprise_id: Object.prototype.hasOwnProperty.call(row, 'enterprise_id')
          ? (row.enterprise_id ?? null)
          : undefined,
        display_sequence: row.display_sequence ?? null
      });
    }
  }

  throwIfErrors(errors);

  return {
    type_code: String(payload.type_code).trim(),
    enterprise_id: payload.enterprise_id ?? null,
    values: values.map((row) => {
      const item = {
        value_code: row.value_code,
        value_name: row.value_name,
        display_sequence: row.display_sequence
      };
      if (row.enterprise_id !== undefined) {
        item.enterprise_id = row.enterprise_id;
      }
      return item;
    })
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
