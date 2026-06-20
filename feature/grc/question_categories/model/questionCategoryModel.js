import oracledb from 'oracledb';
import { parseCategoryGuid } from '../../../../utils/guidUtils.js';
import {
  withConnection,
  strOrNull,
  numOrNull,
  wrapOracleDbError
} from '../../../../utils/oraclePackageUtils.js';
import { parsePageLimit, buildListResponse, LARGE_PAGE_LIMIT_OPTS } from '../../../../utils/paginationUtils.js';
import { ValidationError, NotFoundError, ConflictError } from '../../../../utils/errors/index.js';
import { toIso, normalizeGuid, mapEnterpriseIdField, mapLookupValueScope } from '../../../../utils/rowMapperUtils.js';
import { validateActiveFlag, parseOptionalActiveFlag, validateDisplaySequence } from '../../../../utils/validationUtils.js';
import { parseEnterpriseId } from '../../../../utils/tenantUtils.js';

const PKG = 'GRC.GRC_QUESTION_CATEGORY_PKG';
const VIEW = 'GRC.V_QUESTION_CATEGORIES';

const GET_SELECT_COLUMNS = `
    ENTERPRISE_ID,
    CATEGORY_GUID,
    CATEGORY_NAME,
    DESCRIPTION,
    WEIGHT_PERCENT,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE,
    QUESTIONS_COUNT`;

const LIST_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (:category_name IS NULL OR UPPER(CATEGORY_NAME) LIKE '%' || UPPER(:category_name) || '%')
  ORDER BY CATEGORY_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS}
  FROM ${VIEW}
  WHERE UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND ENTERPRISE_ID = :enterprise_id`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_CATEGORY(
    p_enterprise_id     => :p_enterprise_id,
    p_category_name   => :p_category_name,
    p_description     => :p_description,
    p_weight_percent  => :p_weight_percent,
    p_created_by      => :p_created_by,
    p_category_id     => :p_category_id,
    p_category_guid   => :p_category_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_CATEGORY(
    p_enterprise_id   => :p_enterprise_id,
    p_category_guid   => :p_category_guid,
    p_category_name   => :p_category_name,
    p_description     => :p_description,
    p_weight_percent  => :p_weight_percent,
    p_active_flag     => :p_active_flag,
    p_updated_by      => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_CATEGORY(
    p_enterprise_id   => :p_enterprise_id,
    p_category_guid   => :p_category_guid
  );
END;`;

const DUPLICATE_CATEGORY_SQL = `
  SELECT 1 AS HIT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND UPPER(CATEGORY_NAME) = UPPER(:category_name)
    AND (:exclude_guid IS NULL OR UPPER(CATEGORY_GUID) <> UPPER(:exclude_guid))
  FETCH FIRST 1 ROWS ONLY`;

function validateWeightPercent(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError('weight_percent is required.');
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError('weight_percent must be between 0 and 100.');
  }
}

function validateCategoryName(value, { required = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new ValidationError('Category name is required.');
    return;
  }
}

function validateCreateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  validateCategoryName(body?.category_name, { required: true });
  validateWeightPercent(body?.weight_percent);
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.category_name !== undefined) {
    validateCategoryName(body.category_name, { required: true });
  }
  if (body?.weight_percent !== undefined) {
    validateWeightPercent(body.weight_percent);
  }
  validateActiveFlag(body?.active_flag);
}

/** @param {Record<string, unknown>} row */
function mapCategoryRow(row) {
  if (!row) return null;
  const weightPercent = row.WEIGHT_PERCENT ?? row.weight_percent;
  const questionsCount = row.QUESTIONS_COUNT ?? row.questions_count;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    category_guid: normalizeGuid(row.CATEGORY_GUID ?? row.category_guid),
    category_name: row.CATEGORY_NAME ?? row.category_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    weight_percent: weightPercent != null ? Number(weightPercent) : null,
    questions_count: questionsCount != null ? Number(questionsCount) : 0,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    created_by: row.CREATED_BY ?? row.created_by ?? null,
    creation_date: toIso(row.CREATION_DATE ?? row.creation_date),
    last_updated_by: row.LAST_UPDATED_BY ?? row.last_updated_by ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE ?? row.last_update_date)
  };
}

