import oracledb from 'oracledb';
import { parseAssetGuid } from '../../../../utils/guidUtils.js';
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

const PKG = 'GRC.GRC_ASSETS_PKG';
const VIEW = 'GRC.V_GRC_ASSETS';

const SORT_COLUMNS = {
  asset_name: 'ASSET_NAME',
  asset_type_code: 'ASSET_TYPE_CODE',
  business_value: 'BUSINESS_VALUE',
  owner_name: 'OWNER_NAME',
  risk_level_code: 'RISK_LEVEL_CODE',
  criticality_code: 'CRITICALITY_CODE',
  classification_code: 'CLASSIFICATION_CODE',
  environment_code: 'ENVIRONMENT_CODE',
  cloud_provider_code: 'CLOUD_PROVIDER_CODE',
  creation_date: 'CREATION_DATE'
};

const GET_SELECT_COLUMNS = `
    ENTERPRISE_ID,
    ASSET_GUID,
    ASSET_NAME,
    ASSET_TYPE_CODE,
    DESCRIPTION,
    BUSINESS_VALUE,
    OWNER_NAME,
    ENVIRONMENT_CODE,
    CLOUD_PROVIDER_CODE,
    LOCATION,
    IP_ENDPOINT,
    RISK_LEVEL_CODE,
    CRITICALITY_CODE,
    CLASSIFICATION_CODE,
    COMPLIANCE_REQUIREMENTS_JSON,
    TAGS_JSON`;

