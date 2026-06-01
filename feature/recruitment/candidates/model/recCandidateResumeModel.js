import oracledb from 'oracledb';
import db from '../../../../config/db.js';

const T_RESUMES = 'REC.CANDIDATE_RESUMES';

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

/**
 * @param {string} resumeGuidHex — 32-char hex (bound via HEXTORAW in SQL)
 * @returns {Promise<{ file_name: string, file_type: string, file_content: Buffer }|null>}
 */
export async function getCandidateResumeByGuid(resumeGuidHex) {
  const hex = String(resumeGuidHex).trim().replace(/-/g, '').toUpperCase();

  return withConnection(async (connection) => {
    const r = await connection.execute(
      `SELECT FILE_NAME, FILE_TYPE, FILE_CONTENT
       FROM ${T_RESUMES}
       WHERE RESUME_GUID = HEXTORAW(:p_resume_guid)
         AND ACTIVE_FLAG = 'Y'
       FETCH FIRST 1 ROWS ONLY`,
      {
        p_resume_guid: { val: hex, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 }
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { FILE_CONTENT: { type: oracledb.BUFFER } }
      }
    );

    const row = r.rows?.[0];
    if (!row) return null;

    const fileContent = row.FILE_CONTENT ?? row.file_content;
    if (fileContent == null) return null;

    return {
      file_name: String(row.FILE_NAME ?? row.file_name ?? 'resume').trim() || 'resume',
      file_type: String(row.FILE_TYPE ?? row.file_type ?? 'application/octet-stream').trim(),
      file_content: Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent)
    };
  });
}
