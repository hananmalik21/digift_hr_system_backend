import oracledb from 'oracledb';
import {
  parseCategoryGuid,
  parseSubcategoryGuid,
  parseQuestionGuid
} from '../../../../utils/guidUtils.js';
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

const PKG = 'GRC.GRC_QUESTIONS_PKG';
const VIEW = 'GRC.V_GRC_QUESTIONS';
const CATEGORY_VIEW = 'GRC.V_QUESTION_CATEGORIES';
const SUBCATEGORY_VIEW = 'GRC.V_QUESTION_SUBCATEGORIES';

const GET_SELECT_COLUMNS = `
    ENTERPRISE_ID,
    QUESTION_ID,
    QUESTION_GUID,
    QUESTION_TEXT,
    DESCRIPTION,
    QUESTION_TYPE_CODE,
    WEIGHT,
    CATEGORY_ID,
    CATEGORY_GUID,
    CATEGORY_NAME,
    SUBCATEGORY_ID,
    SUBCATEGORY_GUID,
    SUBCATEGORY_NAME,
    EVALUATION_CRITERIA_JSON,
    REQUIRE_EVIDENCE,
    GUIDANCE_NOTES,
    ACTIVE_FLAG,
    TAGS_JSON,
    RELATED_CONTROLS_JSON,
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
    AND (:category_guid IS NULL OR UPPER(CATEGORY_GUID) = UPPER(:category_guid))
    AND (:subcategory_guid IS NULL OR UPPER(SUBCATEGORY_GUID) = UPPER(:subcategory_guid))
    AND (:question_type_code IS NULL OR QUESTION_TYPE_CODE = :question_type_code)
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
  ORDER BY CATEGORY_NAME,
           SUBCATEGORY_NAME,
           QUESTION_TEXT
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS}
  FROM ${VIEW}
  WHERE UPPER(QUESTION_GUID) = UPPER(:question_guid)
    AND ENTERPRISE_ID = :enterprise_id`;

const LIST_BY_CATEGORY_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND ENTERPRISE_ID = :enterprise_id
  ORDER BY QUESTION_TEXT
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const LIST_BY_SUBCATEGORY_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE UPPER(SUBCATEGORY_GUID) = UPPER(:subcategory_guid)
    AND ENTERPRISE_ID = :enterprise_id
  ORDER BY QUESTION_TEXT
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const CATEGORY_EXISTS_SQL = `
  SELECT 1 AS HIT
  FROM ${CATEGORY_VIEW}
  WHERE UPPER(CATEGORY_GUID) = UPPER(:category_guid)
    AND ENTERPRISE_ID = :enterprise_id
  FETCH FIRST 1 ROWS ONLY`;

const SUBCATEGORY_EXISTS_SQL = `
  SELECT 1 AS HIT
  FROM ${SUBCATEGORY_VIEW}
  WHERE UPPER(SUBCATEGORY_GUID) = UPPER(:subcategory_guid)
    AND ENTERPRISE_ID = :enterprise_id
  FETCH FIRST 1 ROWS ONLY`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_QUESTION(
    p_enterprise_id              => :p_enterprise_id,
    p_question_text            => :p_question_text,
    p_description              => :p_description,
    p_question_type_code       => :p_question_type_code,
    p_weight                   => :p_weight,
    p_category_guid            => :p_category_guid,
    p_subcategory_guid         => :p_subcategory_guid,
    p_evaluation_criteria_json => :p_evaluation_criteria_json,
    p_require_evidence         => :p_require_evidence,
    p_guidance_notes           => :p_guidance_notes,
    p_tags_json                => :p_tags_json,
    p_controls_json            => :p_controls_json,
    p_created_by               => :p_created_by,
    p_question_id              => :p_question_id,
    p_question_guid            => :p_question_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_QUESTION(
    p_enterprise_id              => :p_enterprise_id,
    p_question_guid            => :p_question_guid,
    p_question_text            => :p_question_text,
    p_description              => :p_description,
    p_question_type_code       => :p_question_type_code,
    p_weight                   => :p_weight,
    p_category_guid            => :p_category_guid,
    p_subcategory_guid         => :p_subcategory_guid,
    p_evaluation_criteria_json => :p_evaluation_criteria_json,
    p_require_evidence         => :p_require_evidence,
    p_guidance_notes           => :p_guidance_notes,
    p_active_flag              => :p_active_flag,
    p_tags_json                => :p_tags_json,
    p_controls_json            => :p_controls_json,
    p_updated_by               => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_QUESTION(
    p_enterprise_id   => :p_enterprise_id,
    p_question_guid => :p_question_guid
  );
END;`;

function outNumber(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function outString(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function codeOrNull(value) {
  const s = strOrNull(value);
  return s ? s.toUpperCase() : null;
}

function validateWeight(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError('weight is required.');
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 10) {
    throw new ValidationError('weight must be between 1 and 10.');
  }
}

function validateRequireEvidence(value) {
  if (value === undefined || value === null || value === '') return;
  const flag = String(value).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    throw new ValidationError('require_evidence must be Y or N.');
  }
}

function normalizeStringArray(value, fieldName) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array.`);
  }
  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new ValidationError(`${fieldName} must be an array.`);
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function evaluationCriteriaFromBody(body) {
  if (body?.evaluation_criteria_json !== undefined) {
    return normalizeStringArray(body.evaluation_criteria_json, 'evaluation_criteria_json');
  }
  return normalizeStringArray(body?.evaluation_criteria, 'evaluation_criteria_json');
}