function parseListFilters(filters = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);

  const categoryName = strOrNull(filters.category_name);
  return { enterprise_id: enterpriseId, active_flag: activeFlag, category_name: categoryName };
}

async function assertCategoryNameAvailable(connection, enterpriseId, categoryName, excludeGuid = null) {
  const name = strOrNull(categoryName);
  if (!name) return;

  const result = await connection.execute(
    DUPLICATE_CATEGORY_SQL,
    { enterprise_id: enterpriseId, category_name: name, exclude_guid: excludeGuid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (result.rows?.length) {
    throw new ConflictError('Category name already exists.');
  }
}

/**
 * @param {{ active_flag?: string, category_name?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listQuestionCategories(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const binds = {
    enterprise_id: parsedFilters.enterprise_id,
    active_flag: parsedFilters.active_flag,
    category_name: parsedFilters.category_name,
    offset,
    limit
  };

  const result = await withConnection((connection) =>
    connection.execute(LIST_SQL, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
  );

  return buildListResponse(result.rows ?? [], page, limit, mapCategoryRow);
}

/**
 * @param {string} categoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getQuestionCategoryByGuid(categoryGuidRaw, enterpriseIdRaw) {
  const categoryGuid = parseCategoryGuid(categoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const result = await withConnection((connection) =>
    connection.execute(GET_BY_GUID_SQL, { category_guid: categoryGuid, enterprise_id: enterpriseId }, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    })
  );

  const row = result.rows?.[0];
  if (!row) return null;
  return mapCategoryRow(row);
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createQuestionCategory(body) {
  validateCreateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const binds = {
    p_enterprise_id: {
      val: enterpriseId,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_category_name: {
      val: strOrNull(body.category_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_weight_percent: {
      val: numOrNull(body.weight_percent),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_created_by: {
      val: strOrNull(body.created_by) ?? 'SYSTEM',
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_category_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_category_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
  };

  try {
    const result = await withConnection(async (connection) => {
      await assertCategoryNameAvailable(connection, enterpriseId, body.category_name);
      return connection.execute(CREATE_PLSQL, binds, { autoCommit: true });
    });
    const out = result.outBinds ?? {};
    return {
      category_id: out.p_category_id ?? null,
      category_guid: normalizeGuid(out.p_category_guid)
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} categoryGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateQuestionCategory(categoryGuidRaw, body) {
  const categoryGuid = parseCategoryGuid(categoryGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getQuestionCategoryByGuid(categoryGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Category not found.');
  }

  const categoryName = strOrNull(body.category_name) ?? existing.category_name;

  const binds = {
    p_enterprise_id: {
      val: enterpriseId,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_category_guid: {
      val: categoryGuid,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    },
    p_category_name: {
      val: categoryName,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_weight_percent: {
      val: numOrNull(body.weight_percent),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_active_flag: {
      val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_updated_by: {
      val: strOrNull(body.updated_by) ?? 'SYSTEM',
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    }
  };

  try {
    await withConnection(async (connection) => {
      await assertCategoryNameAvailable(connection, enterpriseId, categoryName, categoryGuid);
      await connection.execute(UPDATE_PLSQL, binds, { autoCommit: true });
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} categoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteQuestionCategory(categoryGuidRaw, enterpriseIdRaw) {
  const categoryGuid = parseCategoryGuid(categoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getQuestionCategoryByGuid(categoryGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Category not found.');
  }

  const binds = {
    p_enterprise_id: {
      val: enterpriseId,
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_category_guid: {
      val: categoryGuid,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    }
  };

  try {
    await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
  } catch (err) {
    wrapOracleDbError(err);
  }
}
