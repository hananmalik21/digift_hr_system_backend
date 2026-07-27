import { ForbiddenError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { parsePageLimit } from '../../../../utils/paginationUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseDateField,
  parseEnterpriseIdField,
  parseOptionalText,
  parsePositiveInteger,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_BALANCE_CATEGORY_CODE_LENGTH,
  MAX_LIMIT,
  MAX_SEARCH_LENGTH
} from '../constants/payEmployeeBalanceInquiry.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

/**
 * Prefer authenticated enterprise_id; reject mismatched client values.
 * @param {import('express').Request|null|undefined} req
 * @param {unknown} rawEnterpriseId
 * @param {string[]} errors
 * @returns {number|null}
 */
export function resolveEnterpriseId(req, rawEnterpriseId, errors) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null) {
    if (!isBlank(rawEnterpriseId)) {
      const requested = parseEnterpriseIdField([], rawEnterpriseId, { required: false });
      if (requested != null && requested !== tokenEnterpriseId) {
        throw new ForbiddenError(
          'Access denied: enterprise_id does not match authenticated enterprise'
        );
      }
    }
    return tokenEnterpriseId;
  }
  return parseEnterpriseIdField(errors, rawEnterpriseId, { required: true });
}

function parseOptionalGuid(errors, raw, field) {
  if (isBlank(raw)) return null;
  try {
    return parseGuid(raw, field);
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

function parseOptionalPositiveInt(errors, raw, field) {
  if (isBlank(raw)) return null;
  return parsePositiveInteger(errors, raw, field, { required: true });
}

function parseOptionalSearch(errors, raw) {
  const search = parseOptionalText(raw);
  if (search != null && search.length > MAX_SEARCH_LENGTH) {
    errors.push(`search must be at most ${MAX_SEARCH_LENGTH} characters`);
    return null;
  }
  return search;
}

function parseOptionalCategoryCode(errors, raw) {
  const code = parseOptionalText(raw);
  if (code == null) return null;
  if (code.length > MAX_BALANCE_CATEGORY_CODE_LENGTH) {
    errors.push(
      `balance_category_code must be at most ${MAX_BALANCE_CATEGORY_CODE_LENGTH} characters`
    );
    return null;
  }
  return code.toUpperCase();
}

function parsePagination(errors, query) {
  try {
    return parsePageLimit(query, {
      defaultPage: DEFAULT_PAGE,
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT
    });
  } catch (err) {
    errors.push(err.message);
    return { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT, offset: 0 };
  }
}

/**
 * Main inquiry query validation.
 * @param {Record<string, unknown>} query
 * @param {import('express').Request} [req]
 */
export function validateInquiryQuery(query = {}, req) {
  const errors = [];
  const enterprise_id = resolveEnterpriseId(req, query.enterprise_id, errors);
  const employee_id = parseOptionalPositiveInt(errors, query.employee_id, 'employee_id');
  const employee_guid = parseOptionalGuid(errors, query.employee_guid, 'employee_guid');
  const search = parseOptionalSearch(errors, query.search);
  const payroll_id = parseOptionalPositiveInt(errors, query.payroll_id, 'payroll_id');
  const balance_category_code = parseOptionalCategoryCode(errors, query.balance_category_code);
  const as_of_date = isBlank(query.as_of_date)
    ? null
    : parseDateField(errors, query.as_of_date, 'as_of_date', { required: true });
  const { page, limit, offset } = parsePagination(errors, query);

  throwIfErrors(errors);

  return {
    enterprise_id,
    employee_id,
    employee_guid,
    search,
    payroll_id,
    balance_category_code,
    as_of_date,
    page,
    limit,
    offset
  };
}
