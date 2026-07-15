import { ForbiddenError, NotFoundError } from '../../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';
import { getElementEntryFromViewByGuid } from '../model/payElementEntriesViewModel.js';
import {
  assertEnterpriseAccess,
  parseElementEntryGuidParam,
  validateCreateElementEntryBody,
  validateExportElementEntriesQuery,
  validateListElementEntriesQuery,
  validateUpdateElementEntryBody
} from '../validations/payElementEntries.validation.js';
import {
  sendForbiddenError,
  sendNotFoundError,
  sendValidationError
} from '../controllers/payElementEntriesControllerHelpers.js';

export function validateListElementEntries(req, res, next) {
  try {
    const filters = validateListElementEntriesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateExportElementEntries(req, res, next) {
  try {
    const filters = validateExportElementEntriesQuery(req.query || {});
    assertEnterpriseAccess(req, filters.enterprise_id);
    req.validated = filters;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export function validateCreateElementEntry(req, res, next) {
  try {
    const body = validateCreateElementEntryBody(req.body || {});
    assertEnterpriseAccess(req, Number(body.enterprise_id));
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendValidationError(res, err);
  }
}

export async function validateUpdateElementEntry(req, res, next) {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.elementEntryGuid);
    const body = validateUpdateElementEntryBody(req.body || {});

    const enterpriseIdRaw =
      body.enterprise_id ?? req.query?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let entry;
    if (enterpriseId != null) {
      entry = await assertEntryEnterpriseAccess(req, elementEntryGuid, enterpriseId);
    } else {
      entry = await getElementEntryFromViewByGuid(elementEntryGuid);
      if (!entry) throw new NotFoundError('Element entry not found');
      assertEnterpriseAccess(req, entry.enterprise_id);
      enterpriseId = entry.enterprise_id;
    }

    req.elementEntryGuid = elementEntryGuid;
    req.enterpriseId = enterpriseId;
    req.elementEntry = entry;
    req.validated = body;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

async function assertEntryEnterpriseAccess(req, elementEntryGuid, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }

  const entry = await getElementEntryFromViewByGuid(elementEntryGuid, enterpriseId);
  if (!entry) {
    throw new NotFoundError('Element entry not found');
  }
  return entry;
}

export async function validateGetElementEntryByGuid(req, res, next) {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.elementEntryGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw, 'enterprise_id is required');
    }

    let entry;
    if (enterpriseId != null) {
      entry = await assertEntryEnterpriseAccess(req, elementEntryGuid, enterpriseId);
    } else {
      entry = await getElementEntryFromViewByGuid(elementEntryGuid);
      if (!entry) throw new NotFoundError('Element entry not found');
      assertEnterpriseAccess(req, entry.enterprise_id);
      enterpriseId = entry.enterprise_id;
    }

    req.elementEntryGuid = elementEntryGuid;
    req.enterpriseId = enterpriseId;
    req.elementEntry = entry;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}

export async function validateDeleteElementEntry(req, res, next) {
  try {
    const elementEntryGuid = parseElementEntryGuidParam(req.params.elementEntryGuid);
    const enterpriseIdRaw =
      req.query?.enterprise_id ?? req.body?.enterprise_id ?? getActingEnterpriseId(req);

    let enterpriseId = null;
    if (enterpriseIdRaw != null && String(enterpriseIdRaw).trim() !== '') {
      enterpriseId = parseEnterpriseId(enterpriseIdRaw);
    }

    let entry;
    if (enterpriseId != null) {
      entry = await assertEntryEnterpriseAccess(req, elementEntryGuid, enterpriseId);
    } else {
      entry = await getElementEntryFromViewByGuid(elementEntryGuid);
      if (!entry) throw new NotFoundError('Element entry not found');
      assertEnterpriseAccess(req, entry.enterprise_id);
      enterpriseId = entry.enterprise_id;
    }

    req.elementEntryGuid = elementEntryGuid;
    req.enterpriseId = enterpriseId;
    req.elementEntry = entry;
    next();
  } catch (err) {
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err.message);
    return sendValidationError(res, err);
  }
}
