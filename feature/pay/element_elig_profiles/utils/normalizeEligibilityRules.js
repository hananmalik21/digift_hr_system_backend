import { ValidationError } from '../../../../utils/errors/index.js';

function isBlank(value) {
  return value == null || String(value).trim() === '';
}

function parsePositiveInt(raw, field) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { error: `${field} is required` };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `${field} must be a positive integer` };
  }
  return { value: n };
}

function parseOptionalPositiveInt(raw, field, defaultValue) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: defaultValue };
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { error: `${field} must be a positive integer` };
  }
  return { value: n };
}

function parseActiveFlag(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: 'Y' };
  }
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    return { error: 'active_flag must be Y or N' };
  }
  return { value: flag };
}

function normalizeRuleRow(row, index) {
  const prefix = `eligibility_rules_json[${index}]`;
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    throw new ValidationError('Validation failed', [`${prefix} must be an object`]);
  }

  const idResult = parsePositiveInt(
    row.eligibility_rule_id ?? row.eligibilityRuleId,
    `${prefix}.eligibility_rule_id`
  );
  if (idResult.error) {
    throw new ValidationError('Validation failed', [idResult.error]);
  }

  const seqResult = parseOptionalPositiveInt(
    row.rule_sequence ?? row.ruleSequence,
    `${prefix}.rule_sequence`,
    1
  );
  if (seqResult.error) {
    throw new ValidationError('Validation failed', [seqResult.error]);
  }

  const flagResult = parseActiveFlag(row.active_flag ?? row.activeFlag);
  if (flagResult.error) {
    throw new ValidationError('Validation failed', [flagResult.error]);
  }

  return {
    eligibility_rule_id: idResult.value,
    rule_sequence: seqResult.value,
    active_flag: flagResult.value
  };
}

/**
 * Normalize REST eligibility_rules_json for profile create/update.
 * Accepts array or JSON string; returns validated rule objects.
 *
 * @param {unknown} value
 * @param {{ required?: boolean }} [options]
 * @returns {Array<{ eligibility_rule_id: number, rule_sequence: number, active_flag: string }>}
 */
export function normalizeEligibilityRules(value, { required = true } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    if (required) {
      throw new ValidationError('Validation failed', ['eligibility_rules_json is required']);
    }
    return [];
  }

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError('Validation failed', ['eligibility_rules_json must be valid JSON']);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new ValidationError('Validation failed', ['eligibility_rules_json must be an array']);
  }

  if (required && parsed.length === 0) {
    throw new ValidationError('Validation failed', ['At least one eligibility rule is required.']);
  }

  return parsed.map((row, index) => normalizeRuleRow(row, index));
}

export function resolveEligibilityRulesRaw(body) {
  if (body == null || typeof body !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'eligibility_rules_json')) {
    return body.eligibility_rules_json;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'eligibility_rules')) {
    return body.eligibility_rules;
  }
  return undefined;
}

export { isBlank };
