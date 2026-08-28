export const MAX_BULK_CREATE = 100;

const LOOKUP_VALUE_FIELD_MAP = {
  enterprise_id: 'ENTERPRISE_ID',
  lookup_type_id: 'LOOKUP_TYPE_ID',
  lookup_type: 'LOOKUP_TYPE',
  lookup_code: 'LOOKUP_CODE',
  meaning_en: 'MEANING_EN',
  meaning_ar: 'MEANING_AR',
  description_en: 'DESCRIPTION_EN',
  description_ar: 'DESCRIPTION_AR',
  display_sequence: 'DISPLAY_SEQUENCE',
  is_enabled: 'IS_ENABLED',
  start_date: 'START_DATE',
  end_date: 'END_DATE'
};

const BULK_SHARED_DEFAULT_KEYS = ['ENTERPRISE_ID', 'LOOKUP_TYPE_ID', 'LOOKUP_TYPE'];

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

export function normalizeLookupValueBody(data) {
  if (!data || typeof data !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(data)) {
    const upperKey = LOOKUP_VALUE_FIELD_MAP[key.toLowerCase()] || key.toUpperCase();
    normalized[upperKey] = value;
  }
  return normalized;
}

export function toDateValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeIsEnabled(value, defaultValue = 'Y') {
  if (value === undefined) return defaultValue;
  return value === true || value === 'Y' || value === 1 ? 'Y' : 'N';
}

export function lookupValueScopeKey(lookupTypeId, enterpriseId) {
  const normalizedEnterpriseId = enterpriseId !== undefined && enterpriseId !== null ? enterpriseId : null;
  return `${lookupTypeId ?? 'null'}:${normalizedEnterpriseId ?? 'null'}`;
}

export function validateLookupValueData(data, isUpdate = false) {
  const errors = [];

  if (!isUpdate) {
    if (isBlank(data.LOOKUP_TYPE_ID)) errors.push('LOOKUP_TYPE_ID is required');
    if (isBlank(data.LOOKUP_CODE)) errors.push('LOOKUP_CODE is required');
    if (isBlank(data.MEANING_EN)) errors.push('MEANING_EN is required');
  } else {
    if (data.LOOKUP_TYPE_ID !== undefined && isBlank(data.LOOKUP_TYPE_ID)) {
      errors.push('LOOKUP_TYPE_ID cannot be empty');
    }
    if (data.LOOKUP_CODE !== undefined && (typeof data.LOOKUP_CODE !== 'string' || data.LOOKUP_CODE.trim() === '')) {
      errors.push('LOOKUP_CODE cannot be empty');
    }
    if (data.MEANING_EN !== undefined && (typeof data.MEANING_EN !== 'string' || data.MEANING_EN.trim() === '')) {
      errors.push('MEANING_EN cannot be empty');
    }
  }

  if (data.IS_ENABLED !== undefined && data.IS_ENABLED !== null) {
    const normalized = String(data.IS_ENABLED).toUpperCase();
    if (!['Y', 'N', 'TRUE', 'FALSE', '1', '0'].includes(normalized)) {
      errors.push('IS_ENABLED must be Y/N or boolean');
    }
  }

  if (data.DISPLAY_SEQUENCE !== undefined && data.DISPLAY_SEQUENCE !== null) {
    const sequence = Number(data.DISPLAY_SEQUENCE);
    if (Number.isNaN(sequence) || sequence < 0) {
      errors.push('DISPLAY_SEQUENCE must be a non-negative number');
    }
  }

  return errors;
}

export function buildNormalizedCreateData(normalizedBody) {
  return {
    ENTERPRISE_ID: normalizedBody.ENTERPRISE_ID !== undefined ? normalizedBody.ENTERPRISE_ID : null,
    LOOKUP_TYPE_ID: normalizedBody.LOOKUP_TYPE_ID != null ? normalizedBody.LOOKUP_TYPE_ID : null,
    LOOKUP_TYPE: normalizedBody.LOOKUP_TYPE != null ? normalizedBody.LOOKUP_TYPE.toString().trim() : null,
    LOOKUP_CODE: normalizedBody.LOOKUP_CODE?.toString().trim(),
    MEANING_EN: normalizedBody.MEANING_EN?.toString().trim(),
    MEANING_AR: normalizedBody.MEANING_AR != null ? normalizedBody.MEANING_AR.toString().trim() : null,
    DESCRIPTION_EN: normalizedBody.DESCRIPTION_EN != null ? normalizedBody.DESCRIPTION_EN.toString().trim() : null,
    DESCRIPTION_AR: normalizedBody.DESCRIPTION_AR != null ? normalizedBody.DESCRIPTION_AR.toString().trim() : null,
    DISPLAY_SEQUENCE: normalizedBody.DISPLAY_SEQUENCE != null ? Number(normalizedBody.DISPLAY_SEQUENCE) : undefined,
    IS_ENABLED: normalizeIsEnabled(normalizedBody.IS_ENABLED),
    START_DATE: toDateValue(normalizedBody.START_DATE),
    END_DATE: toDateValue(normalizedBody.END_DATE)
  };
}

