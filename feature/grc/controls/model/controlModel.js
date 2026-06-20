import oracledb from 'oracledb';
import { parseControlGuid } from '../../../../utils/guidUtils.js';
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

const PKG = 'GRC.GRC_CONTROLS_PKG';
const VIEW = 'GRC.V_GRC_CONTROLS';

const GET_SELECT_COLUMNS = `
    ENTERPRISE_ID,
    CONTROL_ID,
    CONTROL_GUID,
    CONTROL_NAME,
    DESCRIPTION,
    CONTROL_TYPE_CODE,
    STATUS_CODE,
    CONTROL_OWNER,
    TEST_FREQUENCY_CODE,
    CONTROL_EFFECTIVENESS,
    ACTIVE_FLAG,
    CREATED_BY,
    CREATION_DATE,
    LAST_UPDATED_BY,
    LAST_UPDATE_DATE,
    FRAMEWORK_MAPPINGS_JSON`;

const LIST_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (:control_type_code IS NULL OR CONTROL_TYPE_CODE = :control_type_code)
    AND (:status_code IS NULL OR STATUS_CODE = :status_code)
    AND (:test_frequency_code IS NULL OR TEST_FREQUENCY_CODE = :test_frequency_code)
    AND (
      :search IS NULL
      OR UPPER(CONTROL_NAME) LIKE '%' || UPPER(:search) || '%'
      OR UPPER(DESCRIPTION) LIKE '%' || UPPER(:search) || '%'
    )
  ORDER BY CONTROL_NAME
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

