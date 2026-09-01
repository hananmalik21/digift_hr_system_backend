import { parseGuid } from '@digifyhr/common';
import { parsePageLimit } from '@digifyhr/common';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseDateField,
  parseEnterpriseIdField,
  parseOptionalText,
  parsePositiveInteger,
  parseRequiredText,
  parseUppercaseCode,
  parseYnFlag,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  DEFAULT_ACTIVE_FLAG,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  SUPPORTED_LOOKUP_TYPES
} from '../constants/payBalanceDefinitions.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

export function parseBalanceDefinitionGuidParam(raw) {
  return parseGuid(raw, 'balanceDefinitionGuid');
}

function parseWriteBody(body = {}, { isUpdate = false } = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const balance_category_id = parsePositiveInteger(
    errors,
    body.balance_category_id,
    'balance_category_id',
    { required: true }
  );
  const balance_code = parseUppercaseCode(errors, body.balance_code, 'balance_code', {
    required: true
  });
  const balance_name = parseRequiredText(errors, body.balance_name, 'balance_name');
  const description = parseOptionalText(body.description);
  const unit_of_measure_code = parseUppercaseCode(
    errors,
    body.unit_of_measure_code,
    'unit_of_measure_code',
    { required: true }
  );
  const balance_type_code = parseUppercaseCode(
    errors,
    body.balance_type_code,
    'balance_type_code',
    { required: true }
  );
  const currency_code = parseUppercaseCode(errors, body.currency_code, 'currency_code', {
    required: true
  });
  const effective_start_date = parseDateField(
    errors,
    body.effective_start_date,
    'effective_start_date',
    { required: true }
  );
  const effective_end_date = parseDateField(errors, body.effective_end_date, 'effective_end_date');
  const active_flag = parseYnFlag(errors, body.active_flag, 'active_flag', {
    defaultValue: DEFAULT_ACTIVE_FLAG
  });

  throwIfErrors(errors);

  const payload = {
    enterprise_id,
    balance_category_id,
    balance_code,
    balance_name,
    description,
    unit_of_measure_code,
    balance_type_code,
    currency_code,
    effective_start_date,
    effective_end_date,
    active_flag
  };

  if (isUpdate) {
    payload.last_updated_by = parseOptionalText(body.last_updated_by);
  } else {
    payload.created_by = parseOptionalText(body.created_by);
  }

  return payload;
}

export function validateCreateBalanceDefinitionBody(body = {}) {
  return parseWriteBody(body);
}

export function validateUpdateBalanceDefinitionBody(body = {}) {
  return parseWriteBody(body, { isUpdate: true });
}

export function validateDeleteBalanceDefinitionQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateGetBalanceDefinitionByGuidQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateEnterpriseIdQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateListBalanceDefinitionsQuery(query = {}) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  const balance_category_id = isBlank(query.balance_category_id)
    ? null
    : parsePositiveInteger(errors, query.balance_category_id, 'balance_category_id', {
        required: true
      });
  const category_code = isBlank(query.category_code)
    ? null
    : parseUppercaseCode(errors, query.category_code, 'category_code', { required: true });
  const unit_of_measure_code = isBlank(query.unit_of_measure_code)
    ? null
    : parseUppercaseCode(errors, query.unit_of_measure_code, 'unit_of_measure_code', {
        required: true
      });
  const balance_type_code = isBlank(query.balance_type_code)
    ? null
    : parseUppercaseCode(errors, query.balance_type_code, 'balance_type_code', { required: true });
  const currency_code = isBlank(query.currency_code)
    ? null
    : parseUppercaseCode(errors, query.currency_code, 'currency_code', { required: true });
  const active_flag = isBlank(query.active_flag)
    ? null
    : parseYnFlag(errors, query.active_flag, 'active_flag', { required: true });
  const currently_effective_flag = isBlank(query.currently_effective_flag)
    ? null
    : parseYnFlag(errors, query.currently_effective_flag, 'currently_effective_flag', {
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
    balance_category_id,
    category_code,
    unit_of_measure_code,
    balance_type_code,
    currency_code,
    active_flag,
    currently_effective_flag,
    search,
    page,
    limit,
    offset
  };
}

export function validateBalanceSetupLookupsQuery(query = {}) {
  const errors = [];
  const enterprise_id = parseEnterpriseIdField(errors, query.enterprise_id, { required: true });
  let type_code = null;

  if (!isBlank(query.type_code)) {
    type_code = String(query.type_code).trim().toUpperCase();
    if (!SUPPORTED_LOOKUP_TYPES.includes(type_code)) {
      errors.push(`type_code must be one of: ${SUPPORTED_LOOKUP_TYPES.join(', ')}`);
      type_code = null;
    }
  }

  throwIfErrors(errors);
  return { enterprise_id, type_code };
}
