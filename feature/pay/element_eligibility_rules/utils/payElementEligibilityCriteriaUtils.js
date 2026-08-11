import { ValidationError } from '../../../../utils/errors/index.js';
import { ALL_VALUES_CRITERIA_MARKER } from '../constants/payElementEligibilityRules.constants.js';

export function isBlank(value) {
  return value == null || String(value).trim() === '';
}

/**
 * Normalize REST `criteria_values_json` for Oracle P_CRITERIA_VALUES_JSON (CLOB).
 * Accepts array/object/JSON string; returns a normalized JSON string.
 * Does not reshape criteria (empty nested arrays stay intact for Oracle all-values).
 */
export function normalizeCriteriaValuesJson(value) {
  if (value === undefined || value === null) {
    throw new ValidationError('Validation failed', ['criteria_values_json is required']);
  }

  if (typeof value === 'string' && value.trim() === '') {
    throw new ValidationError('Validation failed', ['criteria_values_json is required']);
  }

  let parsed;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError('Validation failed', ['criteria_values_json must be valid JSON']);
    }
  } else if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    parsed = value;
  } else {
    throw new ValidationError('Validation failed', [
      'criteria_values_json must be a JSON array, object, or JSON string'
    ]);
  }

  if (parsed === null) {
    throw new ValidationError('Validation failed', ['criteria_values_json is required']);
  }

  try {
    return JSON.stringify(parsed);
  } catch {
    throw new ValidationError('Validation failed', ['criteria_values_json must be valid JSON']);
  }
}

export function isAllValuesCriteriaMarker(value) {
  return String(value ?? '').trim() === ALL_VALUES_CRITERIA_MARKER;
}

function normalizeGroupedCriteriaRow(row) {
  if (row == null || typeof row !== 'object') return null;

  const typeCode = row.criteria_type_code ?? row.criteriaTypeCode;
  if (isBlank(typeCode)) return null;

  const criteriaTypeCode = String(typeCode).trim().toUpperCase();
  const criteriaValues = row.criteria_values ?? row.criteriaValues;

  if (Array.isArray(criteriaValues)) {
    return {
      criteria_type_code: criteriaTypeCode,
      criteria_values: criteriaValues
        .filter((value) => !isBlank(value) && !isAllValuesCriteriaMarker(value))
        .map((value) => String(value).trim())
    };
  }

  const singleValue = row.criteria_value ?? row.criteriaValue;
  if (isAllValuesCriteriaMarker(singleValue)) {
    return {
      criteria_type_code: criteriaTypeCode,
      criteria_values: []
    };
  }

  if (isBlank(singleValue)) return null;

  return {
    criteria_type_code: criteriaTypeCode,
    criteria_values: [String(singleValue).trim()]
  };
}

function mergeGroupedCriteriaEntry(existing, incoming) {
  if (incoming.criteria_values.length === 0) {
    existing.criteria_values = [];
    return existing;
  }

  if (existing.criteria_values.length === 0) {
    return existing;
  }

  for (const value of incoming.criteria_values) {
    if (!existing.criteria_values.includes(value)) {
      existing.criteria_values.push(value);
    }
  }

  return existing;
}

export function groupCriteriaRowsForApi(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const grouped = new Map();

  for (const row of rows) {
    const normalized = normalizeGroupedCriteriaRow(row);
    if (!normalized) continue;

    const existing = grouped.get(normalized.criteria_type_code);
    if (!existing) {
      grouped.set(normalized.criteria_type_code, { ...normalized });
      continue;
    }

    mergeGroupedCriteriaEntry(existing, normalized);
  }

  return Array.from(grouped.values());
}

export function normalizeCriteriaForApi(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return groupCriteriaRowsForApi(rows);
}

export function criteriaForPackagePayload(rows) {
  return normalizeCriteriaForApi(rows).map((row) => {
    if (row.criteria_values.length === 0) {
      return {
        criteria_type_code: row.criteria_type_code,
        criteria_values: []
      };
    }

    if (row.criteria_values.length === 1) {
      return {
        criteria_type_code: row.criteria_type_code,
        criteria_value: row.criteria_values[0]
      };
    }

    return {
      criteria_type_code: row.criteria_type_code,
      criteria_values: row.criteria_values
    };
  });
}

export function countCriteriaValues(criteria) {
  if (!Array.isArray(criteria)) return 0;
  return criteria.reduce((total, row) => total + (row?.criteria_values?.length ?? 0), 0);
}

export function getCriteriaRowMode(row) {
  if (Array.isArray(row?.criteria_values)) {
    return row.criteria_values.length === 0 ? 'ALL' : 'SPECIFIC';
  }

  if (!isBlank(row?.criteria_value)) {
    return 'SPECIFIC';
  }

  return null;
}

export function collectDuplicateCriteriaTypeErrors(rows) {
  const errors = [];
  const seen = new Map();

  for (const [index, row] of rows.entries()) {
    const typeCode = row?.criteria_type_code;
    if (!typeCode) continue;

    const mode = getCriteriaRowMode(row);
    if (!mode) continue;

    const previous = seen.get(typeCode);
    if (!previous) {
      seen.set(typeCode, { mode, index });
      continue;
    }

    if (previous.mode !== mode) {
      errors.push(
        `criteria[${index}] cannot combine all values with specific values for criteria type ${typeCode}`
      );
      continue;
    }

    if (mode === 'ALL') {
      errors.push(`criteria[${index}] duplicates unrestricted criteria type ${typeCode}`);
    }
  }

  return errors;
}
