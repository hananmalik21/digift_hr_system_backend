import { ValidationError } from '../../../../utils/errors/index.js';
import { isBlank } from '../../shared/recValidationUtils.js';
import {
  parseEnterpriseIdFromQuery,
  parseListPagination
} from '../../shared/recViewQueryValidators.js';
import { parsePostingGuidParam } from './recJobPostingValidators.js';

export { parseEnterpriseIdFromQuery, parseListPagination };

const SORT_COLUMN_MAP = {
  creation_date: 'v.CREATION_DATE',
  posting_title: 'v.POSTING_TITLE',
  start_date: 'v.START_DATE',
  end_date: 'v.END_DATE',
  status_code: 'v.STATUS_CODE',
  posted_date: 'v.POSTED_DATE',
  requisition_number: 'v.REQUISITION_NUMBER',
  position_name: 'v.POSITION_NAME'
};

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function parseJobPostingSort(query) {
  const rawSortBy = query?.sort_by ?? query?.sortBy;
  const rawSortOrder = query?.sort_order ?? query?.sortOrder;

  let column = SORT_COLUMN_MAP.creation_date;
  if (!isBlank(rawSortBy)) {
    const key = String(rawSortBy).trim().toLowerCase();
    if (!SORT_COLUMN_MAP[key]) {
      throw new ValidationError('Validation failed', [
        `sort_by must be one of: ${Object.keys(SORT_COLUMN_MAP).join(', ')}`
      ]);
    }
    column = SORT_COLUMN_MAP[key];
  }

  let direction = 'DESC';
  if (!isBlank(rawSortOrder)) {
    const dir = String(rawSortOrder).trim().toUpperCase();
    if (dir !== 'ASC' && dir !== 'DESC') {
      throw new ValidationError('Validation failed', ['sort_order must be ASC or DESC']);
    }
    direction = dir;
  }

  return `ORDER BY ${column} ${direction} NULLS LAST, v.POSTING_ID DESC`;
}

/**
 * @param {unknown} raw
 * @param {string} fieldName
 */
export function parseOptionalYnFilter(raw, fieldName) {
  if (isBlank(raw)) return null;
  const v = String(raw).trim().toUpperCase();
  if (v !== 'Y' && v !== 'N') {
    throw new ValidationError('Validation failed', [`${fieldName} must be Y or N`]);
  }
  return v;
}

/**
 * @param {unknown} postingGuidParam
 * @param {unknown} enterpriseIdQuery
 */
export function validatePostingGuidEnterpriseParams(postingGuidParam, enterpriseIdQuery) {
  const posting_guid = parsePostingGuidParam(postingGuidParam);
  const enterprise_id = parseEnterpriseIdFromQuery({ enterprise_id: enterpriseIdQuery });
  return { posting_guid, enterprise_id };
}
