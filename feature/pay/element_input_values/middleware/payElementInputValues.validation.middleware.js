import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementInputValueFromViewByGuid } from '../model/payElementInputValuesViewModel.js';
import {
  assertEnterpriseAccess,
  parseInputValueGuidParam,
  validateCreateElementInputValueBody,
  validateListElementInputValuesQuery,
  validateUpdateElementInputValueBody
} from '../validations/payElementInputValues.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementInputValuesControllerHelpers.js';

export function validateListElementInputValues(req, res, next) {
  try {
    const filters = validateListElementInputValuesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementInputValue(req, res, next) {
  try {
    const body = validateCreateElementInputValueBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementInputValue(req, res, next) {
  try {
    const inputValueGuid = parseInputValueGuidParam(req.params.guid);
    const body = validateUpdateElementInputValueBody(req.body || {});
    req.inputValueGuid = inputValueGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementInputValueByGuid(req, res, next) {
  try {
    const inputValueGuid = parseInputValueGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementInputValueFromViewByGuid(inputValueGuid, enterpriseId);
    } else {
      row = await getPayElementInputValueFromViewByGuid(inputValueGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Input value not found');

    req.inputValueGuid = inputValueGuid;
    req.enterpriseId = row.enterprise_id;
    req.inputValue = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementInputValue(req, res, next) {
  try {
    const inputValueGuid = parseInputValueGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementInputValueFromViewByGuid(inputValueGuid, enterpriseId);
    } else {
      row = await getPayElementInputValueFromViewByGuid(inputValueGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Input value not found');

    req.inputValueGuid = inputValueGuid;
    req.enterpriseId = row.enterprise_id;
    req.inputValue = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
