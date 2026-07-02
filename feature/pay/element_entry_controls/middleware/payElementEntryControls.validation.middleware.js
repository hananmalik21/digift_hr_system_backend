import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementEntryControlFromViewByGuid } from '../model/payElementEntryControlsViewModel.js';
import {
  assertEnterpriseAccess,
  parseEntryControlGuidParam,
  validateCreateElementEntryControlBody,
  validateListElementEntryControlsQuery,
  validateUpdateElementEntryControlBody
} from '../validations/payElementEntryControls.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementEntryControlsControllerHelpers.js';

export function validateListElementEntryControls(req, res, next) {
  try {
    const filters = validateListElementEntryControlsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementEntryControl(req, res, next) {
  try {
    const body = validateCreateElementEntryControlBody(req.body || {});
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateUpdateElementEntryControl(req, res, next) {
  try {
    const entryControlGuid = parseEntryControlGuidParam(req.params.guid);
    const body = validateUpdateElementEntryControlBody(req.body || {});
    req.entryControlGuid = entryControlGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateGetElementEntryControlByGuid(req, res, next) {
  try {
    const entryControlGuid = parseEntryControlGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementEntryControlFromViewByGuid(entryControlGuid, enterpriseId);
    } else {
      row = await getPayElementEntryControlFromViewByGuid(entryControlGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Entry controls not found');

    req.entryControlGuid = entryControlGuid;
    req.enterpriseId = row.enterprise_id;
    req.entryControl = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementEntryControl(req, res, next) {
  try {
    const entryControlGuid = parseEntryControlGuidParam(req.params.guid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let row;
    if (enterpriseId != null) {
      assertEnterpriseAccess(req, enterpriseId);
      row = await getPayElementEntryControlFromViewByGuid(entryControlGuid, enterpriseId);
    } else {
      row = await getPayElementEntryControlFromViewByGuid(entryControlGuid);
      if (row) assertEnterpriseAccess(req, row.enterprise_id);
    }

    if (!row) throw new NotFoundError('Entry controls not found');

    req.entryControlGuid = entryControlGuid;
    req.enterpriseId = row.enterprise_id;
    req.entryControl = row;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
