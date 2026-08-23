import express from 'express';
import GradeModel from '../model/grades_model.js';
import EntLookupValueModel from '../../../look_ups/ent/ent_lookup_values/model/entLookupValueModel.js';
import { validateGradeNumberForCategory } from '../../../../utils/gradeUtils.js';
import { applyGradeCurrencyCode } from '../utils/gradeCurrency.js';
import { toUpperCaseKeys } from '../../../../utils/stringUtils.js';
import { getTenantId, requireTenantIdInBody } from '../../../../utils/tenantUtils.js';
import { getUserId } from '../../../../utils/requestUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  sendGradeList,
  sendGrade,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendBadRequest,
  sendServerError,
  sendConflict
} from '../view/grade_view.js';

const router = express.Router();

const GRADE_NUMBER_LOOKUP_TYPE = 'GRADE_NUMBER';
const GRADE_CATEGORY_LOOKUP_TYPE = 'GRADE_CATEGORY';
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** In-memory cache for grade number lookup map: { [enterpriseId]: { data, expiresAt } } */
const gradeNumberLookupCache = new Map();

/** In-memory cache for grade category → prefix map: { [enterpriseId]: { data, expiresAt } } */
const gradeCategoryLookupCache = new Map();

/** In-memory cache for grade category code → { meaning_en, meaning_ar }: { [enterpriseId]: { data, expiresAt } } */
const gradeCategoryNameLookupCache = new Map();

function toLookupKey(code) {
  return (code ?? '').toString().trim().toUpperCase();
}

function isValidEnterpriseId(enterpriseId) {
  const id = Number(enterpriseId);
  return enterpriseId != null && enterpriseId !== '' && Number.isFinite(id) && id >= 1;
}

/**
 * Fetches GRADE_NUMBER lookup values for the tenant (enterprise_id) and returns
 * a map from normalized lookup_code (uppercase, e.g. "P1") to { meaning_en, meaning_ar }.
 * Results are cached for LOOKUP_CACHE_TTL_MS to improve response time.
 */
async function getGradeNumberLookupMap(enterpriseId) {
  if (!isValidEnterpriseId(enterpriseId)) return {};
  const id = Number(enterpriseId);
  const now = Date.now();
  const cached = gradeNumberLookupCache.get(id);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const result = await EntLookupValueModel.findAll({
      enterpriseId: id,
      lookupType: GRADE_NUMBER_LOOKUP_TYPE,
      pagination: { page: 1, pageSize: 500 }
    });
    const list = result?.lookupValues || [];
    const data = Object.create(null);
    for (const row of list) {
      const code = toLookupKey(row.lookup_code ?? row.LOOKUP_CODE);
      if (code) {
        data[code] = {
          meaning_en: row.meaning_en ?? row.MEANING_EN ?? null,
          meaning_ar: row.meaning_ar ?? row.MEANING_AR ?? null
        };
      }
    }
    gradeNumberLookupCache.set(id, { data, expiresAt: now + LOOKUP_CACHE_TTL_MS });
    return data;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Grade number lookup fetch failed:', err?.message ?? err);
    }
    return {};
  }
}

/**
 * Fetches GRADE_CATEGORY lookup values for the tenant and returns a map from
 * category code/name (uppercase) to prefix. LOOKUP_CODE = prefix; MEANING_EN is also mapped to that prefix.
 * Used for dynamic validation of GRADE_CATEGORY in create/update grade.
 * Returns null when no lookup data exists (validation then uses fallback: short uppercase category = prefix).
 */
async function getGradeCategoryMap(enterpriseId) {
  if (!isValidEnterpriseId(enterpriseId)) return null;
  const id = Number(enterpriseId);
  const now = Date.now();
  const cached = gradeCategoryLookupCache.get(id);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const result = await EntLookupValueModel.findAll({
      enterpriseId: id,
      lookupType: GRADE_CATEGORY_LOOKUP_TYPE,
      pagination: { page: 1, pageSize: 500 }
    });
    const list = result?.lookupValues || [];
    if (list.length === 0) {
      gradeCategoryLookupCache.set(id, { data: null, expiresAt: now + LOOKUP_CACHE_TTL_MS });
      return null;
    }
    const data = Object.create(null);
    for (const row of list) {
      const code = toLookupKey(row.lookup_code ?? row.LOOKUP_CODE);
      const meaning = toLookupKey(row.meaning_en ?? row.MEANING_EN);
      if (code) {
        data[code] = code;
        if (meaning && meaning !== code) data[meaning] = code;
      }
    }
    gradeCategoryLookupCache.set(id, { data, expiresAt: now + LOOKUP_CACHE_TTL_MS });
    return data;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Grade category lookup fetch failed:', err?.message ?? err);
    }
    return null;
  }
}

