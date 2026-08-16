/**
 * Shape Oracle person-results view rows for the API.
 * JSON object columns are parsed; sentinel 4712 dates are returned unchanged.
 */

import { mapPayRow, parseJsonClob, toIsoDateOrNull } from '../../shared/payrollRowMapper.js';
import { FLOW_COLUMNS, JSON_OBJECT_COLUMNS, TEXT_IDENTIFIER_COLUMNS } from '../constants.js';

function asText(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function pickRowValue(row, key) {
  const upper = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return undefined;
}

/**
 * Parse Oracle JSON object columns that may arrive as CLOB, string, or object.
 * Does not JSON.parse values that are already objects.
 */
export async function parseOracleJsonField(value) {
  if (value == null || value === '') return null;
  if (Buffer.isBuffer(value)) {
    const text = value.toString('utf8').trim();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (typeof value === 'object' && typeof value.getData !== 'function' && !(value instanceof Date)) {
    return value;
  }
  return parseJsonClob(value);
}

/** True when a date value is Oracle's open-ended sentinel (year 4712). */
export function hasOracleSentinelYear(value) {
  if (value == null || value === '') return false;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getFullYear() === 4712;
  }
  const s = String(value).trim();
  return /^4712/.test(s) || s.includes('4712-12-31');
}

function applyTextIdentifiers(mapped, row) {
  for (const key of TEXT_IDENTIFIER_COLUMNS) {
    const raw = pickRowValue(row, key);
    if (raw !== undefined) {
      mapped[key] = asText(raw);
    } else if (Object.prototype.hasOwnProperty.call(mapped, key)) {
      mapped[key] = asText(mapped[key]);
    }
  }
  return mapped;
}

/** Flag sentinel dates without rewriting the Oracle value. */
function applySentinelWarning(mapped, row, field) {
  const current = mapped[field];
  const raw = current ?? pickRowValue(row, field);
  if (!hasOracleSentinelYear(raw)) return mapped;
  mapped.period_warning = true;
  mapped[field] = toIsoDateOrNull(raw) ?? current;
  return mapped;
}

const PERSON_MAP_OPTIONS = {
  dates: [
    'ASSIGNMENT_EFFECTIVE_START_DATE',
    'ASSIGNMENT_EFFECTIVE_END_DATE',
    'LAST_PAYROLL_PERIOD_START',
    'LAST_PAYROLL_PERIOD_END',
    'LAST_PAYMENT_DATE'
  ],
  dateTimes: ['LAST_PAYROLL_RESULT_DATE']
};

const PROCESS_MAP_OPTIONS = {
  dates: ['PERIOD_START_DATE', 'PERIOD_END_DATE', 'PAYMENT_DATE'],
  dateTimes: ['PROCESS_DATE'],
  guids: ['POSITION_ID'],
  omit: [...JSON_OBJECT_COLUMNS, ...FLOW_COLUMNS]
};

export async function mapPersonResultRow(row) {
  const mapped = applyTextIdentifiers(await mapPayRow(row, PERSON_MAP_OPTIONS), row);
  return applySentinelWarning(mapped, row, 'last_payroll_period_end');
}

export async function mapPersonProcessResultRow(row) {
  const mapped = applyTextIdentifiers(await mapPayRow(row, PROCESS_MAP_OPTIONS), row);

  mapped.rel_action = await parseOracleJsonField(pickRowValue(row, 'rel_action_obj'));
  mapped.payroll_definition = await parseOracleJsonField(pickRowValue(row, 'payroll_definition_obj'));

  if (mapped.payroll_definition_id == null && mapped.payroll_id != null) {
    mapped.payroll_definition_id = mapped.payroll_id;
  }

  applySentinelWarning(mapped, row, 'period_end_date');

  for (const col of [...JSON_OBJECT_COLUMNS, ...FLOW_COLUMNS]) {
    delete mapped[col.toLowerCase()];
  }

  return mapped;
}
