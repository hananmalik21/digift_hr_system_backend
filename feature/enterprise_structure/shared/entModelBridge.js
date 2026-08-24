import {
  entInvokeWithConnection,
  rowsFromListEnvelope,
  totalFromListEnvelope,
  toSnakeCaseDeep
} from './entDbClient.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../../../utils/errors/index.js';

/** @param {Record<string, unknown>} data @param {string} [userId] @param {Record<string, unknown>} [extra] */
export function entActorPayload(data, userId, extra = {}) {
  const payload = { ...extra, actor: userId || 'SYSTEM' };
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    payload[String(key).toLowerCase()] = value;
  }
  return payload;
}

/** @param {string} module @param {Record<string, unknown>} payload */
export async function entGetRecord(module, payload) {
  const { data } = await entInvokeWithConnection(module, 'GET', payload);
  return toSnakeCaseDeep(data);
}

/** @param {string} module @param {Record<string, unknown>} payload */
export async function entListRecords(module, payload) {
  const { data } = await entInvokeWithConnection(module, 'LIST', payload);
  const envelope = toSnakeCaseDeep(data);
  return rowsFromListEnvelope(envelope);
}

/** @param {string} module @param {Record<string, unknown>} payload @returns {Promise<{ rows: unknown[], total: number }>} */
export async function entListEnvelope(module, payload) {
  const { data } = await entInvokeWithConnection(module, 'LIST', payload);
  const envelope = toSnakeCaseDeep(data);
  const rows = rowsFromListEnvelope(envelope);
  return { rows, total: totalFromListEnvelope(envelope, rows.length) };
}

/** @param {string} module @param {string} action @param {Record<string, unknown>} payload */
export async function entInvokeAction(module, action, payload) {
  const { data } = await entInvokeWithConnection(module, action, payload);
  return toSnakeCaseDeep(data);
}

/** @param {string} module @param {Record<string, unknown>} payload */
export async function entCreateRecord(module, payload) {
  const { data } = await entInvokeWithConnection(module, 'CREATE', payload);
  return toSnakeCaseDeep(data);
}

/** @param {string} module @param {Record<string, unknown>} payload */
export async function entUpdateRecord(module, payload) {
  const { data } = await entInvokeWithConnection(module, 'UPDATE', payload);
  return toSnakeCaseDeep(data);
}

/** @param {string} module @param {Record<string, unknown>} payload @param {{ hard?: boolean }} [options] */
export async function entDeleteRecord(module, payload, options = {}) {
  const { data, message } = await entInvokeWithConnection(module, 'DELETE', {
    ...payload,
    hard: options.hard ? 1 : 0
  });
  const shaped = toSnakeCaseDeep(data);
  if (shaped && typeof shaped === 'object' && !Array.isArray(shaped)) {
    return { ...shaped, ...(message ? { message } : {}) };
  }
  return options.hard ? { success: true, message } : true;
}

/** @param {string} message */
function mapEntValidationMessage(message) {
  if (!message) return null;
  const ora12899 = message.match(
    /value too large for column\s+"?(?:\w+"?\.)?"?(\w+)"?\s*\(actual:\s*(\d+),\s*maximum:\s*(\d+)\)/i
  );
  if (ora12899) {
    const col = ora12899[1].toLowerCase();
    return new ValidationError(
      `${col} must be ${ora12899[3]} characters or less (got ${ora12899[2]})`
    );
  }
  if (/must be \d+ characters or less/i.test(message)) {
    return new ValidationError(message);
  }
  if (message.includes('Required field cannot be null') || message.includes('cannot be null')) {
    return new ValidationError(message, null, message);
  }
  if (/currency_code/i.test(message)) {
    return new ValidationError(message);
  }
  if (message.includes('same grade family') || message.includes('greater than or equal')) {
    return new ValidationError(message);
  }
  if (message.includes('does not exist in grades') || message.includes('Referenced record does not exist')
      || message.includes('does not exist')) {
    return new ValidationError(message);
  }
  if (message.includes('sequence is out of sync')) {
    return new AppError(message, 500, 'SEQUENCE_OUT_OF_SYNC');
  }
  if (/not found/i.test(message)) {
    return new NotFoundError(message);
  }
  return null;
}

const FK_DELETE_CONFLICT_RE =
  /referenced by other records|cannot delete.*referenced|use soft delete|cannot be permanently deleted|related records exist/i;

/** @param {Error} error @param {string} fallback */
export function rethrowEntError(error, fallback) {
  if (error instanceof AppError) throw error;

  const message = error?.message || '';
  const isEntApi = error?.code === 'ENT_API_ERROR';
  const looksLikeFkConflict = FK_DELETE_CONFLICT_RE.test(message);

  if (isEntApi || looksLikeFkConflict) {
    if (/already exists/i.test(message)) {
      throw new ConflictError(message);
    }
    if (looksLikeFkConflict) {
      const conflict = new ConflictError(
        message || 'Cannot delete: this record is referenced by other records. Use soft delete instead.',
        null,
        null,
        message
      );
      conflict.errorNum = 2292;
      conflict.code = 'FOREIGN_KEY_CONSTRAINT';
      throw conflict;
    }
    const validation = mapEntValidationMessage(message);
    if (validation) throw validation;
  }

  if (error?.statusCode && Number.isFinite(Number(error.statusCode))) {
    throw new AppError(
      message || fallback,
      Number(error.statusCode),
      error.code || 'INTERNAL_ERROR'
    );
  }

  throw new AppError(`${fallback}: ${message || 'Unknown error'}`, 500, 'INTERNAL_ERROR');
}
