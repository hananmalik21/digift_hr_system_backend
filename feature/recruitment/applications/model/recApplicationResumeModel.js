import oracledb from 'oracledb';
import { withConnection, ROW_OPTS } from '../../shared/recViewModelUtils.js';
import { REC_APPLICATIONS_TABLE } from '../utils/recApplicationConstants.js';
import { applicationGuidEnterpriseBinds } from '../utils/recApplicationRowUtils.js';

const BLOB_FETCH_OPTS = {
  ...ROW_OPTS,
  fetchInfo: { RESUME_FILE_CONTENT: { type: oracledb.BUFFER } }
};

/**
 * @param {string} applicationGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<boolean>}
 */
export async function applicationResumeExists(applicationGuidHex, enterpriseId) {
  const sql = `SELECT 1 AS FOUND
    FROM ${REC_APPLICATIONS_TABLE}
    WHERE ENTERPRISE_ID = :p_enterprise_id
      AND APPLICATION_GUID = :p_application_guid
    FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const r = await connection.execute(
      sql,
      applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
      ROW_OPTS
    );
    return Boolean(r.rows?.[0]);
  });
}

/**
 * @param {string} applicationGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<{
 *   file_name: string,
 *   file_type: string,
 *   file_size: number|null,
 *   file_content: Buffer
 * }|null>}
 */
export async function getApplicationResumeByGuid(applicationGuidHex, enterpriseId) {
  const sql = `SELECT RESUME_FILE_NAME, RESUME_FILE_TYPE, RESUME_FILE_SIZE, RESUME_FILE_CONTENT
    FROM ${REC_APPLICATIONS_TABLE}
    WHERE ENTERPRISE_ID = :p_enterprise_id
      AND APPLICATION_GUID = :p_application_guid
    FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const r = await connection.execute(
      sql,
      applicationGuidEnterpriseBinds(applicationGuidHex, enterpriseId),
      BLOB_FETCH_OPTS
    );
    const row = r.rows?.[0];
    if (!row) return null;

    const m = {};
    for (const [k, v] of Object.entries(row)) {
      m[String(k).toLowerCase()] = v;
    }

    const fileContent = m.resume_file_content;
    if (fileContent == null) return null;

    const buf = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);
    if (buf.length === 0) return null;

    return {
      file_name: String(m.resume_file_name ?? 'resume').trim() || 'resume',
      file_type: String(m.resume_file_type ?? 'application/octet-stream').trim() || 'application/octet-stream',
      file_size:
        m.resume_file_size != null && Number.isFinite(Number(m.resume_file_size))
          ? Number(m.resume_file_size)
          : buf.length,
      file_content: buf
    };
  });
}
