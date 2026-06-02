import oracledb from 'oracledb';
import {
  guidInBind,
  jsonArrayToClobString,
  numOrNull,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull,
  withConnection
} from '../../shared/oraclePackageUtils.js';

export { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.TALENT_POOL_PKG';
const CREATE_PROC = `${PKG}.CREATE_POOL`;
const UPDATE_PROC = `${PKG}.UPDATE_POOL`;
const SYNC_CANDIDATE_POOLS_PROC = `${PKG}.SYNC_CANDIDATE_POOLS`;
const DELETE_PROC = `${PKG}.DELETE_POOL`;

const GENERIC_ERROR_MESSAGE = 'Unable to process talent pool request. Please try again.';

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id => :p_enterprise_id,
    p_pool_name     => :p_pool_name,
    p_created_by    => :p_created_by,
    p_pool_id       => :p_pool_id,
    p_pool_guid     => :p_pool_guid,
    p_status        => :p_status,
    p_message       => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_enterprise_id => :p_enterprise_id,
    p_pool_guid     => :p_pool_guid,
    p_pool_name     => :p_pool_name,
    p_updated_by    => :p_updated_by,
    p_status        => :p_status,
    p_message       => :p_message
  );
END;`;

const SYNC_CANDIDATE_POOLS_PLSQL = `
BEGIN
  ${SYNC_CANDIDATE_POOLS_PROC}(
    p_enterprise_id  => :p_enterprise_id,
    p_candidate_guid => :p_candidate_guid,
    p_pools_json     => :p_pools_json,
    p_updated_by     => :p_updated_by,
    p_status         => :p_status,
    p_message        => :p_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_enterprise_id => :p_enterprise_id,
    p_pool_guid     => :p_pool_guid,
    p_deleted_by    => :p_deleted_by,
    p_status        => :p_status,
    p_message       => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ pool_id: number|null, pool_guid: string|null, status: string, message: string }>}
 */
export async function createPoolViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_pool_name: { val: strOrNull(b.pool_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_pool_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_pool_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCreateOut(result?.outBinds, {
      idKey: 'p_pool_id',
      guidKey: 'p_pool_guid',
      idField: 'pool_id',
      guidField: 'pool_guid'
    });
  } catch (err) {
    console.error('[recTalentPoolsModel] CREATE_POOL failed:', err?.errorNum ?? '', '[redacted]');
    return {
      pool_id: null,
      pool_guid: null,
      status: 'ERROR',
      message: GENERIC_ERROR_MESSAGE
    };
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function updatePoolViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_pool_guid: guidInBind(b.pool_guid),
    p_pool_name: { val: strOrNull(b.pool_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recTalentPoolsModel] UPDATE_POOL failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function syncCandidatePoolsViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: guidInBind(b.candidate_guid),
    p_pools_json: {
      val: jsonArrayToClobString(b.pools, { allowEmptyArray: true }),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(SYNC_CANDIDATE_POOLS_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recTalentPoolsModel] SYNC_CANDIDATE_POOLS failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deletePoolViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_pool_guid: guidInBind(b.pool_guid),
    p_deleted_by: { val: strOrNull(b.deleted_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recTalentPoolsModel] DELETE_POOL failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}
