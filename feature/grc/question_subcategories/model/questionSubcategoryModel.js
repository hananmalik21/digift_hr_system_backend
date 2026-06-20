import oracledb from 'oracledb';
import { parseCategoryGuid, parseSubcategoryGuid } from '../../../../utils/guidUtils.js';
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

const PKG = 'GRC.GRC_QUESTION_SUBCAT_PKG';
const VIEW = 'GRC.V_QUESTION_SUBCATEGORIES';
const CATEGORY_VIEW = 'GRC.V_QUESTION_CATEGORIES';

const GET_SELECT_COLUMNS = `
    ENTERPRISE_ID,
    SUBCATEGORY_ID,
    SUBCATEGORY_GUID,
    CATEGORY_ID,
    CATEGORY_GUID,
    CATEGORY_NAME,
    SUBCATEGORY_NAME,
    DESCRIPTION,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE`;

const LIST_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (:category_guid IS NULL OR UPPER(CATEGORY_GUID) = UPPER(:category_guid))
    AND (:category_name IS NULL OR UPPER(CATEGORY_NAME) LIKE '%' || UPPER(:category_name) || '%')
    AND (:subcategory_name IS NULL OR UPPER(SUBCATEGORY_NAME) LIKE '%' || UPPER(:subcategory_name) || '%')
  ORDER BY CATEGORY_NAME, SUBCATEGORY_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS}
  FROM ${VIEW}
  WHERE UPPER(SUBCATEGORY_GUID) = UPPER(:subcategory_guid)
    AND ENTERPRISE_ID = :enterprise_id`;

const LIST_BY_CATEGORY_SQL = `
  SELECT
    ENTERPRISE_ID,
    SUBCATEGORY_GUID,
    SUBCATEGORY_NAME,
    CATEGORY_NAME,
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND ENTERPRISE_ID = :enterprise_id
    AND ACTIVE_FLAG = 'Y'
  ORDER BY SUBCATEGORY_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const CATEGORY_EXISTS_SQL = `
  SELECT 1 AS HIT
  FROM ${CATEGORY_VIEW}
  WHERE UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND ENTERPRISE_ID = :enterprise_id
  FETCH FIRST 1 ROWS ONLY`;