export function buildNormalizedUpdateData(normalizedBody) {
  const normalizedData = {};
  if (normalizedBody.ENTERPRISE_ID !== undefined) {
    normalizedData.ENTERPRISE_ID = normalizedBody.ENTERPRISE_ID;
  }
  if (normalizedBody.LOOKUP_TYPE_ID !== undefined) {
    normalizedData.LOOKUP_TYPE_ID = normalizedBody.LOOKUP_TYPE_ID;
  }
  if (normalizedBody.LOOKUP_TYPE !== undefined) {
    normalizedData.LOOKUP_TYPE = normalizedBody.LOOKUP_TYPE?.toString().trim();
  }
  if (normalizedBody.LOOKUP_CODE !== undefined) {
    normalizedData.LOOKUP_CODE = normalizedBody.LOOKUP_CODE?.toString().trim();
  }
  if (normalizedBody.MEANING_EN !== undefined) {
    normalizedData.MEANING_EN = normalizedBody.MEANING_EN?.toString().trim();
  }
  if (normalizedBody.MEANING_AR !== undefined) {
    normalizedData.MEANING_AR = normalizedBody.MEANING_AR != null
      ? normalizedBody.MEANING_AR.toString().trim()
      : null;
  }
  if (normalizedBody.DESCRIPTION_EN !== undefined) {
    normalizedData.DESCRIPTION_EN = normalizedBody.DESCRIPTION_EN != null
      ? normalizedBody.DESCRIPTION_EN.toString().trim()
      : null;
  }
  if (normalizedBody.DESCRIPTION_AR !== undefined) {
    normalizedData.DESCRIPTION_AR = normalizedBody.DESCRIPTION_AR != null
      ? normalizedBody.DESCRIPTION_AR.toString().trim()
      : null;
  }
  if (normalizedBody.DISPLAY_SEQUENCE !== undefined) {
    normalizedData.DISPLAY_SEQUENCE = Number(normalizedBody.DISPLAY_SEQUENCE);
  }
  if (normalizedBody.IS_ENABLED !== undefined) {
    normalizedData.IS_ENABLED = normalizeIsEnabled(normalizedBody.IS_ENABLED, 'N');
  }
  if (normalizedBody.START_DATE !== undefined) {
    normalizedData.START_DATE = toDateValue(normalizedBody.START_DATE);
  }
  if (normalizedBody.END_DATE !== undefined) {
    normalizedData.END_DATE = toDateValue(normalizedBody.END_DATE);
  }
  return normalizedData;
}

function pickBulkDefaults(defaults) {
  const normalizedDefaults = normalizeLookupValueBody(defaults);
  const picked = {};
  for (const key of BULK_SHARED_DEFAULT_KEYS) {
    if (normalizedDefaults[key] !== undefined) {
      picked[key] = normalizedDefaults[key];
    }
  }
  return picked;
}

function mergeBulkItemDefaults(defaults, item) {
  return {
    ...pickBulkDefaults(defaults),
    ...normalizeLookupValueBody(item)
  };
}

/**
 * @returns {{ ok: true, items: object[] } | { ok: false, errors: string[] }}
 */
export function parseBulkCreateBody(body) {
  const payload = body ?? {};
  const { values, ...defaults } = payload;

  if (!Array.isArray(values) || values.length === 0) {
    return { ok: false, errors: ['values must be a non-empty array'] };
  }
  if (values.length > MAX_BULK_CREATE) {
    return { ok: false, errors: [`values may include at most ${MAX_BULK_CREATE} item(s)`] };
  }

  const errors = [];
  const seenCodesByScope = new Map();
  const mergedItems = [];

  for (let index = 0; index < values.length; index++) {
    const merged = mergeBulkItemDefaults(defaults, values[index]);
    validateLookupValueData(merged, false).forEach((error) => {
      errors.push(`values[${index}]: ${error}`);
    });

    const lookupCode = merged.LOOKUP_CODE?.toString().trim();
    if (lookupCode) {
      const scopeKey = lookupValueScopeKey(merged.LOOKUP_TYPE_ID, merged.ENTERPRISE_ID);
      const normalizedCode = lookupCode.toUpperCase();
      if (!seenCodesByScope.has(scopeKey)) {
        seenCodesByScope.set(scopeKey, new Set());
      }
      if (seenCodesByScope.get(scopeKey).has(normalizedCode)) {
        errors.push(`values[${index}]: Duplicate LOOKUP_CODE "${lookupCode}" in request`);
      } else {
        seenCodesByScope.get(scopeKey).add(normalizedCode);
      }
    }

    mergedItems.push(merged);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    items: mergedItems.map((merged) => buildNormalizedCreateData(merged))
  };
}