const GET_BY_GUID_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS}
  FROM ${VIEW}
  WHERE UPPER(CONTROL_GUID) = UPPER(:control_guid)
    AND ENTERPRISE_ID = :enterprise_id`;

const DUPLICATE_NAME_SQL = `
  SELECT 1 AS HIT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND UPPER(CONTROL_NAME) = UPPER(:control_name)
    AND (:exclude_guid IS NULL OR UPPER(CONTROL_GUID) <> UPPER(:exclude_guid))
  FETCH FIRST 1 ROWS ONLY`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_CONTROL(
    p_enterprise_id           => :p_enterprise_id,
    p_control_name          => :p_control_name,
    p_description           => :p_description,
    p_control_type_code     => :p_control_type_code,
    p_status_code           => :p_status_code,
    p_control_owner         => :p_control_owner,
    p_test_frequency_code   => :p_test_frequency_code,
    p_control_effectiveness => :p_control_effectiveness,
    p_framework_json        => :p_framework_json,
    p_created_by            => :p_created_by,
    p_control_id            => :p_control_id,
    p_control_guid          => :p_control_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_CONTROL(
    p_enterprise_id           => :p_enterprise_id,
    p_control_guid          => :p_control_guid,
    p_control_name          => :p_control_name,
    p_description           => :p_description,
    p_control_type_code     => :p_control_type_code,
    p_status_code           => :p_status_code,
    p_control_owner         => :p_control_owner,
    p_test_frequency_code   => :p_test_frequency_code,
    p_control_effectiveness => :p_control_effectiveness,
    p_active_flag           => :p_active_flag,
    p_framework_json        => :p_framework_json,
    p_updated_by            => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_CONTROL(
    p_enterprise_id  => :p_enterprise_id,
    p_control_guid => :p_control_guid
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

function validateEffectiveness(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError('control_effectiveness is required.');
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new ValidationError('control_effectiveness must be between 0 and 100.');
  }
}

function normalizeFrameworkMappings(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError('framework_mappings must be an array.');
  }
  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new ValidationError('framework_mappings must be an array.');
      }
      return item.trim();
    })
    .filter((item) => item.length > 0);
}

function frameworkMappingsFromBody(body) {
  if (body?.framework_mappings_json !== undefined) {
    return normalizeFrameworkMappings(body.framework_mappings_json);
  }
  return normalizeFrameworkMappings(body?.framework_mappings);
}

function jsonArrayClobBind(items) {
  return {
    val: JSON.stringify(items ?? []),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function buildSharedControlInBinds(body) {
  return {
    p_control_name: {
      val: strOrNull(body.control_name),
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
    p_control_type_code: {
      val: codeOrNull(body.control_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_status_code: {
      val: codeOrNull(body.status_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_control_owner: {
      val: strOrNull(body.control_owner),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_test_frequency_code: {
      val: codeOrNull(body.test_frequency_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_control_effectiveness: {
      val: numOrNull(body.control_effectiveness),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    }
  };
}

function validateCreateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (!strOrNull(body?.control_name)) throw new ValidationError('Control name is required.');
  if (!strOrNull(body?.description)) throw new ValidationError('description is required.');
  if (!strOrNull(body?.control_type_code)) throw new ValidationError('control_type_code is required.');
  if (!strOrNull(body?.status_code)) throw new ValidationError('status_code is required.');
  if (!strOrNull(body?.control_owner)) throw new ValidationError('control_owner is required.');
  if (!strOrNull(body?.test_frequency_code)) throw new ValidationError('test_frequency_code is required.');
  validateEffectiveness(body?.control_effectiveness, { required: true });
  frameworkMappingsFromBody(body);
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.control_name !== undefined && !strOrNull(body.control_name)) {
    throw new ValidationError('Control name is required.');
  }
  if (body?.description !== undefined && !strOrNull(body.description)) {
    throw new ValidationError('description is required.');
  }
  if (body?.control_type_code !== undefined && !strOrNull(body.control_type_code)) {
    throw new ValidationError('control_type_code is required.');
  }
  if (body?.status_code !== undefined && !strOrNull(body.status_code)) {
    throw new ValidationError('status_code is required.');
  }
  if (body?.control_owner !== undefined && !strOrNull(body.control_owner)) {
    throw new ValidationError('control_owner is required.');
  }
  if (body?.test_frequency_code !== undefined && !strOrNull(body.test_frequency_code)) {
    throw new ValidationError('test_frequency_code is required.');
  }
  if (body?.control_effectiveness !== undefined) {
    validateEffectiveness(body.control_effectiveness);
  }
  validateActiveFlag(body?.active_flag);
  if (body?.framework_mappings !== undefined || body?.framework_mappings_json !== undefined) {
    frameworkMappingsFromBody(body);
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

async function parseFrameworkMappingsJson(raw) {
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
        return item?.framework_mapping ?? item?.FRAMEWORK_MAPPING ?? null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @param {Record<string, unknown>} row */
async function mapControlRow(row) {
  if (!row) return null;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    control_id: row.CONTROL_ID ?? row.control_id ?? null,
    control_guid: normalizeGuid(row.CONTROL_GUID ?? row.control_guid),
    control_name: row.CONTROL_NAME ?? row.control_name ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    control_type_code: row.CONTROL_TYPE_CODE ?? row.control_type_code ?? null,
    status_code: row.STATUS_CODE ?? row.status_code ?? null,
    control_owner: row.CONTROL_OWNER ?? row.control_owner ?? null,
    test_frequency_code: row.TEST_FREQUENCY_CODE ?? row.test_frequency_code ?? null,
    control_effectiveness: (() => {
      const val = row.CONTROL_EFFECTIVENESS ?? row.control_effectiveness;
      return val != null ? Number(val) : null;
    })(),
    active_flag: row.ACTIVE_FLAG ?? row.active_flag ?? null,
    created_by: row.CREATED_BY ?? row.created_by ?? null,
    creation_date: toIso(row.CREATION_DATE ?? row.creation_date),
    last_updated_by: row.LAST_UPDATED_BY ?? row.last_updated_by ?? null,
    last_update_date: toIso(row.LAST_UPDATE_DATE ?? row.last_update_date),
    framework_mappings: await parseFrameworkMappingsJson(
      row.FRAMEWORK_MAPPINGS_JSON ?? row.framework_mappings_json
    )
  };
}

function parseListFilters(filters = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);

  return {
    enterprise_id: enterpriseId,
    active_flag: activeFlag,
    search: strOrNull(filters.search),
    control_type_code: codeOrNull(filters.control_type_code),
    status_code: codeOrNull(filters.status_code),
    test_frequency_code: codeOrNull(filters.test_frequency_code)
  };
}

async function fetchControlByGuid(connection, controlGuid, enterpriseId) {
  const result = await connection.execute(
    GET_BY_GUID_SQL,
    { control_guid: controlGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  if (!row) return null;
  return mapControlRow(row);
}

async function assertControlNameAvailable(connection, enterpriseId, controlName, excludeGuid = null) {
  const name = strOrNull(controlName);
  if (!name) return;

  const result = await connection.execute(
    DUPLICATE_NAME_SQL,
    { enterprise_id: enterpriseId, control_name: name, exclude_guid: excludeGuid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (result.rows?.length) {
    throw new ConflictError('Control name already exists.');
  }
}

async function executePackageMutation(plsql, binds) {
  await withConnection((connection) =>
    connection.execute(plsql, binds, { autoCommit: true })
  );
}

/**
 * @param {{ active_flag?: string, control_type_code?: string, status_code?: string, test_frequency_code?: string }} [filters]
 * @param {{ page?: number|string, limit?: number|string }} [pagination]
 */
export async function listControls(filters = {}, pagination = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);

  const result = await withConnection((connection) =>
    connection.execute(
      LIST_SQL,
      {
        enterprise_id: parsedFilters.enterprise_id,
        active_flag: parsedFilters.active_flag,
        control_type_code: parsedFilters.control_type_code,
        status_code: parsedFilters.status_code,
        test_frequency_code: parsedFilters.test_frequency_code,
        search: parsedFilters.search,
        offset,
        limit
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  const rows = result.rows ?? [];
  return buildListResponse(rows, page, limit, mapControlRow);
}

/**
 * @param {string} controlGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getControlByGuid(controlGuidRaw, enterpriseIdRaw) {
  const controlGuid = parseControlGuid(controlGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  return withConnection((connection) => fetchControlByGuid(connection, controlGuid, enterpriseId));
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createControl(body) {
  validateCreateInput(body);

  const enterpriseId = parseEnterpriseId(body.enterprise_id);
  const frameworkMappings = frameworkMappingsFromBody(body);
  const createdBy = strOrNull(body.created_by) ?? 'SYSTEM';

  try {
    const result = await withConnection(async (connection) => {
      await assertControlNameAvailable(connection, enterpriseId, body.control_name);
      return connection.execute(
        CREATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          ...buildSharedControlInBinds(body),
          p_framework_json: jsonArrayClobBind(frameworkMappings),
          p_created_by: {
            val: createdBy,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_control_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          p_control_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
        },
        { autoCommit: true }
      );
    });

    return {
      control_id: outNumber(result.outBinds?.p_control_id),
      control_guid: normalizeGuid(outString(result.outBinds?.p_control_guid))
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} controlGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateControl(controlGuidRaw, body) {
  const controlGuid = parseControlGuid(controlGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getControlByGuid(controlGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Control not found');
  }

  const updatedBy = strOrNull(body.updated_by) ?? 'SYSTEM';
  const frameworkMappings = frameworkMappingsFromBody(body);
  const controlName = strOrNull(body.control_name) ?? existing.control_name;

  try {
    await withConnection(async (connection) => {
      await assertControlNameAvailable(connection, enterpriseId, controlName, controlGuid);
      await connection.execute(
        UPDATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          p_control_guid: {
            val: controlGuid,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 32
          },
          ...buildSharedControlInBinds(body),
          p_active_flag: {
            val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 1
          },
          p_framework_json: jsonArrayClobBind(frameworkMappings),
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
 * @param {string} controlGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteControl(controlGuidRaw, enterpriseIdRaw) {
  const controlGuid = parseControlGuid(controlGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getControlByGuid(controlGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Control not found');
  }

  try {
    await executePackageMutation(DELETE_PLSQL, {
      p_enterprise_id: {
        val: enterpriseId,
        dir: oracledb.BIND_IN,
        type: oracledb.NUMBER
      },
      p_control_guid: {
        val: controlGuid,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 32
      }
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}