/**
 * Fetches GRADE_CATEGORY lookup values for the tenant and returns a map from
 * category code (uppercase) to { meaning_en, meaning_ar } for display in API responses.
 */
async function getGradeCategoryNameMap(enterpriseId) {
  if (!isValidEnterpriseId(enterpriseId)) return {};
  const id = Number(enterpriseId);
  const now = Date.now();
  const cached = gradeCategoryNameLookupCache.get(id);
  if (cached && cached.expiresAt > now) return cached.data;

  try {
    const result = await EntLookupValueModel.findAll({
      enterpriseId: id,
      lookupType: GRADE_CATEGORY_LOOKUP_TYPE,
      pagination: { page: 1, pageSize: 500 }
    });
    const list = result?.lookupValues || [];
    const data = Object.create(null);
    for (const row of list) {
      const code = toLookupKey(row.lookup_code ?? row.LOOKUP_CODE);
      if (code) {
        data[code] = {
          meaning_en: row.meaning_en ?? row.MEANING_EN ?? null,
          meaning_ar: row.meaning_ar ?? row.MEANING_AR ?? null
        };
      }
    }
    gradeCategoryNameLookupCache.set(id, { data, expiresAt: now + LOOKUP_CACHE_TTL_MS });
    return data;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Grade category name lookup fetch failed:', err?.message ?? err);
    }
    return {};
  }
}

/**
 * Enriches one grade or an array of grades with grade_number_obj { meaning_en, meaning_ar }.
 * Lookup is case-insensitive (normalized to uppercase).
 */
function enrichWithGradeNumberNames(items, lookupMap) {
  if (!lookupMap || Object.keys(lookupMap).length === 0) return items;
  const one = (g) => {
    const code = toLookupKey(g?.grade_number ?? g?.GRADE_NUMBER);
    const names = code ? lookupMap[code] : null;
    return {
      ...g,
      grade_number_obj: names
        ? { meaning_en: names.meaning_en ?? null, meaning_ar: names.meaning_ar ?? null }
        : null
    };
  };
  return Array.isArray(items) ? items.map(one) : (items ? one(items) : items);
}

/**
 * Enriches one grade or an array of grades with grade_category_obj { meaning_en, meaning_ar }.
 * Lookup is case-insensitive (normalized to uppercase).
 */
function enrichWithGradeCategoryNames(items, categoryNameMap) {
  if (!categoryNameMap || Object.keys(categoryNameMap).length === 0) return items;
  const one = (g) => {
    const code = toLookupKey(g?.grade_category ?? g?.GRADE_CATEGORY);
    const names = code ? categoryNameMap[code] : null;
    return {
      ...g,
      grade_category_obj: names
        ? { meaning_en: names.meaning_en ?? null, meaning_ar: names.meaning_ar ?? null }
        : null
    };
  };
  return Array.isArray(items) ? items.map(one) : (items ? one(items) : items);
}

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

/**
 * @param {Object} data - Grade payload
 * @param {boolean} isUpdate - Whether this is an update
 * @param {Object.<string, string>|null|undefined} [categoryToPrefixMap] - Optional map from category/code to prefix (from GRADE_CATEGORY lookup). When null/undefined, validation uses fallback (short uppercase category = prefix).
 */
