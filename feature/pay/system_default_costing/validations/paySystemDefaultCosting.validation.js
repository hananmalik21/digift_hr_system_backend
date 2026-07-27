import { ForbiddenError } from '../../../../utils/errors/index.js';
import { parseGuid } from '../../../../utils/guidUtils.js';
import { parsePageLimit } from '../../../../utils/paginationUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import {
  assertEnterpriseAccess,
  firstValidationMessage,
  isBlank,
  parseEnterpriseIdField,
  parseOptionalText,
  parsePositiveInteger,
  parseDateField,
  parseUppercaseCode,
  throwIfErrors
} from '../../utils/payValidationUtils.js';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT
} from '../constants/paySystemDefaultCosting.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

export function parseSystemDefaultCostingGuidParam(raw) {
  return parseGuid(raw, 'systemDefaultCostingGuid');
}

function resolveRequiredEnterpriseIdFromQuery(req, rawEnterpriseId, errors) {
  const enterprise_id = parseEnterpriseIdField(errors, rawEnterpriseId, { required: true });
  if (enterprise_id == null) return null;

  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterprise_id !== tokenEnterpriseId) {
    throw new ForbiddenError(
      'Access denied: enterprise_id does not match authenticated enterprise'
    );
  }

  return enterprise_id;
}

function parseOptionalUppercaseCode(errors, raw, field) {
  if (isBlank(raw)) return null;
  return parseUppercaseCode(errors, raw, field, { required: true });
}

function validateFlexfieldSegments(bodyFlexfieldSegments, errors) {
  if (bodyFlexfieldSegments == null || typeof bodyFlexfieldSegments !== 'object') {
    errors.push('flexfield_segments must be provided.');
    return null;
  }

  const segmentsRaw = bodyFlexfieldSegments.segments;
  if (!Array.isArray(segmentsRaw) || segmentsRaw.length === 0) {
    errors.push('At least one flexfield segment must be provided.');
    return null;
  }

  const segments = segmentsRaw.map((s, idx) => {
    const segment_id = parsePositiveInteger(
      errors,
      s?.segment_id,
      `flexfield_segments.segments[${idx}].segment_id`,
      { required: true }
    );
    const segment_value_id = parsePositiveInteger(
      errors,
      s?.segment_value_id,
      `flexfield_segments.segments[${idx}].segment_value_id`,
      { required: true }
    );

    return { segment_id, segment_value_id };
  });

  return { segments };
}

function rejectForbiddenFields(errors, body, forbiddenKeys) {
  for (const k of forbiddenKeys) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    errors.push(`${k} is not allowed.`);
  }
}

const FORBIDDEN_TRANSACTION_FIELDS = [
  'combined_account_code',
  'employee_id',
  'assignment_id',
  'position_id',
  'element_id',
  'department_id',
  'allocation_percentage'
];

export function validateListSystemDefaultCostingQuery(query = {}, req) {
  const errors = [];

  const enterprise_id = resolveRequiredEnterpriseIdFromQuery(req, query.enterprise_id, errors);
  const status_code = parseOptionalUppercaseCode(errors, query.status_code, 'status_code');

  const effective_as_of = isBlank(query.effective_as_of)
    ? null
    : parseDateField(errors, query.effective_as_of, 'effective_as_of', { required: true });
  const effective_start_date = isBlank(query.effective_start_date)
    ? null
    : parseDateField(errors, query.effective_start_date, 'effective_start_date', {
        required: true
      });
  const effective_end_date = isBlank(query.effective_end_date)
    ? null
    : parseDateField(errors, query.effective_end_date, 'effective_end_date', {
        required: true
      });

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
    effective_as_of,
    effective_start_date,
    effective_end_date,
    page,
    limit,
    offset
  };
}

export function validateGetSystemDefaultCostingByGuidQuery(query = {}, req) {
  const errors = [];
  const enterprise_id = resolveRequiredEnterpriseIdFromQuery(req, query.enterprise_id, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateCreateSystemDefaultCostingBody(body = {}, _req) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });

  const effective_start_date = parseDateField(
    errors,
    body.effective_start_date,
    'effective_start_date',
    { required: true }
  );
  const effective_end_date = parseDateField(
    errors,
    body.effective_end_date,
    'effective_end_date',
    { required: true }
  );

  const status_code = parseUppercaseCode(errors, body.status_code, 'status_code', {
    required: true
  });

  const comments = parseOptionalText(body.comments);
  const created_by = parseOptionalText(body.created_by);

  const flexfield_segments = validateFlexfieldSegments(body.flexfield_segments, errors);

  rejectForbiddenFields(errors, body, FORBIDDEN_TRANSACTION_FIELDS);

  throwIfErrors(errors);

  return {
    enterprise_id,
    flexfield_segments,
    effective_start_date,
    effective_end_date,
    status_code,
    comments,
    created_by
  };
}

export function validateUpdateSystemDefaultCostingBody(body = {}, _req) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });

  const effective_start_date = parseDateField(
    errors,
    body.effective_start_date,
    'effective_start_date',
    { required: true }
  );
  const effective_end_date = parseDateField(
    errors,
    body.effective_end_date,
    'effective_end_date',
    { required: true }
  );

  const status_code = parseUppercaseCode(errors, body.status_code, 'status_code', {
    required: true
  });

  const comments = parseOptionalText(body.comments);
  const updated_by = parseOptionalText(body.updated_by);

  const flexfield_segments = validateFlexfieldSegments(body.flexfield_segments, errors);

  rejectForbiddenFields(errors, body, FORBIDDEN_TRANSACTION_FIELDS);

  throwIfErrors(errors);

  return {
    enterprise_id,
    flexfield_segments,
    effective_start_date,
    effective_end_date,
    status_code,
    comments,
    updated_by
  };
}

export function validateDeleteSystemDefaultCostingBody(_body = {}, _query = {}) {
  return {};
}
