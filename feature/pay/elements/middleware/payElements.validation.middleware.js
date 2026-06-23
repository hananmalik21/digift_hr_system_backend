import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getPayElementFromViewByGuid } from '../model/payElementsViewModel.js';
import {
  assertEnterpriseAccess,
  parseElementGuidParam,
  validateCreateElementBody,
  validateListElementsQuery,
  validateUpdateElementBody
} from '../validations/payElements.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementsControllerHelpers.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateListElements(req, res, next) {
  try {
    const filters = validateListElementsQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateCreateElement(req, res, next) {
  try {
    const body = validateCreateElementBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateUpdateElement(req, res, next) {
  try {
    const elementGuid = parseElementGuidParam(req.params.elementGuid);
    const body = validateUpdateElementBody(req.body || {});
    assertEnterpriseAccess(req, body.enterprise_id);
    req.elementGuid = elementGuid;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {string} elementGuid
 * @param {number} enterpriseId
 */
async function assertElementEnterpriseAccess(req, elementGuid, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }

  const element = await getPayElementFromViewByGuid(elementGuid, enterpriseId);
  if (!element) {
    throw new NotFoundError('Element not found');
  }
  return element;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateGetElementByGuid(req, res, next) {
  try {
    const elementGuid = parseElementGuidParam(req.params.elementGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let element;
    if (enterpriseId != null) {
      element = await assertElementEnterpriseAccess(req, elementGuid, enterpriseId);
    } else {
      element = await getPayElementFromViewByGuid(elementGuid);
      if (!element) throw new NotFoundError('Element not found');
      assertEnterpriseAccess(req, element.enterprise_id);
      enterpriseId = element.enterprise_id;
    }

    req.elementGuid = elementGuid;
    req.enterpriseId = enterpriseId;
    req.element = element;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateDeleteElement(req, res, next) {
  try {
    const elementGuid = parseElementGuidParam(req.params.elementGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let element;
    if (enterpriseId != null) {
      element = await assertElementEnterpriseAccess(req, elementGuid, enterpriseId);
    } else {
      element = await getPayElementFromViewByGuid(elementGuid);
      if (!element) throw new NotFoundError('Element not found');
      assertEnterpriseAccess(req, element.enterprise_id);
      enterpriseId = element.enterprise_id;
    }

    req.elementGuid = elementGuid;
    req.enterpriseId = enterpriseId;
    req.element = element;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
