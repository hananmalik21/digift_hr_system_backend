import express from 'express';
import '../swagger/enterprises.swagger.js';
import EnterpriseModel from '../model/enterpriseModel.js';
import {
  normalizeEnterpriseBody,
  parseEnterpriseListFilters,
  validateEnterpriseData
} from '../utils/enterpriseValidators.js';
import { provisionEnterpriseAdminOnEnterpriseCreate } from '../../../security/security.facade.js';
import { sendCreated, sendUpdated, sendDeleted, sendList, sendSuccess } from '@digifyhr/common';
import { toLowerCaseKeys } from '@digifyhr/common';
import { ValidationError, NotFoundError, ConflictError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';
import { invalidateEnterpriseResolveCacheForSlug } from '../service/resolveEnterpriseBySubdomain.js';
import {
  buildEnterpriseDeletePayload,
  HARD_DELETE_CONFLICT_MESSAGE,
  isFkDeleteConflict,
  parseAutoFallbackQuery,
  parseEnterpriseIdParam,
  parseHardDeleteQuery,
  resolveEnterpriseActor
} from '../utils/enterpriseDeleteParams.js';

const router = express.Router();
router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function requireEnterpriseId(rawId) {
  return parseEnterpriseIdParam(rawId);
}

async function requireEnterprise(enterpriseId) {
  const enterprise = await EnterpriseModel.findById(enterpriseId);
  if (!enterprise) throw new NotFoundError('Enterprise not found');
  return enterprise;
}

function sendSoftDeleted(res, result, message) {
  sendDeleted(res, {
    message: message || result.message || 'Enterprise deactivated successfully',
    data: {
      enterprise_id: result.enterprise_id,
      delete_type: 'SOFT',
      deleted: false,
      is_active: result.is_active || 'N'
    }
  });
}

function invalidateSlugCaches(...slugs) {
  for (const slug of slugs) {
    if (slug) invalidateEnterpriseResolveCacheForSlug(slug);
  }
}

async function updateEnterpriseHandler(req, res) {
  const enterpriseId = requireEnterpriseId(req.params.id);
  const data = normalizeEnterpriseBody(req.body);
  const errors = validateEnterpriseData(data, true);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const existingEnterprise = await requireEnterprise(enterpriseId);
  const existingCode = existingEnterprise.enterprise_code ?? existingEnterprise.ENTERPRISE_CODE;
  const existingSlug = existingEnterprise.subdomain_slug ?? existingEnterprise.SUBDOMAIN_SLUG;

  if (data.ENTERPRISE_CODE && data.ENTERPRISE_CODE !== existingCode) {
    const codeExists = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
    if (codeExists) {
      throw new ConflictError(`Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
    }
  }

  const actor = resolveEnterpriseActor(req);
  const updatedEnterprise = await EnterpriseModel.update(enterpriseId, data, actor);
  const converted = toLowerCaseKeys(updatedEnterprise);
  invalidateSlugCaches(existingSlug, data.SUBDOMAIN_SLUG, converted.subdomain_slug);

  sendUpdated(res, {
    message: 'Enterprise updated successfully',
    data: converted
  });
}

/**
 * @route   GET /api/enterprises
 */
router.get('/', asyncHandler(async (req, res) => {
  const { filters, appliedFilters, errors } = parseEnterpriseListFilters(req.query);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const enterprises = await EnterpriseModel.findAll(filters);

  sendList(res, {
    message: 'Enterprises fetched successfully',
    data: toLowerCaseKeys(enterprises),
    meta: {
      ...(Object.keys(appliedFilters).length > 0 && { filters: appliedFilters }),
      total: enterprises.length
    }
  });
}));

/**
 * @route   GET /api/enterprises/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = requireEnterpriseId(req.params.id);
  const enterprise = await requireEnterprise(enterpriseId);
  sendSuccess(res, {
    message: 'Enterprise fetched successfully',
    data: toLowerCaseKeys(enterprise)
  });
}));

/**
 * @route   POST /api/enterprises
 */
router.post('/', asyncHandler(async (req, res) => {
  const data = normalizeEnterpriseBody(req.body);
  const errors = validateEnterpriseData(data, false);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }

  const existingEnterprise = await EnterpriseModel.findByCode(data.ENTERPRISE_CODE);
  if (existingEnterprise) {
    throw new ConflictError(`Enterprise with code '${data.ENTERPRISE_CODE}' already exists`);
  }

  const actor = resolveEnterpriseActor(req);
  const newEnterprise = await EnterpriseModel.create(data, actor);
  const convertedEnterprise = toLowerCaseKeys(newEnterprise);
  const enterpriseId = convertedEnterprise.enterprise_id ?? convertedEnterprise.ENTERPRISE_ID;

  invalidateSlugCaches(data.SUBDOMAIN_SLUG, convertedEnterprise.subdomain_slug);

  const adminUser = await provisionEnterpriseAdminOnEnterpriseCreate({
    enterpriseId,
    enterpriseCode: convertedEnterprise.enterprise_code ?? data.ENTERPRISE_CODE,
    enterpriseName: convertedEnterprise.enterprise_name ?? data.ENTERPRISE_NAME
  });

  sendCreated(res, {
    message: 'Enterprise created successfully',
    data: convertedEnterprise,
    meta: {
      enterprise_admin: adminUser.ok
        ? {
            user_guid: adminUser.userGuid ?? null,
            created: adminUser.created === true,
            username: 'enterprise_admin'
          }
        : null,
      ...(adminUser.ok
        ? {}
        : { enterprise_admin_warning: adminUser.message ?? 'Failed to create enterprise admin user' })
    }
  });
}));

/**
 * @route   PUT /api/enterprises/:id
 */
router.put('/:id', asyncHandler(updateEnterpriseHandler));

/**
 * @route   PATCH /api/enterprises/:id
 */
router.patch('/:id', asyncHandler(updateEnterpriseHandler));

/**
 * @route   DELETE /api/enterprises/:id
 * @query   hard - true/1 for permanent deletion; false/omit for soft delete
 * @query   auto_fallback - true/1 to soft-delete when hard delete hits FK conflict
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const enterpriseId = requireEnterpriseId(req.params.id);
  const existing = await requireEnterprise(enterpriseId);
  const existingSlug = existing.subdomain_slug ?? existing.SUBDOMAIN_SLUG;

  const hardDelete = parseHardDeleteQuery(req.query.hard);
  const autoFallback = parseAutoFallbackQuery(req.query.auto_fallback);
  const actor = resolveEnterpriseActor(req);
  const payload = buildEnterpriseDeletePayload({ enterpriseId, hardDelete, actor });

  if (process.env.ENTERPRISE_DELETE_DEBUG === 'true') {
    console.log({
      action: 'DELETE',
      enterpriseId: req.params.id,
      hardQueryValue: req.query.hard,
      payload
    });
  }

  if (!hardDelete) {
    const softResult = await EnterpriseModel.softDelete(enterpriseId, actor);
    invalidateSlugCaches(existingSlug);
    sendSoftDeleted(res, softResult);
    return;
  }

  try {
    const result = await EnterpriseModel.hardDelete(enterpriseId, actor);
    invalidateSlugCaches(existingSlug);
    sendDeleted(res, {
      message: result.message || 'Enterprise permanently deleted',
      data: {
        enterprise_id: result.enterprise_id,
        delete_type: 'HARD',
        deleted: true
      }
    });
  } catch (deleteError) {
    if (!isFkDeleteConflict(deleteError)) throw deleteError;

    if (autoFallback) {
      const softResult = await EnterpriseModel.softDelete(enterpriseId, actor);
      invalidateSlugCaches(existingSlug);
      sendSoftDeleted(
        res,
        softResult,
        'Enterprise deactivated (cannot permanently delete due to existing references)'
      );
      return;
    }

    throw new ConflictError(
      HARD_DELETE_CONFLICT_MESSAGE,
      deleteError.constraint || null,
      null,
      deleteError.technicalMessage || deleteError.message,
      {
        enterprise_id: enterpriseId,
        delete_type: 'HARD'
      }
    );
  }
}));

export default router;