function validateGradeData(data, isUpdate = false, categoryToPrefixMap = null) {
  const errors = [];

  const requiredOnCreate = (field) => !isUpdate && (!data[field] && data[field] !== 0);
  const emptyIfProvided = (field) => isUpdate && data[field] !== undefined && String(data[field]).trim() === '';

  if (requiredOnCreate('GRADE_NUMBER')) errors.push('GRADE_NUMBER is required');
  if (requiredOnCreate('GRADE_CATEGORY')) errors.push('GRADE_CATEGORY is required');

  // Grade number must belong to selected category (prefix + format); categories from lookup when provided
  const gradeNumber = data.GRADE_NUMBER ?? data.grade_number;
  const gradeCategory = data.GRADE_CATEGORY ?? data.grade_category;
  if (gradeNumber != null && gradeCategory != null && String(gradeNumber).trim() && String(gradeCategory).trim()) {
    const check = validateGradeNumberForCategory(gradeNumber, gradeCategory, categoryToPrefixMap);
    if (!check.valid) errors.push(check.error);
  }

  // Steps are ALWAYS required on create
  const stepFields = ['STEP_1_SALARY','STEP_2_SALARY','STEP_3_SALARY','STEP_4_SALARY','STEP_5_SALARY'];
  if (!isUpdate) {
    for (const f of stepFields) {
      if (data[f] === undefined || data[f] === null || data[f] === '') {
        errors.push(`${f} is required`);
      } else if (isNaN(Number(data[f])) || Number(data[f]) < 0) {
        errors.push(`${f} must be a non-negative number`);
      }
    }
  } else {
    // On update, validate provided step fields only
    for (const f of stepFields) {
      if (data[f] !== undefined) {
        if (data[f] === null || data[f] === '' || isNaN(Number(data[f])) || Number(data[f]) < 0) {
          errors.push(`${f} must be a non-negative number`);
        }
      }
    }
  }

  applyGradeCurrencyCode(data, errors);

  if (data.STATUS !== undefined && String(data.STATUS).trim() !== '') {
    const validStatuses = ['ACTIVE', 'INACTIVE'];
    if (!validStatuses.includes(String(data.STATUS).toUpperCase())) {
      errors.push(`STATUS must be one of: ${validStatuses.join(', ')}`);
    }
  }

  if (data.DESCRIPTION !== undefined && data.DESCRIPTION !== null && String(data.DESCRIPTION).length > 500) {
    errors.push('DESCRIPTION must be 500 characters or less');
  }

  // Optional strict rule: ensure steps increasing if all present
  const s1 = data.STEP_1_SALARY, s2 = data.STEP_2_SALARY, s3 = data.STEP_3_SALARY, s4 = data.STEP_4_SALARY, s5 = data.STEP_5_SALARY;
  const allStepsProvided =
    [s1,s2,s3,s4,s5].every(v => v !== undefined && v !== null && v !== '' && !isNaN(Number(v)));

  if (allStepsProvided) {
    const n1 = Number(s1), n2 = Number(s2), n3 = Number(s3), n4 = Number(s4), n5 = Number(s5);
    if (!(n1 <= n2 && n2 <= n3 && n3 <= n4 && n4 <= n5)) {
      errors.push('Steps must be increasing (STEP_1 <= STEP_2 <= STEP_3 <= STEP_4 <= STEP_5)');
    }
  }

  if (!isUpdate) {
    if (requiredOnCreate('LAST_UPDATE_LOGIN')) errors.push('LAST_UPDATE_LOGIN is required');
  } else {
    if (data.LAST_UPDATE_LOGIN !== undefined && String(data.LAST_UPDATE_LOGIN).trim() === '') {
      errors.push('LAST_UPDATE_LOGIN cannot be empty');
    }
  }

  // Basic empty checks on update
  if (emptyIfProvided('GRADE_NUMBER')) errors.push('GRADE_NUMBER cannot be empty');
  if (emptyIfProvided('GRADE_CATEGORY')) errors.push('GRADE_CATEGORY cannot be empty');

  return errors;
}

/**
 * GET /api/grades
 * Query:
 *  grade_id, grade_number, grade_category, status, isActive, search
 *  page, page_size
 */
router.get('/', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const filters = { tenant_id: tenantId };
    const appliedFilters = {};

    if (req.query.grade_id) {
      filters.gradeId = parseInt(req.query.grade_id);
      if (isNaN(filters.gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');
      appliedFilters.grade_id = filters.gradeId;
    }

    if (req.query.search) {
      filters.search = req.query.search;
      appliedFilters.search = filters.search;
    }

    if (req.query.grade_number) {
      filters.gradeNumber = req.query.grade_number;
      appliedFilters.grade_number = filters.gradeNumber;
    }

    if (req.query.grade_category) {
      filters.gradeCategory = req.query.grade_category;
      appliedFilters.grade_category = filters.gradeCategory;
    }

    if (req.query.status) {
      filters.status = req.query.status.toUpperCase();
      appliedFilters.status = filters.status;
    }

    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      appliedFilters.is_active = filters.isActive;
    }

    let page = 1;
    let pageSize = 10;

    if (req.query.page !== undefined) {
      const p = parseInt(req.query.page);
      if (isNaN(p) || p < 1) return sendBadRequest(res, req, 'Invalid page number.');
      page = p;
    }

    if (req.query.page_size !== undefined || req.query.limit !== undefined) {
      const ps = parseInt(req.query.page_size || req.query.limit);
      if (isNaN(ps) || ps < 1) return sendBadRequest(res, req, 'Invalid page_size.');
      pageSize = Math.min(100, ps);
    }

    filters.pagination = { page, pageSize };

    const [result, lookupMap, categoryNameMap] = await Promise.all([
      GradeModel.findAll(filters),
      getGradeNumberLookupMap(tenantId),
      getGradeCategoryNameMap(tenantId)
    ]);
    const gradesRaw = result.grades || result;
    const gradesWithNumber = enrichWithGradeNumberNames(gradesRaw, lookupMap);
    const grades = enrichWithGradeCategoryNames(gradesWithNumber, categoryNameMap);

    const totalCount = result.total || result.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNext = page < totalPages;
    const hasPrevious = page > 1;

    sendGradeList(res, req, grades, {
      filters: Object.keys(appliedFilters).length ? appliedFilters : undefined,
      total: totalCount,
      pagination: { page, pageSize, totalPages, hasNext, hasPrevious }
    });
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch grades', error);
  }
});