function tagsFromBody(body) {
  if (body?.tags_json !== undefined) {
    return normalizeStringArray(body.tags_json, 'tags_json');
  }
  return normalizeStringArray(body?.tags, 'tags_json');
}

function controlsFromBody(body) {
  if (body?.controls_json !== undefined) {
    return normalizeStringArray(body.controls_json, 'controls_json');
  }
  return normalizeStringArray(body?.controls, 'controls_json');
}

function jsonArrayClobBind(items) {
  return {
    val: JSON.stringify(items ?? []),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function validateCreateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (!strOrNull(body?.question_text)) {
    throw new ValidationError('question_text is required.');
  }
  if (!strOrNull(body?.question_type_code)) {
    throw new ValidationError('question_type_code is required.');
  }
  if (!strOrNull(body?.category_guid)) {
    throw new ValidationError('category_guid is required.');
  }
  parseCategoryGuid(body.category_guid);
  if (body?.subcategory_guid) {
    parseSubcategoryGuid(body.subcategory_guid);
  }
  validateWeight(body?.weight);
  validateRequireEvidence(body?.require_evidence);
  evaluationCriteriaFromBody(body);
  tagsFromBody(body);
  controlsFromBody(body);
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.question_text !== undefined && !strOrNull(body.question_text)) {
    throw new ValidationError('question_text is required.');
  }
  if (body?.question_type_code !== undefined && !strOrNull(body.question_type_code)) {
    throw new ValidationError('question_type_code is required.');
  }
  if (body?.category_guid !== undefined) {
    if (!strOrNull(body.category_guid)) {
      throw new ValidationError('category_guid is required.');
    }
    parseCategoryGuid(body.category_guid);
  }
  if (body?.subcategory_guid !== undefined && body.subcategory_guid !== null && body.subcategory_guid !== '') {
    parseSubcategoryGuid(body.subcategory_guid);
  }
  if (body?.weight !== undefined) {
    validateWeight(body.weight);
  }
  validateRequireEvidence(body?.require_evidence);
  validateActiveFlag(body?.active_flag);
  if (body?.evaluation_criteria_json !== undefined || body?.evaluation_criteria !== undefined) {
    evaluationCriteriaFromBody(body);
  }
  if (body?.tags_json !== undefined || body?.tags !== undefined) {
    tagsFromBody(body);
  }
  if (body?.controls_json !== undefined || body?.controls !== undefined) {
    controlsFromBody(body);
  }
}

async function readClobValue(value) {
  if (value == null) return null;
  if (typeof value?.getData === 'function') {
    const data = await value.getData();
    return data != null ? String(data) : null;
  }
  return String(value);
}