function buildListSql(orderColumn, orderDirection) {
  return `
  SELECT
    ${GET_SELECT_COLUMNS},
    COUNT(*) OVER() AS TOTAL_COUNT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND (:active_flag IS NULL OR ACTIVE_FLAG = :active_flag)
    AND (:asset_type_code IS NULL OR ASSET_TYPE_CODE = :asset_type_code)
    AND (:risk_level_code IS NULL OR RISK_LEVEL_CODE = :risk_level_code)
    AND (:criticality_code IS NULL OR CRITICALITY_CODE = :criticality_code)
    AND (:classification_code IS NULL OR CLASSIFICATION_CODE = :classification_code)
    AND (:environment_code IS NULL OR ENVIRONMENT_CODE = :environment_code)
    AND (:cloud_provider_code IS NULL OR CLOUD_PROVIDER_CODE = :cloud_provider_code)
    AND (
      :search IS NULL
      OR UPPER(ASSET_NAME) LIKE '%' || UPPER(:search) || '%'
      OR UPPER(ASSET_GUID) LIKE '%' || UPPER(REPLACE(:search, '-', '')) || '%'
      OR ASSET_ID = CASE
        WHEN REGEXP_LIKE(TRIM(:search), '^[0-9]+$')
        THEN TO_NUMBER(TRIM(:search))
      END
    )
  ORDER BY ${orderColumn} ${orderDirection}
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
}

const GET_BY_GUID_SQL = `
  SELECT
    ${GET_SELECT_COLUMNS}
  FROM ${VIEW}
  WHERE UPPER(ASSET_GUID) = UPPER(:asset_guid)
    AND ENTERPRISE_ID = :enterprise_id`;

const DUPLICATE_NAME_SQL = `
  SELECT 1 AS HIT
  FROM ${VIEW}
  WHERE ENTERPRISE_ID = :enterprise_id
    AND UPPER(ASSET_NAME) = UPPER(:asset_name)
    AND (:exclude_guid IS NULL OR UPPER(ASSET_GUID) <> UPPER(:exclude_guid))
  FETCH FIRST 1 ROWS ONLY`;

const CREATE_PLSQL = `
BEGIN
  ${PKG}.CREATE_ASSET(
    p_enterprise_id         => :p_enterprise_id,
    p_asset_name          => :p_asset_name,
    p_asset_type_code     => :p_asset_type_code,
    p_description         => :p_description,
    p_business_value      => :p_business_value,
    p_owner_name          => :p_owner_name,
    p_environment_code    => :p_environment_code,
    p_cloud_provider_code => :p_cloud_provider_code,
    p_location            => :p_location,
    p_ip_endpoint         => :p_ip_endpoint,
    p_risk_level_code     => :p_risk_level_code,
    p_criticality_code    => :p_criticality_code,
    p_classification_code => :p_classification_code,
    p_compliance_json     => :p_compliance_json,
    p_tags_json           => :p_tags_json,
    p_created_by          => :p_created_by,
    p_asset_id            => :p_asset_id,
    p_asset_guid          => :p_asset_guid
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_ASSET(
    p_enterprise_id         => :p_enterprise_id,
    p_asset_guid          => :p_asset_guid,
    p_asset_name          => :p_asset_name,
    p_asset_type_code     => :p_asset_type_code,
    p_description         => :p_description,
    p_business_value      => :p_business_value,
    p_owner_name          => :p_owner_name,
    p_environment_code    => :p_environment_code,
    p_cloud_provider_code => :p_cloud_provider_code,
    p_location            => :p_location,
    p_ip_endpoint         => :p_ip_endpoint,
    p_risk_level_code     => :p_risk_level_code,
    p_criticality_code    => :p_criticality_code,
    p_classification_code => :p_classification_code,
    p_active_flag         => :p_active_flag,
    p_compliance_json     => :p_compliance_json,
    p_tags_json           => :p_tags_json,
    p_updated_by          => :p_updated_by
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_ASSET(
    p_enterprise_id => :p_enterprise_id,
    p_asset_guid    => :p_asset_guid
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

function validateBusinessValue(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError('business_value is required.');
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError('business_value must be greater than or equal to 0.');
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

function complianceArrayFromBody(body) {
  if (body?.compliance_requirements_json !== undefined) {
    return normalizeStringArray(body.compliance_requirements_json, 'compliance_requirements_json');
  }
  return normalizeStringArray(body?.compliance_requirements, 'compliance_requirements');
}

function tagsArrayFromBody(body) {
  if (body?.tags_json !== undefined) {
    return normalizeStringArray(body.tags_json, 'tags_json');
  }
  return normalizeStringArray(body?.tags, 'tags');
}

function jsonArrayClobBind(items) {
  return {
    val: JSON.stringify(items ?? []),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function buildSharedAssetInBinds(body) {
  return {
    p_asset_name: {
      val: strOrNull(body.asset_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_asset_type_code: {
      val: codeOrNull(body.asset_type_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_description: {
      val: strOrNull(body.description),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_business_value: {
      val: numOrNull(body.business_value),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_owner_name: {
      val: strOrNull(body.owner_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_environment_code: {
      val: codeOrNull(body.environment_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_cloud_provider_code: {
      val: codeOrNull(body.cloud_provider_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_location: {
      val: strOrNull(body.location),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_ip_endpoint: {
      val: strOrNull(body.ip_endpoint),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_risk_level_code: {
      val: codeOrNull(body.risk_level_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_criticality_code: {
      val: codeOrNull(body.criticality_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    p_classification_code: {
      val: codeOrNull(body.classification_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    }
  };
}

function validateCreateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (!strOrNull(body?.asset_name)) throw new ValidationError('Asset name is required.');
  if (!strOrNull(body?.asset_type_code)) throw new ValidationError('asset_type_code is required.');
  if (!strOrNull(body?.owner_name)) throw new ValidationError('owner_name is required.');
  validateBusinessValue(body?.business_value, { required: true });
  complianceArrayFromBody(body);
  tagsArrayFromBody(body);
}

function validateUpdateInput(body) {
  parseEnterpriseId(body?.enterprise_id);
  if (body?.asset_name !== undefined && !strOrNull(body.asset_name)) {
    throw new ValidationError('Asset name is required.');
  }
  if (body?.asset_type_code !== undefined && !strOrNull(body.asset_type_code)) {
    throw new ValidationError('asset_type_code is required.');
  }
  if (body?.owner_name !== undefined && !strOrNull(body.owner_name)) {
    throw new ValidationError('owner_name is required.');
  }
  if (body?.business_value !== undefined) {
    validateBusinessValue(body.business_value);
  }
  validateActiveFlag(body?.active_flag);
  if (body?.compliance_requirements !== undefined || body?.compliance_requirements_json !== undefined) {
    complianceArrayFromBody(body);
  }
  if (body?.tags !== undefined || body?.tags_json !== undefined) {
    tagsArrayFromBody(body);
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
    return Array.isArray(parsed) ? parsed.filter((item) => item != null && String(item).trim() !== '') : [];
  } catch {
    return [];
  }
}

/** @param {Record<string, unknown>} row */
async function mapAssetGetRow(row) {
  if (!row) return null;
  return {
    enterprise_id: mapEnterpriseIdField(row),
    asset_guid: normalizeGuid(row.ASSET_GUID ?? row.asset_guid),
    asset_name: row.ASSET_NAME ?? row.asset_name ?? null,
    asset_type_code: row.ASSET_TYPE_CODE ?? row.asset_type_code ?? null,
    description: row.DESCRIPTION ?? row.description ?? null,
    business_value: (() => {
      const val = row.BUSINESS_VALUE ?? row.business_value;
      return val != null ? Number(val) : null;
    })(),
    owner_name: row.OWNER_NAME ?? row.owner_name ?? null,
    environment_code: row.ENVIRONMENT_CODE ?? row.environment_code ?? null,
    cloud_provider_code: row.CLOUD_PROVIDER_CODE ?? row.cloud_provider_code ?? null,
    location: row.LOCATION ?? row.location ?? null,
    ip_endpoint: row.IP_ENDPOINT ?? row.ip_endpoint ?? null,
    risk_level_code: row.RISK_LEVEL_CODE ?? row.risk_level_code ?? null,
    criticality_code: row.CRITICALITY_CODE ?? row.criticality_code ?? null,
    classification_code: row.CLASSIFICATION_CODE ?? row.classification_code ?? null,
    compliance_requirements_json: await parseJsonStringArray(
      row.COMPLIANCE_REQUIREMENTS_JSON ?? row.compliance_requirements_json
    ),
    tags_json: await parseJsonStringArray(row.TAGS_JSON ?? row.tags_json)
  };
}

function parseSortOptions(sort = {}) {
  const sortBy = String(sort.sort_by ?? 'asset_name').trim().toLowerCase();
  const column = SORT_COLUMNS[sortBy] ?? SORT_COLUMNS.asset_name;
  const order =
    String(sort.sort_order ?? 'ASC').trim().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return { column, order };
}

function parseListFilters(filters = {}) {
  const enterpriseId = parseEnterpriseId(filters.enterprise_id);

  const activeFlag = parseOptionalActiveFlag(filters.active_flag);

  return {
    enterprise_id: enterpriseId,
    active_flag: activeFlag,
    search: strOrNull(filters.search),
    asset_type_code: codeOrNull(filters.asset_type_code),
    risk_level_code: codeOrNull(filters.risk_level_code),
    criticality_code: codeOrNull(filters.criticality_code),
    classification_code: codeOrNull(filters.classification_code),
    environment_code: codeOrNull(filters.environment_code),
    cloud_provider_code: codeOrNull(filters.cloud_provider_code)
  };
}

async function fetchAssetByGuid(connection, assetGuid, enterpriseId) {
  const result = await connection.execute(
    GET_BY_GUID_SQL,
    { asset_guid: assetGuid, enterprise_id: enterpriseId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  if (!row) return null;
  return mapAssetGetRow(row);
}

async function assertAssetNameAvailable(connection, enterpriseId, assetName, excludeGuid = null) {
  const name = strOrNull(assetName);
  if (!name) return;

  const result = await connection.execute(
    DUPLICATE_NAME_SQL,
    { enterprise_id: enterpriseId, asset_name: name, exclude_guid: excludeGuid },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (result.rows?.length) {
    throw new ConflictError('Asset name already exists.');
  }
}

async function executePackageMutation(plsql, binds) {
  await withConnection((connection) =>
    connection.execute(plsql, binds, { autoCommit: true })
  );
}

/**
 * @param {Record<string, unknown>} [filters]
 * @param {Record<string, unknown>} [pagination]
 * @param {Record<string, unknown>} [sort]
 */
export async function listAssets(filters = {}, pagination = {}, sort = {}) {
  const parsedFilters = parseListFilters(filters);
  const { page, limit, offset } = parsePageLimit(pagination, LARGE_PAGE_LIMIT_OPTS);
  const { column, order } = parseSortOptions(sort);
  const listSql = buildListSql(column, order);

  const result = await withConnection((connection) =>
    connection.execute(
      listSql,
      {
        enterprise_id: parsedFilters.enterprise_id,
        active_flag: parsedFilters.active_flag,
        asset_type_code: parsedFilters.asset_type_code,
        risk_level_code: parsedFilters.risk_level_code,
        criticality_code: parsedFilters.criticality_code,
        classification_code: parsedFilters.classification_code,
        environment_code: parsedFilters.environment_code,
        cloud_provider_code: parsedFilters.cloud_provider_code,
        search: parsedFilters.search,
        offset,
        limit
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
  );

  const rows = result.rows ?? [];
  return buildListResponse(rows, page, limit, mapAssetGetRow);
}

/**
 * @param {string} assetGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function getAssetByGuid(assetGuidRaw, enterpriseIdRaw) {
  const assetGuid = parseAssetGuid(assetGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);
  return withConnection((connection) => fetchAssetByGuid(connection, assetGuid, enterpriseId));
}

/**
 * @param {Record<string, unknown>} body
 */
export async function createAsset(body) {
  validateCreateInput(body);

  const enterpriseId = parseEnterpriseId(body.enterprise_id);
  const complianceRequirements = complianceArrayFromBody(body);
  const tags = tagsArrayFromBody(body);
  const createdBy = strOrNull(body.created_by) ?? 'SYSTEM';

  try {
    const result = await withConnection(async (connection) => {
      await assertAssetNameAvailable(connection, enterpriseId, body.asset_name);
      return connection.execute(
        CREATE_PLSQL,
        {
          p_enterprise_id: {
            val: enterpriseId,
            dir: oracledb.BIND_IN,
            type: oracledb.NUMBER
          },
          ...buildSharedAssetInBinds(body),
          p_compliance_json: jsonArrayClobBind(complianceRequirements),
          p_tags_json: jsonArrayClobBind(tags),
          p_created_by: {
            val: createdBy,
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            maxSize: 200
          },
          p_asset_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          p_asset_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 32 }
        },
        { autoCommit: true }
      );
    });

    return {
      asset_id: outNumber(result.outBinds?.p_asset_id),
      asset_guid: normalizeGuid(outString(result.outBinds?.p_asset_guid))
    };
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} assetGuidRaw
 * @param {Record<string, unknown>} body
 */
export async function updateAsset(assetGuidRaw, body) {
  const assetGuid = parseAssetGuid(assetGuidRaw);
  validateUpdateInput(body);
  const enterpriseId = parseEnterpriseId(body.enterprise_id);

  const existing = await getAssetByGuid(assetGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Asset not found.');
  }

  const updatedBy = strOrNull(body.updated_by) ?? 'SYSTEM';
  const complianceRequirements = complianceArrayFromBody(body);
  const tags = tagsArrayFromBody(body);
  const assetName = strOrNull(body.asset_name) ?? existing.asset_name;

  try {
    await withConnection((connection) =>
      assertAssetNameAvailable(connection, enterpriseId, assetName, assetGuid)
    );

    await executePackageMutation(UPDATE_PLSQL, {
      p_enterprise_id: {
        val: enterpriseId,
        dir: oracledb.BIND_IN,
        type: oracledb.NUMBER
      },
      p_asset_guid: {
        val: assetGuid,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 32
      },
      ...buildSharedAssetInBinds(body),
      p_active_flag: {
        val: body.active_flag != null ? String(body.active_flag).trim().toUpperCase() : null,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 1
      },
      p_compliance_json: jsonArrayClobBind(complianceRequirements),
      p_tags_json: jsonArrayClobBind(tags),
      p_updated_by: {
        val: updatedBy,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 200
      }
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}

/**
 * @param {string} assetGuidRaw
 * @param {unknown} enterpriseIdRaw
 */
export async function deleteAsset(assetGuidRaw, enterpriseIdRaw) {
  const assetGuid = parseAssetGuid(assetGuidRaw);
  const enterpriseId = parseEnterpriseId(enterpriseIdRaw);

  const existing = await getAssetByGuid(assetGuid, enterpriseId);
  if (!existing) {
    throw new NotFoundError('Asset not found.');
  }

  try {
    await executePackageMutation(DELETE_PLSQL, {
      p_enterprise_id: {
        val: enterpriseId,
        dir: oracledb.BIND_IN,
        type: oracledb.NUMBER
      },
      p_asset_guid: {
        val: assetGuid,
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 32
      }
    });
  } catch (err) {
    wrapOracleDbError(err);
  }
}
