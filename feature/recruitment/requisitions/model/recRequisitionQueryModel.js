import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { hexToRawBuffer } from '@digifyhr/common';

const T_REQ = 'REC.REC_REQUISITION';
const T_BUDGET = 'REC.REC_REQUISITION_BUDGET';

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
 * @param {import('oracledb').Connection} connection
 * @param {Buffer} guidBuf
 * @param {number} enterpriseId
 */
async function resolveRequisitionId(connection, guidBuf, enterpriseId) {
  const r = await connection.execute(
    `SELECT REQUISITION_ID AS REQUISITION_ID
     FROM ${T_REQ}
     WHERE REQUISITION_GUID = :guid_buf AND ENTERPRISE_ID = :enterprise_id
     FETCH FIRST 1 ROWS ONLY`,
    {
      guid_buf: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
      enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = r.rows?.[0];
  const id = row?.REQUISITION_ID ?? row?.requisition_id;
  return id != null ? Number(id) : null;
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<{ file_name: string, mime_type: string, file_content: Buffer }|null>}
 */
export async function getRequisitionAttachment(requisitionGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(requisitionGuidHex);

  return withConnection(async (connection) => {
    const requisitionId = await resolveRequisitionId(connection, guidBuf, enterpriseId);
    if (requisitionId == null) return null;

    const r = await connection.execute(
      `SELECT b.FILE_NAME, b.MIME_TYPE, b.FILE_SIZE, b.FILE_CONTENT
       FROM ${T_BUDGET} b
       WHERE b.REQUISITION_ID = :requisition_id
       FETCH FIRST 1 ROWS ONLY`,
      { requisition_id: { val: requisitionId, dir: oracledb.BIND_IN, type: oracledb.NUMBER } },
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
      file_name: String(row.FILE_NAME ?? row.file_name ?? 'attachment').trim() || 'attachment',
      mime_type: String(row.MIME_TYPE ?? row.mime_type ?? 'application/octet-stream').trim(),
      file_size: row.FILE_SIZE ?? row.file_size ?? null,
      file_content: Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent)
    };
  });
}
