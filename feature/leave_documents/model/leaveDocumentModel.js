import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../utils/guidUtils.js';

/**
 * Leave Document Model
 * Table: ABS.ABS_LEAVE_DOCUMENTS
 *
 * Real columns (per your DB):
 * DOCUMENT_ID, LEAVE_REQUEST_ID, FILE_NAME, FILE_TYPE, FILE_SIZE_MB, FILE_URL,
 * CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY,
 * DOCUMENT_GUID (RAW16), FILE_BLOB (BLOB), FILE_HASH
 */
class LeaveDocumentModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_DOCUMENTS';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) converted[newKey] = value;
      else if (value instanceof Date) converted[newKey] = value;
      else if (Buffer.isBuffer(value)) converted[newKey] = value; // used only in blob method
      else if (typeof value === 'object') converted[newKey] = this.convertKeysToSnakeCase(value);
      else converted[newKey] = value;
    }
    return converted;
  }

  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });

    if (result.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
    return result;
  }

  static async executeWithTransaction(callback) {
    let connection;
    try {
      connection = await db.getConnection();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      if (connection && connection.rollback) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    } finally {
      if (connection && connection.close) {
        try { await connection.close(); } catch {}
      }
    }
  }

  /**
   * List metadata with optional filters + pagination (NO BLOB)
   * filters:
   *  - leaveRequestId (number)
   *  - leaveRequestGuid (hex32 string)  -> joins ABS.ABS_LEAVE_REQUESTS.LEAVE_REQUEST_GUID (RAW16)
   *  - pagination: {page, pageSize}
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT
        a.DOCUMENT_ID,
        RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
        a.LEAVE_REQUEST_ID,
        a.FILE_NAME,
        a.FILE_TYPE,
        a.FILE_SIZE_MB,
        a.FILE_URL,
        a.FILE_HASH,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let i = 1;

      if (filters.leaveRequestId) {
        conditions.push(`a.LEAVE_REQUEST_ID = :${i}`);
        bindParams.push(parseInt(filters.leaveRequestId));
        i++;
      }

      if (filters.leaveRequestGuid) {
        // Compare RAW(16) to RAW(16)
        const lrGuidRaw = hexToRawBuffer(ensureHex32(filters.leaveRequestGuid, 'leaveRequestGuid'));
        conditions.push(`a.LEAVE_REQUEST_ID IN (
          SELECT r.LEAVE_REQUEST_ID
          FROM ABS.ABS_LEAVE_REQUESTS r
          WHERE r.LEAVE_REQUEST_GUID = :${i}
        )`);
        bindParams.push(lrGuidRaw);
        i++;
      }

      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      const page = filters.pagination?.page || 1;
      const pageSize = filters.pagination?.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows?.[0]?.total || 0;

      dataQuery += ` ORDER BY a.CREATION_DATE DESC`;
      dataQuery += ` OFFSET :${i} ROWS FETCH NEXT :${i + 1} ROWS ONLY`;
      bindParams.push(offset);
      i++;
      bindParams.push(pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);
      return { documents: dataResult.rows || [], total };
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch leave documents', error);
    }
  }

  /**
   * Single document metadata by GUID (NO BLOB)
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidRaw = hexToRawBuffer(hexGuid);

      const query = `SELECT
        a.DOCUMENT_ID,
        RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
        a.LEAVE_REQUEST_ID,
        a.FILE_NAME,
        a.FILE_TYPE,
        a.FILE_SIZE_MB,
        a.FILE_URL,
        a.FILE_HASH,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.DOCUMENT_GUID = :1`;

      const result = await this.executeQuery(query, [guidRaw]);
      return result.rows?.[0] || null;
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch leave document', error);
    }
  }

  /**
   * List documents for a leave request (metadata only, NO BLOB)
   * Returns full document metadata including all fields needed for API responses
   */
  static async findByLeaveRequestId(leaveRequestId) {
    try {
      const query = `SELECT
        a.DOCUMENT_ID,
        RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
        a.LEAVE_REQUEST_ID,
        a.FILE_NAME,
        a.FILE_TYPE,
        a.FILE_SIZE_MB,
        a.FILE_URL,
        a.FILE_HASH,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LEAVE_REQUEST_ID = :1
      ORDER BY a.CREATION_DATE DESC`;

      const result = await this.executeQuery(query, [parseInt(leaveRequestId)]);
      return result.rows || [];
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch leave documents', error);
    }
  }

  /**
   * Fetch first document (by CREATION_DATE DESC) per leave request for many IDs in one query.
   * @param {number[]} leaveRequestIds - Array of LEAVE_REQUEST_ID values
   * @returns {Promise<Map<number, Object>>} Map of leave_request_id -> document row (snake_case)
   */
  static async findFirstByLeaveRequestIds(leaveRequestIds) {
    if (!Array.isArray(leaveRequestIds) || leaveRequestIds.length === 0) {
      return new Map();
    }
    try {
      const ids = leaveRequestIds.map(id => parseInt(id)).filter(n => !isNaN(n));
      if (ids.length === 0) return new Map();

      const placeholders = ids.map((_, i) => `:${i + 1}`).join(', ');
      const query = `SELECT DOCUMENT_ID, DOCUMENT_GUID, LEAVE_REQUEST_ID, FILE_NAME, FILE_TYPE, FILE_SIZE_MB, FILE_URL, FILE_HASH, CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
        FROM (
          SELECT a.DOCUMENT_ID, RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID, a.LEAVE_REQUEST_ID,
                 a.FILE_NAME, a.FILE_TYPE, a.FILE_SIZE_MB, a.FILE_URL, a.FILE_HASH,
                 a.CREATION_DATE, a.CREATED_BY, a.LAST_UPDATE_DATE, a.LAST_UPDATED_BY,
                 ROW_NUMBER() OVER (PARTITION BY a.LEAVE_REQUEST_ID ORDER BY a.CREATION_DATE DESC) AS rn
          FROM ${this.TABLE_NAME} a
          WHERE a.LEAVE_REQUEST_ID IN (${placeholders})
        )
        WHERE rn = 1`;

      const result = await this.executeQuery(query, ids);
      const rows = result.rows || [];
      const map = new Map();
      for (const row of rows) {
        const lid = row.leave_request_id;
        if (lid != null && !map.has(lid)) map.set(lid, row);
      }
      return map;
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch leave documents by request IDs', error);
    }
  }

  /**
   * Fetch a document including BLOB (for download).
   * NOTE: This returns FILE_BLOB as whatever your driver/db helper returns.
   * If you want true streaming LOBs, handle it at controller level with a raw connection.
   */
  static async findBlobByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidRaw = hexToRawBuffer(hexGuid);

      // Use a dedicated connection so LOB behavior is consistent
      const connection = await db.getConnection();
      try {
        const query = `SELECT
          a.DOCUMENT_ID,
          RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
          a.LEAVE_REQUEST_ID,
          a.FILE_NAME,
          a.FILE_TYPE,
          a.FILE_SIZE_MB,
          a.FILE_HASH,
          a.FILE_BLOB
        FROM ${this.TABLE_NAME} a
        WHERE a.DOCUMENT_GUID = :1`;

        const result = await connection.execute(query, [guidRaw], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!result.rows?.length) return null;

        const row = result.rows[0];

        // Return in the shape your controller expects
        return {
          documentId: row.DOCUMENT_ID,
          documentGuid: row.DOCUMENT_GUID,
          leaveRequestId: row.LEAVE_REQUEST_ID,
          fileName: row.FILE_NAME,
          fileType: row.FILE_TYPE || 'application/octet-stream',
          fileSizeMb: row.FILE_SIZE_MB,
          fileHash: row.FILE_HASH,
          fileContent: row.FILE_BLOB // could be Buffer or LOB depending on your db helper/driver config
        };
      } finally {
        try { await connection.close(); } catch {}
      }
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to fetch leave document file', error);
    }
  }

  /**
   * Create a new leave document (stores BLOB in FILE_BLOB)
   * data: { LEAVE_REQUEST_ID, FILE_CONTENT(Buffer), FILE_NAME, FILE_TYPE?, FILE_SIZE?, FILE_HASH? }
   * - FILE_SIZE_MB will be computed from FILE_CONTENT length
   */
  /**
   * Create or replace leave document
   * If a document already exists for the leave request, it will be replaced
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const now = new Date();
        const leaveRequestId = parseInt(data.LEAVE_REQUEST_ID);

        // Check if a document already exists for this leave request
        const checkSql = `SELECT DOCUMENT_ID, DOCUMENT_GUID FROM ${this.TABLE_NAME} WHERE LEAVE_REQUEST_ID = :1`;
        const checkResult = await connection.execute(checkSql, [leaveRequestId], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (checkResult.rows && checkResult.rows.length > 0) {
          // Document exists - delete the old one (including BLOB)
          const existingDocument = checkResult.rows[0];
          const existingGuid = existingDocument.DOCUMENT_GUID;

          const deleteSql = `DELETE FROM ${this.TABLE_NAME} WHERE DOCUMENT_GUID = :1`;
          await connection.execute(deleteSql, [existingGuid], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        }

        // Create new document (or replace the deleted one)
        // Determine next DOCUMENT_ID (sequence preferred)
        let documentId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_DOCUMENTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          documentId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxQuery = `SELECT NVL(MAX(DOCUMENT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          documentId = maxResult.rows[0].NEXT_ID;
        }

        // Generate GUID (RAW16)
        let guidRaw = null;
        try {
          const { buffer } = await generateSysGuid(connection);
          guidRaw = buffer;
        } catch {
          // If you have DB trigger/default for GUID, you could pass null; otherwise keep this
          guidRaw = null;
        }

        const fileBuffer = Buffer.isBuffer(data.FILE_CONTENT)
          ? data.FILE_CONTENT
          : Buffer.from(data.FILE_CONTENT || '');

        const fileSizeBytes = data.FILE_SIZE ? parseInt(data.FILE_SIZE) : fileBuffer.length;
        const fileSizeMb = Math.round((fileSizeBytes / (1024 * 1024)) * 100) / 100; // 2 decimals

        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
          DOCUMENT_ID,
          DOCUMENT_GUID,
          LEAVE_REQUEST_ID,
          FILE_NAME,
          FILE_TYPE,
          FILE_SIZE_MB,
          FILE_URL,
          FILE_BLOB,
          FILE_HASH,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
        )`;

        await connection.execute(
          insertSql,
          [
            documentId,
            guidRaw, // RAW(16)
            parseInt(data.LEAVE_REQUEST_ID),
            data.FILE_NAME,
            data.FILE_TYPE || 'application/octet-stream',
            fileSizeMb,
            data.FILE_URL || null,
            fileBuffer, // FILE_BLOB
            data.FILE_HASH || null,
            now,
            userId || 'SYSTEM',
            now,
            userId || 'SYSTEM'
          ],
          { autoCommit: false }
        );

        // Return created metadata
        const selectSql = `SELECT
          a.DOCUMENT_ID,
          RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
          a.LEAVE_REQUEST_ID,
          a.FILE_NAME,
          a.FILE_TYPE,
          a.FILE_SIZE_MB,
          a.FILE_URL,
          a.FILE_HASH,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.DOCUMENT_ID = :1`;

        const selectResult = await connection.execute(selectSql, [documentId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows?.length) {
          const createdDocument = this.convertKeysToSnakeCase(selectResult.rows[0]);
          
          // Step 3: Update leave request status to PENDING when document is uploaded
          try {
            const updateLeaveRequestSql = `UPDATE ABS.ABS_LEAVE_REQUESTS 
              SET REQUEST_STATUS = 'PENDING',
                  LAST_UPDATE_DATE = :1,
                  LAST_UPDATED_BY = :2
              WHERE LEAVE_REQUEST_ID = :3
                AND REQUEST_STATUS NOT IN ('APPROVED', 'REJECTED', 'CANCELLED')`;
            
            await connection.execute(
              updateLeaveRequestSql,
              [now, userId || 'SYSTEM', parseInt(data.LEAVE_REQUEST_ID)],
              { autoCommit: false }
            );
          } catch (updateError) {
            // Log error but don't fail document creation if status update fails
            console.error('Failed to update leave request status to PENDING:', updateError);
          }
          
          return createdDocument;
        }
        throw new DatabaseError('Failed to retrieve created leave document');
      });
    } catch (error) {
      console.error('--- LEAVE DOCUMENT CREATE ERROR (RAW) ---');
      console.error('errorNum:', error?.errorNum);
      console.error('message:', error?.message);
      console.error('full:', JSON.stringify(error, null, 2));
      console.error('---------------------------------------');

      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const msg = 'The referenced leave request does not exist. Verify LEAVE_REQUEST_ID.';
        const fkError = new DatabaseError(msg, error, msg);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error?.errorNum === 1400 || error?.message?.includes('ORA-01400')) {
        const msg = 'Required fields are missing.';
        const nnError = new DatabaseError(msg, error, msg);
        nnError.code = 'NOT_NULL_CONSTRAINT';
        throw nnError;
      }
      if (error?.errorNum === 4098 || error?.message?.includes('ORA-04098')) {
        const triggerError = new DatabaseError(
          'Database trigger is invalid. The sequence ABS_LEAVE_DOCUMENTS_SEQ or trigger ABS_TRG_LEAVE_DOCUMENT_GUID may be missing. Please create them in the database.',
          error,
          'Database trigger is invalid. The sequence ABS_LEAVE_DOCUMENTS_SEQ or trigger ABS_TRG_LEAVE_DOCUMENT_GUID may be missing. Please create them in the database.'
        );
        triggerError.code = 'TRIGGER_ERROR';
        throw triggerError;
      }
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to create leave document', error);
    }
  }

  /**
   * Update metadata only (NO BLOB)
   * allowed fields: LEAVE_REQUEST_ID, FILE_NAME, FILE_TYPE, FILE_URL, FILE_HASH
   */
  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidRaw = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const sets = [];
        const binds = [];
        let i = 1;

        if (data.LEAVE_REQUEST_ID !== undefined) {
          sets.push(`LEAVE_REQUEST_ID = :${i}`);
          binds.push(data.LEAVE_REQUEST_ID !== null ? parseInt(data.LEAVE_REQUEST_ID) : null);
          i++;
        }
        if (data.FILE_NAME !== undefined) {
          sets.push(`FILE_NAME = :${i}`);
          binds.push(data.FILE_NAME || null);
          i++;
        }
        if (data.FILE_TYPE !== undefined) {
          sets.push(`FILE_TYPE = :${i}`);
          binds.push(data.FILE_TYPE || null);
          i++;
        }
        if (data.FILE_URL !== undefined) {
          sets.push(`FILE_URL = :${i}`);
          binds.push(data.FILE_URL || null);
          i++;
        }
        if (data.FILE_HASH !== undefined) {
          sets.push(`FILE_HASH = :${i}`);
          binds.push(data.FILE_HASH || null);
          i++;
        }

        if (sets.length === 0) {
          const existing = await this.findByGuid(hexGuid);
          if (!existing) throw new DatabaseError('Leave document not found');
          return existing;
        }

        sets.push(`LAST_UPDATED_BY = :${i}`);
        binds.push(userId || 'SYSTEM');
        i++;

        sets.push(`LAST_UPDATE_DATE = :${i}`);
        binds.push(new Date());
        i++;

        binds.push(guidRaw);
        const whereBindIndex = i;

        const updateSql = `UPDATE ${this.TABLE_NAME}
          SET ${sets.join(', ')}
          WHERE DOCUMENT_GUID = :${whereBindIndex}`;

        const upd = await connection.execute(updateSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (upd.rowsAffected === 0) throw new DatabaseError('Leave document not found');

        const selectSql = `SELECT
          a.DOCUMENT_ID,
          RAWTOHEX(a.DOCUMENT_GUID) AS DOCUMENT_GUID,
          a.LEAVE_REQUEST_ID,
          a.FILE_NAME,
          a.FILE_TYPE,
          a.FILE_SIZE_MB,
          a.FILE_URL,
          a.FILE_HASH,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.DOCUMENT_GUID = :1`;

        const sel = await connection.execute(selectSql, [guidRaw], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (sel.rows?.length) return this.convertKeysToSnakeCase(sel.rows[0]);
        throw new DatabaseError('Failed to retrieve updated leave document');
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum === 2291 || error?.message?.includes('ORA-02291')) {
        const msg = 'The referenced leave request does not exist. Verify LEAVE_REQUEST_ID.';
        const fkError = new DatabaseError(msg, error, msg);
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to update leave document', error);
    }
  }

  /**
   * Delete by GUID (deletes row + BLOB)
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidRaw = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const sql = `DELETE FROM ${this.TABLE_NAME} WHERE DOCUMENT_GUID = :1`;
        const result = await connection.execute(sql, [guidRaw], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (result.rowsAffected === 0) throw new DatabaseError('Leave document not found');
        return true;
      });
    } catch (error) {
      if (error?.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      throw new DatabaseError('Failed to delete leave document', error);
    }
  }
}

export default LeaveDocumentModel;
