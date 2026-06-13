import {
  resolveLookupListTenantId,
  resolveWriteTenantId
} from '../../../utils/lookupEnterpriseUtils.js';

export { resolveWriteTenantId };

const CODE_PATTERN = /^[A-Z0-9_]+$/;

export function normalizeAbsBody(body, fieldMap) {
  if (!body || typeof body !== 'object') return {};
  const normalized = {};
  for (const [lowerKey, upperKey] of Object.entries(fieldMap)) {
    if (body[lowerKey] !== undefined) {
      normalized[upperKey] = body[lowerKey];
    } else if (body[upperKey] !== undefined) {
      normalized[upperKey] = body[upperKey];
    }
  }
  return normalized;
}

export function parsePositiveInt(value, label) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${label} must be a valid positive number` };
  }
  return { value: n };
}

export function resolveTenantIdFromRequest(req) {
  return resolveLookupListTenantId(req);
}

export function validateAbsCode(code, label) {
  const trimmed = (code ?? '').toString().trim();
  if (!trimmed) return [`${label} is required`];
  if (!CODE_PATTERN.test(trimmed.toUpperCase())) {
    return [`${label} must contain only uppercase letters, numbers, and underscores`];
  }
  return [];
}

export function validateAbsName(name, label, { required = false } = {}) {
  if (name === undefined) {
    return required ? [`${label} is required`] : [];
  }
  const trimmed = (name ?? '').toString().trim();
  if (!trimmed) return [`${label} cannot be empty`];
  return [];
}

export function validateAbsStatus(status) {
  if (status === undefined) return [];
  const v = (status ?? '').toString().toUpperCase();
  if (v !== 'ACTIVE' && v !== 'INACTIVE') {
    return ['status must be ACTIVE or INACTIVE'];
  }
  return [];
}

export function validateDisplayOrder(displayOrder) {
  if (displayOrder === undefined) return [];
  const n = Number(displayOrder);
  if (!Number.isFinite(n) || n < 1) {
    return ['display_order must be a valid positive number'];
  }
  return [];
}
