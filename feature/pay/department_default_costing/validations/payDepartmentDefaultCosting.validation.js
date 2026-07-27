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
  MAX_LIMIT,
  MAX_SEARCH_LENGTH
} from '../constants/payDepartmentDefaultCosting.constants.js';

export { firstValidationMessage, assertEnterpriseAccess };

const MAX_ALLOCATION_PERCENTAGE = 100;

export function parseDepartmentDefaultCostingGuidParam(raw) {
  return parseGuid(raw, 'deptDefaultCostingGuid');
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

function parseAllocationPercentage(errors, raw) {
  const n = parsePositiveInteger(errors, raw, 'allocation_percentage', { required: true });
  if (n == null) return null;
  if (n > MAX_ALLOCATION_PERCENTAGE) {
    errors.push('allocation_percentage must be greater than 0 and not greater than 100.');
    return null;
  }
  return n;
}

function rejectForbiddenFields(errors, body, forbiddenKeys) {
  for (const k of forbiddenKeys) {
    if (!Object.prototype.hasOwnProperty.call(body, k)) continue;
    errors.push(`${k} is not allowed.`);
  }
}

const FORBIDDEN_TRANSACTION_FIELDS = [
  'department_code',
  'department_name',
  'department_name_en',
  'department_name_ar',
  'combined_account_code',
  'cost_center_id',
  'cost_center_code',
  'element_id',
  'employee_id',
  'assignment_id',
  'position_id'
];

export function validateListDepartmentDefaultCostingQuery(query = {}, req) {
  const errors = [];

  const enterprise_id = resolveRequiredEnterpriseIdFromQuery(req, query.enterprise_id, errors);
  const department_id = isBlank(query.department_id)
    ? null
    : parseGuid(query.department_id, 'department_id');
  const department_code = parseOptionalUppercaseCode(
    errors,
    query.department_code,
    'department_code'
  );
  const status_code = parseOptionalUppercaseCode(errors, query.status_code, 'status_code');

  const search = parseOptionalText(query.search);
  if (search != null && search.length > MAX_SEARCH_LENGTH) {
    errors.push(`search must be at most ${MAX_SEARCH_LENGTH} characters`);
  }

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
    department_id,
    department_code,
    status_code,
    search,
    page,
    limit,
    offset
  };
}

export function validateGetDepartmentDefaultCostingByGuidQuery(query = {}, req) {
  const errors = [];
  const enterprise_id = resolveRequiredEnterpriseIdFromQuery(req, query.enterprise_id, errors);
  throwIfErrors(errors);
  return { enterprise_id };
}

export function validateCreateDepartmentDefaultCostingBody(body = {}, _req) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const department_id = parseGuid(body.department_id, 'department_id');

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

  const allocation_percentage = parseAllocationPercentage(errors, body.allocation_percentage);
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
    department_id,
    flexfield_segments,
    effective_start_date,
    effective_end_date,
    allocation_percentage,
    status_code,
    comments,
    created_by
  };
}

export function validateUpdateDepartmentDefaultCostingBody(body = {}, _req) {
  const errors = [];

  const enterprise_id = parseEnterpriseIdField(errors, body.enterprise_id, { required: true });
  const department_id = parseGuid(body.department_id, 'department_id');

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

  const allocation_percentage = parseAllocationPercentage(errors, body.allocation_percentage);
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
    department_id,
    flexfield_segments,
    effective_start_date,
    effective_end_date,
    allocation_percentage,
    status_code,
    comments,
    updated_by
  };
}

export function validateDeleteDepartmentDefaultCostingBody(_body = {}, _query = {}) {
  return {};
}
