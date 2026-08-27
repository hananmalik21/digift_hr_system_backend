import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';

export const DEFAULT_ACTOR = 'SYSTEM';
export const MAX_BULK_ACTIONS = 100;

const CREATE_REQUIRED_FIELDS = ['action_code', 'action_name', 'active_flag'];
const GUID_HEX_RE = /^[0-9A-Fa-f]{32}$/;
const POSITIVE_INT_RE = /^\d+$/;

export function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? req.body?.user ?? DEFAULT_ACTOR;
}

export function mapActionConflict(err) {
  if (!(err instanceof ConflictError)) return null;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('action code')) return new ConflictError('Action code already exists in this sub-module');
  return err;
}

export function parsePositiveIdOrThrow(fieldName, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid positive number`]);
  }
  return n;
}

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function hasIdentifier(item) {
  return !isBlank(item?.action_id) || !isBlank(item?.action_guid);
}

function pushYnError(fieldName, v, errors, prefix = '') {
  if (v === undefined || v === null) return;
  const u = String(v).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    errors.push(`${prefix}${fieldName} must be Y or N`);
  }
}

function validateBulkActionItem(item, index, seenCodes, errors) {
  const prefix = `actions[${index}]: `;
  const isUpdate = hasIdentifier(item);

  if (isUpdate) {
    if (!isBlank(item.action_id) && !POSITIVE_INT_RE.test(String(item.action_id).trim())) {
      errors.push(`${prefix}action_id must be a valid positive number`);
    }
    if (!isBlank(item.action_guid)) {
      const hex = String(item.action_guid).trim().replace(/-/g, '');
      if (!GUID_HEX_RE.test(hex)) {
        errors.push(`${prefix}action_guid must be a 32-character hexadecimal string`);
      }
    }
  } else {
    for (const field of CREATE_REQUIRED_FIELDS) {
      if (isBlank(item[field])) errors.push(`${prefix}${field} is required`);
    }
  }

  pushYnError('active_flag', item.active_flag, errors, prefix);

  if (!isBlank(item.action_code)) {
    const normalized = String(item.action_code).trim().toUpperCase();
    if (seenCodes.has(normalized)) {
      errors.push(`${prefix}Duplicate action_code "${item.action_code}" in request`);
    } else {
      seenCodes.add(normalized);
    }
  }
}

/**
 * @returns {{ sub_module_id: *, actions: object[] }}
 * @throws {ValidationError}
 */
export function parseBulkActionsBody(body) {
  const payload = body ?? {};
  const errors = [];

  if (isBlank(payload.sub_module_id)) {
    errors.push('sub_module_id is required');
  }

  const actionsRaw = payload.actions;
  if (!Array.isArray(actionsRaw) || actionsRaw.length === 0) {
    errors.push('actions must be a non-empty array');
  } else if (actionsRaw.length > MAX_BULK_ACTIONS) {
    errors.push(`actions may include at most ${MAX_BULK_ACTIONS} item(s)`);
  }

  const actions = [];
  if (Array.isArray(actionsRaw) && actionsRaw.length > 0 && actionsRaw.length <= MAX_BULK_ACTIONS) {
    const seenCodes = new Set();
    for (let i = 0; i < actionsRaw.length; i++) {
      const item = actionsRaw[i] ?? {};
      validateBulkActionItem(item, i, seenCodes, errors);
      actions.push(item);
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  return {
    sub_module_id: payload.sub_module_id,
    actions
  };
}
