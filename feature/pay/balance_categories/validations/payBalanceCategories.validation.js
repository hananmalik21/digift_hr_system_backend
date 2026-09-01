import { parseGuid } from '@digifyhr/common';
import { parsePageLimit } from '@digifyhr/common';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseEnterpriseIdField,
  parseOptionalText,
  parseRequiredText,
  parseUppercaseCode,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  ALLOWED_STATUSES,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DEFAULT_STATUS,
  MAX_LIMIT
} from '../constants/payBalanceCategories.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

function parseStatusCode(errors, raw, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('status_code is required');
    return defaultValue;
  }
  const status = String(raw).trim().toUpperCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.push(`status_code must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    return null;
  }
  return status;
}

export function parseBalanceCategoryGuidParam(raw) {
  return parseGuid(raw, 'balanceCategoryGuid');
}

export function validateCreateBalanceCategoryBody(body = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const category_code = parseUppercaseCode(errors, body.category_code, 'category_code', {
    required: true
  });
  const category_name = parseRequiredText(errors, body.category_name, 'category_name');
  const category_description = parseOptionalText(body.category_description);
  const category_type_code = parseUppercaseCode(
    errors,
    body.category_type_code,
    'category_type_code',
    { required: true }
  );
  const status_code = parseStatusCode(errors, body.status_code, {
    defaultValue: DEFAULT_STATUS
  });
  const created_by = parseOptionalText(body.created_by);

  throwIfErrors(errors);

  return {
    enterprise_id,
    category_code,
    category_name,
    category_description,
    category_type_code,
    status_code,
    created_by
  };
}

export function validateUpdateBalanceCategoryBody(body = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const category_code = parseUppercaseCode(errors, body.category_code, 'category_code', {
    required: true
  });
  const category_name = parseRequiredText(errors, body.category_name, 'category_name');
  const category_description = parseOptionalText(body.category_description);
  const category_type_code = parseUppercaseCode(
    errors,
    body.category_type_code,
    'category_type_code',
    { required: true }
  );
  const status_code = parseStatusCode(errors, body.status_code, { required: true });
  const last_updated_by = parseOptionalText(body.last_updated_by);

  throwIfErrors(errors);

  return {
    enterprise_id,
    category_code,
    category_name,
    category_description,
    category_type_code,
    status_code,
    last_updated_by
  };
}

export function validateDeleteBalanceCategoryBody(body = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateListBalanceCategoriesQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const status_code = isBlank(query.status_code)
    ? null
    : parseStatusCode(errors, query.status_code, { required: true });
  const category_type_code = isBlank(query.category_type_code)
    ? null
    : parseUppercaseCode(errors, query.category_type_code, 'category_type_code', {
        required: true
      });
  const search = parseOptionalText(query.search);

  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  try {
    const pagination = parsePageLimit(query, {
      defaultPage: DEFAULT_PAGE,
      defaultLimit: DEFAULT_LIMIT,
      maxLimit: MAX_LIMIT
    });
    page = pagination.page;
    limit = pagination.limit;
    offset = pagination.offset;
  } catch (err) {
    errors.push(err.message);
  }

  throwIfErrors(errors);

  return {
    enterprise_id,
    status_code,
    category_type_code,
    search,
    page,
    limit,
    offset
  };
}

export function validateGetBalanceCategoryByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}