async function parseJsonStringArray(raw) {
  const text = await readClobValue(raw);
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed || trimmed === 'null') return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        return item?.code ?? item?.CODE ?? item?.tag ?? item?.TAG ?? null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function parseRelatedControlsJson(raw) {
  const text = await readClobValue(raw);
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed || trimmed === 'null') return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item === 'string') {
          return {
            control_guid: normalizeGuid(item),
            control_name: null
          };
        }
        const controlGuid = normalizeGuid(item?.control_guid ?? item?.CONTROL_GUID);
        if (!controlGuid) return null;
        return {
          control_guid: controlGuid,
          control_name: item?.control_name ?? item?.CONTROL_NAME ?? null
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {Record<string, unknown>} row */
async function mapQuestionRow(row) {
  if (!row) return null;
  const weight = row.WEIGHT ?? row.weight;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    question_id: row.QUESTION_ID ?? row.question_id ?? null,
    question_guid: normalizeGuid(row.QUESTION_GUID ?? row.question_guid),
    question_text: row.QUESTION_TEXT ?? row.question_text ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    question_type_code: row.QUESTION_TYPE_CODE ?? row.question_type_code ?? null,
    weight: weight != null ? Number(weight) : null,
    category_id: row.CATEGORY_ID ?? row.category_id ?? null,
    category_guid: normalizeGuid(row.CATEGORY_GUID ?? row.category_guid),
    category_name: row.CATEGORY_NAME ?? row.category_name ?? null,
    subcategory_id: row.SUBCATEGORY_ID ?? row.subcategory_id ?? null,
    subcategory_guid: normalizeGuid(row.SUBCATEGORY_GUID ?? row.subcategory_guid),
    subcategory_name: row.SUBCATEGORY_NAME ?? row.subcategory_name ?? null,
    evaluation_criteria_json: await parseJsonStringArray(
      row.EVALUATION_CRITERIA_JSON ?? row.evaluation_criteria_json
    ),
    require_evidence: row.REQUIRE_EVIDENCE ?? row.require_evidence ?? null,
    guidance_notes: row.GUIDANCE_NOTES ?? row.guidance_notes ?? null,
    tags_json: await parseJsonStringArray(row.TAGS_JSON ?? row.tags_json),
    related_controls_json: await parseRelatedControlsJson(
      row.RELATED_CONTROLS_JSON ?? row.related_controls_json
    ),
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

  let categoryGuid = null;
  if (filters.category_guid !== undefined && filters.category_guid !== null && filters.category_guid !== '') {
    categoryGuid = parseCategoryGuid(String(filters.category_guid));
  }

  let subcategoryGuid = null;
  if (filters.subcategory_guid !== undefined && filters.subcategory_guid !== null && filters.subcategory_guid !== '') {
    subcategoryGuid = parseSubcategoryGuid(String(filters.subcategory_guid));
  }

  return {
    enterprise_id: enterpriseId,
    category_guid: categoryGuid,
    subcategory_guid: subcategoryGuid,
    question_type_code: codeOrNull(filters.question_type_code),
    active_flag: activeFlag
  };
}

async function fetchQuestionByGuid(connection, questionGuid, enterpriseId) {
  const result = await connection.execute(
    GET_BY_GUID_SQL,
    { question_guid: questionGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  if (!row) return null;
  return mapQuestionRow(row);
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

async function assertSubcategoryExists(connection, subcategoryGuidRaw, enterpriseId) {
  const subcategoryGuid = parseSubcategoryGuid(subcategoryGuidRaw);
  const result = await connection.execute(
    SUBCATEGORY_EXISTS_SQL,
    { subcategory_guid: subcategoryGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  if (!result.rows?.length) {
    throw new ValidationError('Subcategory not found.');
  }
  return subcategoryGuid;
}

function buildSharedQuestionInBinds(body) {
  return {
    p_question_text: {
      val: strOrNull(body.question_text),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_question_type_code: {
      val: codeOrNull(body.question_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_weight: {
      val: numOrNull(body.weight),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_category_guid: {
      val: body.category_guid ? parseCategoryGuid(body.category_guid) : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    },
    p_subcategory_guid: {
      val: body.subcategory_guid ? parseSubcategoryGuid(body.subcategory_guid) : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 32
    },
    p_require_evidence: {
      val: body.require_evidence != null ? String(body.require_evidence).trim().toUpperCase() : null,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    },
    p_guidance_notes: {
      val: strOrNull(body.guidance_notes),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    }
  };
}

async function executePackageMutation(plsql, binds) {
  await withConnection((connection) =>
    connection.execute(plsql, binds, { autoCommit: true })
  );
}

/**
 * @param {{ category_guid?: string, subcategory_guid?: string, question_type_code?: string, active_flag?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listQuestions(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const result = await withConnection((connection) =>
    connection.execute(
      LIST_SQL,
      {
        enterprise_id: parsedFilters.enterprise_id,
        category_guid: parsedFilters.category_guid,
        subcategory_guid: parsedFilters.subcategory_guid,
        question_type_code: parsedFilters.question_type_code,
        active_flag: parsedFilters.active_flag,
        offset,
        limit
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  return buildListResponse(result.rows ?? [], page, limit, mapQuestionRow);
}

/**
 * @param {string} questionGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getQuestionByGuid(questionGuidRaw, enterpriseIdRaw) {
  const questionGuid = parseQuestionGuid(questionGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  return withConnection((connection) => fetchQuestionByGuid(connection, questionGuid, enterpriseId));
}

/**
 * @param {string} categoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listQuestionsByCategory(categoryGuidRaw, enterpriseIdRaw, pagination = {}) {
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

  return buildListResponse(result.rows ?? [], page, limit, mapQuestionRow);
}

/**
 * @param {string} subcategoryGuidRaw
 * @param {unknown} enterpriseIdRaw
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listQuestionsBySubcategory(subcategoryGuidRaw, enterpriseIdRaw, pagination = {}) {
  const subcategoryGuid = parseSubcategoryGuid(subcategoryGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const result = await withConnection(async (connection) => {
    await assertSubcategoryExists(connection, subcategoryGuid, enterpriseId);
    return connection.execute(
      LIST_BY_SUBCATEGORY_SQL,
      { subcategory_guid: subcategoryGuid, enterprise_id: enterpriseId, offset, limit },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
  });

  return buildListResponse(result.rows ?? [], page, limit, mapQuestionRow);
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createQuestion(body) {
  validateCreateInput(body);

  const enterpriseId = parseEnterpriseId(body.enterprise_id);
  const categoryGuid = parseCategoryGuid(body.category_guid);
  const subcategoryGuid = body.subcategory_guid ? parseSubcategoryGuid(body.subcategory_guid) : null;
  const createdBy = strOrNull(body.created_by) ?? 'SYSTEM';
  const evaluationCriteria = evaluationCriteriaFromBody(body);
  const tags = tagsFromBody(body);
  const controls = controlsFromBody(body);

  try {
    const result = await withConnection(async (connection) => {
      await assertCategoryExists(connection, categoryGuid, enterpriseId);
      if (subcategoryGuid) {
        await assertSubcategoryExists(connection, subcategoryGuid, enterpriseId);
      }

      return connection.execute(
        CREATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          ...buildSharedQuestionInBinds(body),
          p_evaluation_criteria_json: jsonArrayClobBind(evaluationCriteria),
          p_tags_json: jsonArrayClobBind(tags),
          p_controls_json: jsonArrayClobBind(controls),
          p_created_by: {
            val: createdBy,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_question_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          p_question_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
        },
        { autoCommit: true }
      );
    });

    return {
      question_id: outNumber(result.outBinds?.p_question_id),
      question_guid: normalizeGuid(outString(result.outBinds?.p_question_guid))
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} questionGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateQuestion(questionGuidRaw, body) {
  const questionGuid = parseQuestionGuid(questionGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getQuestionByGuid(questionGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Question not found');
  }

  const categoryGuid = body.category_guid != null
    ? parseCategoryGuid(body.category_guid)
    : existing.category_guid;
  const subcategoryGuid = body.subcategory_guid !== undefined
    ? (body.subcategory_guid ? parseSubcategoryGuid(body.subcategory_guid) : null)
    : existing.subcategory_guid;
  const updatedBy = strOrNull(body.updated_by) ?? 'SYSTEM';
  const evaluationCriteria = body.evaluation_criteria_json !== undefined || body.evaluation_criteria !== undefined
    ? evaluationCriteriaFromBody(body)
    : (existing.evaluation_criteria_json ?? []);
  const tags = body.tags_json !== undefined || body.tags !== undefined
    ? tagsFromBody(body)
    : (existing.tags_json ?? []);
  const controls = body.controls_json !== undefined || body.controls !== undefined
    ? controlsFromBody(body)
    : (existing.related_controls_json ?? [])
      .map((item) => item?.control_guid)
      .filter(Boolean);

  const updateBody = {
    question_text: strOrNull(body.question_text) ?? existing.question_text,
    description: body.description !== undefined ? strOrNull(body.description) : existing.description,
    question_type_code: strOrNull(body.question_type_code) ?? existing.question_type_code,
    weight: body.weight !== undefined ? numOrNull(body.weight) : existing.weight,
    category_guid: categoryGuid,
    subcategory_guid: subcategoryGuid,
    require_evidence: body.require_evidence !== undefined
      ? String(body.require_evidence).trim().toUpperCase()
      : existing.require_evidence,
    guidance_notes: body.guidance_notes !== undefined ? strOrNull(body.guidance_notes) : existing.guidance_notes
  };

  try {
    await withConnection(async (connection) => {
      await assertCategoryExists(connection, categoryGuid, enterpriseId);
      if (subcategoryGuid) {
        await assertSubcategoryExists(connection, subcategoryGuid, enterpriseId);
      }

      await connection.execute(
        UPDATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          p_question_guid: {
            val: questionGuid,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          },
          ...buildSharedQuestionInBinds(updateBody),
          p_evaluation_criteria_json: jsonArrayClobBind(evaluationCriteria),
          p_active_flag: {
            val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_tags_json: jsonArrayClobBind(tags),
          p_controls_json: jsonArrayClobBind(controls),
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
 * @param {string} questionGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteQuestion(questionGuidRaw, enterpriseIdRaw) {
  const questionGuid = parseQuestionGuid(questionGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getQuestionByGuid(questionGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Question not found');
  }

  try {
    await executePackageMutation(DELETE_PLSQL, {
      p_enterprise_id: {
        val: enterpriseId,
        dir: oracledb.BIND_IN,
        type: oracledb.NUMBER
      },
      p_question_guid: {
        val: questionGuid,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 32
      }
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}