const DUPLICATE_SUBCATEGORY_SQL = `
  SELECT 1 AS HIT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND UPPER(SUBCATEGORY_NAME) = UPPER(:subcategory_name)
    AND (:exclude_guid IS NULL OR UPPER(SUBCATEGORY_GUID) <> UPPER(:exclude_guid))
  FETCH FIRST 1 ROWS ONLY`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_SUBCATEGORY(
    p_enterprise_id       => :p_enterprise_id,
    p_category_guid     => :p_category_guid,
    p_subcategory_name  => :p_subcategory_name,
    p_description       => :p_description,
    p_created_by        => :p_created_by,
    p_subcategory_id    => :p_subcategory_id,
    p_subcategory_guid  => :p_subcategory_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_SUBCATEGORY(
    p_enterprise_id       => :p_enterprise_id,
    p_subcategory_guid  => :p_subcategory_guid,
    p_category_guid     => :p_category_guid,
    p_subcategory_name  => :p_subcategory_name,
    p_description       => :p_description,
    p_active_flag       => :p_active_flag,
    p_updated_by        => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_SUBCATEGORY(
    p_enterprise_id      => :p_enterprise_id,
    p_subcategory_guid => :p_subcategory_guid
  );
END;`;

const MAX_SUBCATEGORY_NAME_LENGTH = 200;

function outNumber(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function outString(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function validateSubcategoryName(value, { required = false } = {}) {
  const name = strOrNull(value);
  if (!name) {
    if (required) throw new ValidationError('Subcategory name is required.');
    return;
  }
  if (name.length > MAX_SUBCATEGORY_NAME_LENGTH) {
    throw new ValidationError('Subcategory name cannot exceed 200 characters.');
  }
}

function validateCreateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (!strOrNull(body?.category_guid)) {
    throw new ValidationError('category_guid is required.');
  }
  parseCategoryGuid(body.category_guid);
  validateSubcategoryName(body?.subcategory_name, { required: true });
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.category_guid !== undefined) {
    if (!strOrNull(body.category_guid)) {
      throw new ValidationError('category_guid is required.');
    }
    parseCategoryGuid(body.category_guid);
  }
  if (body?.subcategory_name !== undefined) {
    validateSubcategoryName(body.subcategory_name, { required: true });
  }
  validateActiveFlag(body?.active_flag);
}

/** @param {Record<string, unknown>} row */
function mapSubcategoryRow(row) {
  if (!row) return null;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    subcategory_id: row.SUBCATEGORY_ID ?? row.subcategory_id ?? null,
    subcategory_guid: normalizeGuid(row.SUBCATEGORY_GUID ?? row.subcategory_guid),
    category_id: row.CATEGORY_ID ?? row.category_id ?? null,
    category_guid: normalizeGuid(row.CATEGORY_GUID ?? row.category_guid),
    category_name: row.CATEGORY_NAME ?? row.category_name ?? null,
    subcategory_name: row.SUBCATEGORY_NAME ?? row.subcategory_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    created_by: row.CREATED_BY ?? row.created_by ?? null,
    creation_date: toIso(row.CREATION_DATE ?? row.creation_date),
    last_updated_by: row.LAST_UPDATED_BY ?? row.last_updated_by ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE ?? row.last_update_date)
  };
}

/** @param {Record<string, unknown>} row */
function mapSubcategoryByCategoryRow(row) {
  if (!row) return null;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    subcategory_guid: normalizeGuid(row.SUBCATEGORY_GUID ?? row.subcategory_guid),
    subcategory_name: row.SUBCATEGORY_NAME ?? row.subcategory_name ?? null,
    category_name: row.CATEGORY_NAME ?? row.category_name ?? null
  };
}

function parseListFilters(filters = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);

  let categoryGuid = null;
  if (filters.category_guid !== undefined && filters.category_guid !== null && filters.category_guid !== '') {
    categoryGuid = parseCategoryGuid(String(filters.category_guid));
  }

  const categoryName = strOrNull(filters.category_name);
  const subcategoryName = strOrNull(filters.subcategory_name);
  return {
    enterprise_id: enterpriseId,
    active_flag: activeFlag,
    category_guid: categoryGuid,
    category_name: categoryName,
    subcategory_name: subcategoryName
  };
}

async function fetchSubcategoryByGuid(connection, subcategoryGuid, enterpriseId) {
  const result = await connection.execute(
    GET_BY_GUID_SQL,
    { subcategory_guid: subcategoryGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  if (!row) return null;
  return mapSubcategoryRow(row);
}

async function assertCategoryExists(connection, categoryGuidRaw, enterpriseId) {
  const categoryGuid = parseCategoryGuid(categoryGuidRaw);
  const result = await connection.execute(
    CATEGORY_EXISTS_SQL,
    { category_guid: categoryGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) {
    throw new ValidationError('Category not found.');
  }
  return categoryGuid;
}

async function assertSubcategoryUnique(connection, enterpriseId, categoryGuid, subcategoryName, excludeGuid = null) {
  const name = strOrNull(subcategoryName);
  if (!name) return;

  const result = await connection.execute(
    DUPLICATE_SUBCATEGORY_SQL,
    {
      enterprise_id: enterpriseId,
      category_guid: categoryGuid,
      subcategory_name: name,
      exclude_guid: excludeGuid
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (result.rows?.length) {
    throw new ConflictError('Subcategory already exists for this category.');
  }
}

async function executePackageMutation(plsql, binds) {
  await withConnection((connection) =>
    connection.execute(plsql, binds, { autoCommit: true })
  );
}

/**
 * @param {{ active_flag?: string, category_guid?: string, category_name?: string, subcategory_name?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listSubcategories(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const result = await withConnection((connection) =>
    connection.execute(
      LIST_SQL,
      {
        enterprise_id: parsedFilters.enterprise_id,
        active_flag: parsedFilters.active_flag,
        category_guid: parsedFilters.category_guid,
        category_name: parsedFilters.category_name,
        subcategory_name: parsedFilters.subcategory_name,
        offset,
        limit
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  return buildListResponse(result.rows ?? [], page, limit, mapSubcategoryRow);
}

/**
 * @param {string} subcategoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getSubcategoryByGuid(subcategoryGuidRaw, enterpriseIdRaw) {
  const subcategoryGuid = parseSubcategoryGuid(subcategoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  return withConnection((connection) => fetchSubcategoryByGuid(connection, subcategoryGuid, enterpriseId));
}

/**
 * @param {string} categoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listSubcategoriesByCategory(categoryGuidRaw, enterpriseIdRaw, pagination = {}) {
  const categoryGuid = parseCategoryGuid(categoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const result = await withConnection(async (connection) => {
    await assertCategoryExists(connection, categoryGuid, enterpriseId);
    return connection.execute(
      LIST_BY_CATEGORY_SQL,
      { category_guid: categoryGuid, enterprise_id: enterpriseId, offset, limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
  });

  return buildListResponse(result.rows ?? [], page, limit, mapSubcategoryByCategoryRow);
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createSubcategory(body) {
  validateCreateInput(body);

  const enterpriseId = parseEnterpriseId(body.enterprise_id);
  const categoryGuid = parseCategoryGuid(body.category_guid);
  const createdBy = strOrNull(body.created_by) ?? 'SYSTEM';

  try {
    const result = await withConnection(async (connection) => {
      await assertCategoryExists(connection, categoryGuid, enterpriseId);
      await assertSubcategoryUnique(connection, enterpriseId, categoryGuid, body.subcategory_name);

      return connection.execute(
        CREATE_PLSQL,
        {
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
          p_subcategory_name: {
            val: strOrNull(body.subcategory_name),
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
          p_created_by: {
            val: createdBy,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_subcategory_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          p_subcategory_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
        },
        { autoCommit: true }
      );
    });

    return {
      subcategory_id: outNumber(result.outBinds?.p_subcategory_id),
      subcategory_guid: normalizeGuid(outString(result.outBinds?.p_subcategory_guid))
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} subcategoryGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateSubcategory(subcategoryGuidRaw, body) {
  const subcategoryGuid = parseSubcategoryGuid(subcategoryGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getSubcategoryByGuid(subcategoryGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Subcategory not found.');
  }

  const categoryGuid = body.category_guid != null
    ? parseCategoryGuid(body.category_guid)
    : existing.category_guid;
  const subcategoryName = strOrNull(body.subcategory_name) ?? existing.subcategory_name;
  const updatedBy = strOrNull(body.updated_by) ?? 'SYSTEM';

  try {
    await withConnection(async (connection) => {
      await assertCategoryExists(connection, categoryGuid, enterpriseId);
      await assertSubcategoryUnique(connection, enterpriseId, categoryGuid, subcategoryName, subcategoryGuid);

      await connection.execute(
        UPDATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          p_subcategory_guid: {
            val: subcategoryGuid,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          },
          p_category_guid: {
            val: categoryGuid,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          },
          p_subcategory_name: {
            val: subcategoryName,
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
          p_active_flag: {
            val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_updated_by: {
            val: updatedBy,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          }
        },
        { autoCommit: true }
      );
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} subcategoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteSubcategory(subcategoryGuidRaw, enterpriseIdRaw) {
  const subcategoryGuid = parseSubcategoryGuid(subcategoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getSubcategoryByGuid(subcategoryGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Subcategory not found.');
  }

  try {
    await executePackageMutation(DELETE_PLSQL, {
      p_enterprise_id: {
        val: enterpriseId,
        dir: oracledb.BIND_IN,
        type: oracledb.NUMBER
      },
      p_subcategory_guid: {
        val: subcategoryGuid,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 32
      }
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}
