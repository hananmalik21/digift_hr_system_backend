import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../../../utils/guidUtils.js';

/**
 * FNDSEC lookup values — same visibility as COMP.COMP_LOOKUP_VALUES for TENANT_ID,
 * using ENTERPRISE_ID (NULL = global).
 */
class FndsecLookupValueModel {
  static TABLE_NAME = 'FNDSEC.FNDSEC_LOOKUP_VALUES';
  static TYPES_TABLE = 'FNDSEC.FNDSEC_LOOKUP_TYPES';

  static ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

  static parseRequiredEnterpriseIdNum(filters) {
    const v = filters.enterpriseId ?? filters.enterprise_id;
    if (v === undefined || v === null || v === '') {
      throw new Error('enterprise_id is required');
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('enterprise_id must be a valid positive number');
    }
    return n;
  }

  static coerceActiveFlagYn(value) {
    if (value === undefined) return undefined;
    return value === true || value === 'Y' || value === 1 || value === 'y' ? 'Y' : 'N';
  }

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
      return obj.toString('hex').toUpperCase();
    }
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
        converted[newKey] = value;
      } else if (value instanceof Buffer) {
        converted[newKey] = value.toString('hex').toUpperCase();
      } else if (typeof value === 'object') {
        converted[newKey] = this.convertKeysToSnakeCase(value);
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      ...this.ROW_OBJECT,
      ...options
    });
    if (result.rows) {
      result.rows = this.convertKeysToSnakeCase(result.rows);
    }
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
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (connection && connection.close) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  static async getNextDisplaySequence(connection, lookupTypeId) {
    const query = `SELECT NVL(MAX(DISPLAY_SEQUENCE), 0) + 1 AS NEXT_SEQ FROM ${this.TABLE_NAME} WHERE LOOKUP_TYPE_ID = :1`;
    const result = await connection.execute(query, [lookupTypeId], this.ROW_OBJECT);
    return result.rows[0]?.NEXT_SEQ ?? 1;
  }

  static async findAll(filters = {}) {
    try {
      const enterpriseIdNum = this.parseRequiredEnterpriseIdNum(filters);

      const fromClause = `FROM ${this.TABLE_NAME} a
        INNER JOIN ${this.TYPES_TABLE} t ON a.LOOKUP_TYPE_ID = t.LOOKUP_TYPE_ID
          AND (t.ENTERPRISE_ID = :scope_ent OR t.ENTERPRISE_ID IS NULL)`;

      let countQuery = `SELECT COUNT(*) AS total ${fromClause}`;
      let dataQuery = `SELECT
        RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
        a.LOOKUP_VALUE_ID,
        a.ENTERPRISE_ID,
        a.LOOKUP_TYPE_ID,
        a.VALUE_CODE,
        a.VALUE_NAME,
        a.DISPLAY_SEQUENCE,
        a.ACTIVE_FLAG,
        a.CREATED_BY,
        a.CREATION_DATE,
        a.LAST_UPDATED_BY,
        a.LAST_UPDATE_DATE
      ${fromClause}`;

      const conditions = [];
      const bindParams = { scope_ent: enterpriseIdNum };

      conditions.push('(a.ENTERPRISE_ID = :val_ent OR a.ENTERPRISE_ID IS NULL)');
      bindParams.val_ent = enterpriseIdNum;

      if (filters.lookupTypeCode != null && String(filters.lookupTypeCode).trim() !== '') {
        conditions.push('UPPER(t.TYPE_CODE) = UPPER(:lookup_type_code)');
        bindParams.lookup_type_code = String(filters.lookupTypeCode).trim();
      }
      if (filters.lookupTypeId !== undefined) {
        conditions.push('a.LOOKUP_TYPE_ID = :lookup_type_id');
        bindParams.lookup_type_id = filters.lookupTypeId;
      }
      if (filters.activeFlag !== undefined) {
        const v = this.coerceActiveFlagYn(filters.activeFlag);
        conditions.push('a.ACTIVE_FLAG = :active_flag');
        bindParams.active_flag = v;
      }
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.VALUE_CODE) LIKE UPPER(:search_a) OR
          UPPER(a.VALUE_NAME) LIKE UPPER(:search_b)
        )`);
        bindParams.search_a = searchValue;
        bindParams.search_b = searchValue;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;
      countQuery += whereClause;
      dataQuery += whereClause;

      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = await db.executeQuery(countQuery, bindParams, this.ROW_OBJECT);
      const rawCountRows = countResult.rows || [];
      const total = this.convertKeysToSnakeCase(rawCountRows)[0]?.total || 0;

      dataQuery += ` ORDER BY a.LOOKUP_TYPE_ID, a.DISPLAY_SEQUENCE, a.VALUE_CODE`;
      dataQuery += ` OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY`;
      bindParams.offset = offset;
      bindParams.page_size = pageSize;

      const dataResult = await db.executeQuery(dataQuery, bindParams, this.ROW_OBJECT);
      const rows = dataResult.rows ? this.convertKeysToSnakeCase(dataResult.rows) : [];

      return {
        lookupValues: rows,
        total
      };
    } catch (error) {
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup values', error);
    }
  }

  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const query = `SELECT
        RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
        a.LOOKUP_VALUE_ID,
        a.ENTERPRISE_ID,
        a.LOOKUP_TYPE_ID,
        a.VALUE_CODE,
        a.VALUE_NAME,
        a.DISPLAY_SEQUENCE,
        a.ACTIVE_FLAG,
        a.CREATED_BY,
        a.CREATION_DATE,
        a.LAST_UPDATED_BY,
        a.LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} a
      WHERE a.LOOKUP_VALUE_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup value', error);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let lookupValueId;
        try {
          const seqQuery = `SELECT FNDSEC.FNDSEC_LOOKUP_VALUES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], this.ROW_OBJECT);
          lookupValueId = seqResult.rows[0].NEXT_ID;
        } catch (_) {
          const maxQuery = `SELECT NVL(MAX(LOOKUP_VALUE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], this.ROW_OBJECT);
          lookupValueId = maxResult.rows[0].NEXT_ID;
        }

        const lookupTypeId = data.LOOKUP_TYPE_ID ?? null;
        const displaySequence =
          data.DISPLAY_SEQUENCE != null
            ? Number(data.DISPLAY_SEQUENCE)
            : await this.getNextDisplaySequence(connection, lookupTypeId);

        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const now = new Date();
        const enterpriseId =
          data.ENTERPRISE_ID != null && data.ENTERPRISE_ID !== '' ? Number(data.ENTERPRISE_ID) : null;

        const query = `INSERT INTO ${this.TABLE_NAME} (
          LOOKUP_VALUE_GUID,
          LOOKUP_VALUE_ID,
          ENTERPRISE_ID,
          LOOKUP_TYPE_ID,
          VALUE_CODE,
          VALUE_NAME,
          DISPLAY_SEQUENCE,
          ACTIVE_FLAG,
          CREATED_BY,
          CREATION_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12
        )`;

        const bindParams = [
          guidBuffer,
          lookupValueId,
          enterpriseId,
          lookupTypeId,
          data.VALUE_CODE ?? null,
          data.VALUE_NAME ?? null,
          displaySequence,
          data.ACTIVE_FLAG !== undefined && data.ACTIVE_FLAG !== null
            ? this.coerceActiveFlagYn(data.ACTIVE_FLAG)
            : 'Y',
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now
        ];

        await connection.execute(query, bindParams, this.ROW_OBJECT);

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
          a.LOOKUP_VALUE_ID,
          a.ENTERPRISE_ID,
          a.LOOKUP_TYPE_ID,
          a.VALUE_CODE,
          a.VALUE_NAME,
          a.DISPLAY_SEQUENCE,
          a.ACTIVE_FLAG,
          a.CREATED_BY,
          a.CREATION_DATE,
          a.LAST_UPDATED_BY,
          a.LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_VALUE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [lookupValueId], this.ROW_OBJECT);

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve created lookup value');
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup value with this VALUE_CODE already exists for this type',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create lookup value', error);
    }
  }

  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.LOOKUP_TYPE_ID !== undefined) {
          updateFields.push(`LOOKUP_TYPE_ID = :${paramIndex}`);
          bindParams.push(data.LOOKUP_TYPE_ID);
          paramIndex++;
        }
        if (data.VALUE_CODE !== undefined) {
          updateFields.push(`VALUE_CODE = :${paramIndex}`);
          bindParams.push(data.VALUE_CODE);
          paramIndex++;
        }
        if (data.VALUE_NAME !== undefined) {
          updateFields.push(`VALUE_NAME = :${paramIndex}`);
          bindParams.push(data.VALUE_NAME);
          paramIndex++;
        }
        if (data.DISPLAY_SEQUENCE !== undefined) {
          updateFields.push(`DISPLAY_SEQUENCE = :${paramIndex}`);
          bindParams.push(Number(data.DISPLAY_SEQUENCE));
          paramIndex++;
        }
        if (data.ACTIVE_FLAG !== undefined) {
          const v = this.coerceActiveFlagYn(data.ACTIVE_FLAG);
          updateFields.push(`ACTIVE_FLAG = :${paramIndex}`);
          bindParams.push(v);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          const selectQuery = `SELECT
            RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
            a.LOOKUP_VALUE_ID,
            a.ENTERPRISE_ID,
            a.LOOKUP_TYPE_ID,
            a.VALUE_CODE,
            a.VALUE_NAME,
            a.DISPLAY_SEQUENCE,
            a.ACTIVE_FLAG,
            a.CREATED_BY,
            a.CREATION_DATE,
            a.LAST_UPDATED_BY,
            a.LAST_UPDATE_DATE
          FROM ${this.TABLE_NAME} a
          WHERE a.LOOKUP_VALUE_GUID = :1`;
          const selectResult = await connection.execute(selectQuery, [guidBuffer], this.ROW_OBJECT);
          if (selectResult.rows && selectResult.rows.length > 0) {
            return this.convertKeysToSnakeCase(selectResult.rows[0]);
          }
          throw new DatabaseError('Lookup value not found');
        }

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;
        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(guidBuffer);
        const updateQuery = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE LOOKUP_VALUE_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, this.ROW_OBJECT);

        if (updateResult.rowsAffected === 0) {
          throw new DatabaseError('Lookup value not found');
        }

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_VALUE_GUID) AS LOOKUP_VALUE_GUID,
          a.LOOKUP_VALUE_ID,
          a.ENTERPRISE_ID,
          a.LOOKUP_TYPE_ID,
          a.VALUE_CODE,
          a.VALUE_NAME,
          a.DISPLAY_SEQUENCE,
          a.ACTIVE_FLAG,
          a.CREATED_BY,
          a.CREATION_DATE,
          a.LAST_UPDATED_BY,
          a.LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_VALUE_GUID = :1`;
        const selectResult = await connection.execute(selectQuery, [guidBuffer], this.ROW_OBJECT);
        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve updated lookup value');
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Lookup value with this VALUE_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update lookup value', error);
    }
  }

  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LOOKUP_VALUE_GUID = :1`;
        const result = await connection.execute(query, [guidBuffer], this.ROW_OBJECT);

        if (result.rowsAffected === 0) {
          throw new DatabaseError('Lookup value not found');
        }
        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError(
          'Cannot delete lookup value: it is referenced by other records',
          error
        );
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete lookup value', error);
    }
  }
}

export default FndsecLookupValueModel;
