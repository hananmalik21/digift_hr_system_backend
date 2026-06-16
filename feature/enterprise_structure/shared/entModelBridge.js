import {
  entInvokeWithConnection,
  rowsFromListEnvelope,
  totalFromListEnvelope,
  toSnakeCaseDeep
} from './entDbClient.js';

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
  await entInvokeWithConnection(module, 'DELETE', {
    ...payload,
    hard: options.hard ? 1 : 0
  });
  return options.hard ? { success: true } : true;
}

/** @param {string} message */
function mapEntValidationMessage(message) {
  if (!message) return null;
  const ora12899 = message.match(
    /value too large for column\s+"?(?:\w+"?\.)?"?(\w+)"?\s*\(actual:\s*(\d+),\s*maximum:\s*(\d+)\)/i
  );
  if (ora12899) {
    const col = ora12899[1].toLowerCase();
    const e = new Error(`${col} must be ${ora12899[3]} characters or less (got ${ora12899[2]})`);
    e.statusCode = 400;
    e.code = 'VALIDATION_ERROR';
    return e;
  }
  if (/must be \d+ characters or less/i.test(message)) {
    const e = new Error(message);
    e.statusCode = 400;
    e.code = 'VALIDATION_ERROR';
    return e;
  }
  if (message.includes('Required field cannot be null') || message.includes('cannot be null')) {
    const e = new Error(message);
    e.statusCode = 400;
    e.code = 'NOT_NULL_CONSTRAINT';
    return e;
  }
  if (message.includes('same grade family') || message.includes('greater than or equal')) {
    const e = new Error(message);
    e.statusCode = 400;
    e.code = 'GRADE_RANGE_INVALID';
    return e;
  }
  if (message.includes('does not exist in grades') || message.includes('Referenced record does not exist')
      || message.includes('does not exist')) {
    const e = new Error(message);
    e.statusCode = 400;
    e.code = 'FOREIGN_KEY_CONSTRAINT';
    return e;
  }
  if (message.includes('sequence is out of sync')) {
    const e = new Error(message);
    e.statusCode = 500;
    e.code = 'SEQUENCE_OUT_OF_SYNC';
    return e;
  }
  if (/not found/i.test(message)) {
    const e = new Error(message);
    e.statusCode = 404;
    e.code = 'NOT_FOUND';
    return e;
  }
  return null;
}

/** @param {Error} error @param {string} fallback */
export function rethrowEntError(error, fallback) {
  if (error?.code === 'ENT_API_ERROR') {
    if (error.message?.includes('already exists')) {
      const e = new Error(error.message);
      e.statusCode = 409;
      e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
      throw e;
    }
    const validation = mapEntValidationMessage(error.message);
    if (validation) throw validation;
  }
  throw new Error(`${fallback}: ${error.message}`);
}
