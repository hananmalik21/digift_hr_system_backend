import { POSITION_ALLOWED_EMPLOYMENT_TYPES } from 'digify-hr-enterprise-backend';

export const ALLOWED_CRITERIA_TYPE_CODES = Object.freeze([
  'EMPLOYMENT_TYPE',
  'GRADE',
  'POSITION',
  'LEGAL_EMPLOYER',
  'BUSINESS_UNIT',
  'DEPARTMENT',
  'LOCATION'
]);

export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

export const DEFAULT_STATUS = 'ACTIVE';
export const DEFAULT_END_DATE = '4712-12-31';

/** Internal DB marker for unrestricted criteria type (not exposed in API). */
export const ALL_VALUES_CRITERIA_MARKER = '*';

export const CRITERIA_TYPE_TO_ORG_LEVEL = Object.freeze({
  LEGAL_EMPLOYER: 'COMPANY',
  BUSINESS_UNIT: 'BUSINESS_UNIT',
  DEPARTMENT: 'DEPARTMENT'
});

export const CRITERIA_VALUES_SUPPORTED_TYPES = Object.freeze([
  'EMPLOYMENT_TYPE',
  'GRADE',
  'POSITION',
  'LEGAL_EMPLOYER',
  'BUSINESS_UNIT',
  'DEPARTMENT',
  'LOCATION'
]);

export const EMPLOYMENT_TYPE_OPTIONS = POSITION_ALLOWED_EMPLOYMENT_TYPES;
