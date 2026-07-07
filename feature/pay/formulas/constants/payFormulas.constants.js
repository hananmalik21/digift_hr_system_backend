export const ALLOWED_FORMULA_TYPE_CODES = Object.freeze([
  'PAYROLL',
  'BALANCE_FEED',
  'OVERTIME',
  'TAX',
  'SOCIAL_INSURANCE',
  'RETRO',
  'PRORATION',
  'ADJUSTMENT',
  'DEDUCTION',
  'EARNING'
]);

export const ALLOWED_FORMULA_ENGINE_CODES = Object.freeze([
  'INTERNAL',
  'FAST_FORMULA',
  'PLSQL',
  'SQL',
  'EXTERNAL'
]);

export const ALLOWED_RETURN_TYPE_CODES = Object.freeze(['AMOUNT', 'NUMBER', 'TEXT', 'DATE', 'BOOLEAN']);

export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

export const DEFAULT_END_DATE = '4712-12-31';
export const DEFAULT_STATUS = 'ACTIVE';
export const DEFAULT_FORMULA_ENGINE_CODE = 'INTERNAL';
export const DEFAULT_RETURN_TYPE_CODE = 'AMOUNT';
export const DEFAULT_RETURN_VALUE_CODE = 'RESULT';
export const DEFAULT_MAX_ROWS = 500;