/**
 * GET /api/grades/:id
 * Query: tenant_id (required)
 * Returns all grade fields including currency_code.
 */
router.get('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const grade = await GradeModel.findById(gradeId, tenantId);
    if (!grade) return sendGrade(res, req, null);
    const [lookupMap, categoryNameMap] = await Promise.all([
      getGradeNumberLookupMap(tenantId),
      getGradeCategoryNameMap(tenantId)
    ]);
    const withNumber = enrichWithGradeNumberNames(grade, lookupMap);
    sendGrade(res, req, enrichWithGradeCategoryNames(withNumber, categoryNameMap));
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to fetch grade', error);
  }
});

/**
 * POST /api/grades
 * Body: GRADE_NUMBER, GRADE_CATEGORY, CURRENCY_CODE?, STEP_1_SALARY…STEP_5_SALARY, DESCRIPTION?, STATUS?, LAST_UPDATE_LOGIN
 */
router.post('/', async (req, res) => {
  try {
    const data = toUpperCaseKeys(req.body);
    data.tenant_id = requireTenantIdInBody(data);

    const categoryMap = await getGradeCategoryMap(data.tenant_id);
    const errors = validateGradeData(data, false, categoryMap);
    if (errors.length) return sendBadRequest(res, req, errors);

    const userId = getUserId(req);
    const created = await GradeModel.create(data, userId);
    sendCreated(res, req, created);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to create grade', error);
  }
});

/**
 * PUT /api/grades/:id
 * Body/Query: tenant_id (required for filtering). Partial updates supported, including CURRENCY_CODE.
 */
router.put('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const data = toUpperCaseKeys(req.body);
    const categoryMap = await getGradeCategoryMap(tenantId);
    const errors = validateGradeData(data, true, categoryMap);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const updated = await GradeModel.update(gradeId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update grade', error);
  }
});

/**
 * PATCH /api/grades/:id
 * Partial update; CURRENCY_CODE is optional and must be a 3-letter ISO-style code when provided.
 */
router.patch('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const data = toUpperCaseKeys(req.body);
    const categoryMap = await getGradeCategoryMap(tenantId);
    const errors = validateGradeData(data, true, categoryMap);
    if (errors.length) return sendBadRequest(res, req, errors);

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const updated = await GradeModel.update(gradeId, data, userId, tenantId);
    sendUpdated(res, req, updated);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    if (error.code === 'UNIQUE_CONSTRAINT_VIOLATION' && error.statusCode === 409) {
      return sendConflict(res, req, error.userMessage || error.message, {
        constraint: error.constraint,
        columns: error.columns
      });
    }
    sendServerError(res, req, 'Failed to update grade', error);
  }
});

/**
 * DELETE /api/grades/:id
 * Query: tenant_id (required), hard?
 */
router.delete('/:id', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const gradeId = parseInt(req.params.id);
    if (isNaN(gradeId)) return sendBadRequest(res, req, 'Invalid GRADE_ID format');

    const existing = await GradeModel.findById(gradeId, tenantId);
    if (!existing) return sendGrade(res, req, null);

    const userId = getUserId(req);
    const isHardDelete = req.query.hard === 'true' || req.query.hard === '1';

    if (isHardDelete) {
      await GradeModel.hardDelete(gradeId, tenantId);
      return sendDeleted(res, req, 'Grade permanently deleted', gradeId);
    }

    await GradeModel.softDelete(gradeId, userId, tenantId);
    return sendDeleted(res, req, 'Grade deactivated (soft delete)', gradeId);
  } catch (error) {
    if (error instanceof ValidationError) return sendBadRequest(res, req, error.message);
    sendServerError(res, req, 'Failed to delete grade', error);
  }
});

export default router;
