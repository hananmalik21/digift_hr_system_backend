import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '../../../../../utils/guidUtils.js';

/**
 * Rec Lookup Value Model
 * Handles all database operations for REC.REC_LOOKUP_VALUES table.
 * Enterprise scoping: if enterprise_id is provided, return both global (NULL) + enterprise rows.
 */
class RecLookupValueModel {
  static TABLE_NAME = 'REC.REC_LOOKUP_VALUES';
  static LOOKUP_TYPES_TABLE = 'REC.REC_LOOKUP_TYPES';

  static LOOKUP_VALUE_SELECT = `
    RAWTOHEX(a.LOOKUP_GUID) AS LOOKUP_GUID,
    a.LOOKUP_ID,
    a.ENTERPRISE_ID,
    a.LOOKUP_TYPE,
    a.LOOKUP_CODE,
    a.MEANING_EN,
    a.MEANING_AR,
    a.DESCRIPTION_EN,
    a.DESCRIPTION_AR,
    a.DISPLAY_SEQUENCE,
    a.IS_ENABLED,
    a.START_DATE,
    a.END_DATE,
    a.CREATED_AT,
    a.CREATED_BY,
    a.UPDATED_AT,
    a.UPDATED_BY`;

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

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

  static async resolveLookupTypeCodeById(connection, lookupTypeId, enterpriseId = null) {
    if (lookupTypeId == null) return null;
    const query = `SELECT t.TYPE_CODE
      FROM ${this.LOOKUP_TYPES_TABLE} t
      WHERE t.LOOKUP_TYPE_ID = :1
        AND (:2 IS NULL OR t.ENTERPRISE_ID = :2 OR t.ENTERPRISE_ID IS NULL)`;
    const result = await connection.execute(query, [lookupTypeId, enterpriseId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows?.[0]?.TYPE_CODE ?? null;
  }

  static async getNextDisplaySequence(connection, lookupTypeCode, enterpriseId = null) {
    let query = `SELECT NVL(MAX(DISPLAY_SEQUENCE), 0) + 1 AS NEXT_SEQ FROM ${this.TABLE_NAME} WHERE LOOKUP_TYPE = :1`;
    const bindParams = [lookupTypeCode];
    if (enterpriseId !== undefined && enterpriseId !== null) {
      query += ` AND (ENTERPRISE_ID = :2 OR ENTERPRISE_ID IS NULL)`;
      bindParams.push(enterpriseId);
    }
    const result = await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows[0]?.NEXT_SEQ ?? 1;
  }

  static async findAll(filters = {}) {
    try {
      const useTypeIdJoin = filters.lookupTypeId !== undefined;
      const fromClause = useTypeIdJoin
        ? `FROM ${this.TABLE_NAME} a INNER JOIN ${this.LOOKUP_TYPES_TABLE} t ON UPPER(TRIM(a.LOOKUP_TYPE)) = UPPER(TRIM(t.TYPE_CODE))`
        : `FROM ${this.TABLE_NAME} a`;

      let countQuery = `SELECT COUNT(*) AS total ${fromClause}`;
      let dataQuery = `SELECT ${this.LOOKUP_VALUE_SELECT} ${fromClause}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.enterpriseId !== undefined) {
        conditions.push(`(a.ENTERPRISE_ID = :${paramIndex} OR a.ENTERPRISE_ID IS NULL)`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }
      if (filters.lookupTypeId !== undefined) {
        conditions.push(`t.LOOKUP_TYPE_ID = :${paramIndex}`);
        bindParams.push(filters.lookupTypeId);
        paramIndex++;
      }
      if (filters.lookupType !== undefined) {
        conditions.push(`a.LOOKUP_TYPE = :${paramIndex}`);
        bindParams.push(filters.lookupType);
        paramIndex++;
      }
      if (filters.isEnabled !== undefined) {
        const v = filters.isEnabled === true || filters.isEnabled === 'Y' || filters.isEnabled === 1 ? 'Y' : 'N';
        conditions.push(`a.IS_ENABLED = :${paramIndex}`);
        bindParams.push(v);
        paramIndex++;
      }
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.LOOKUP_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(a.MEANING_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(a.MEANING_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue, searchValue, searchValue);
        paramIndex += 3;
      }

      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      dataQuery += ` ORDER BY a.LOOKUP_TYPE, NVL(a.ENTERPRISE_ID, -1), a.DISPLAY_SEQUENCE, a.LOOKUP_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset, pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);
      return {
        lookupValues: dataResult.rows || [],
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

      const query = `SELECT ${this.LOOKUP_VALUE_SELECT}
      FROM ${this.TABLE_NAME} a
      WHERE a.LOOKUP_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      return result.rows?.[0] ?? null;
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
        return await this.insertOne(connection, data, userId);
      });
    } catch (error) {
      this.rethrowCreateError(error, 'Failed to create lookup value');
    }
  }

  static displaySequenceScopeKey(lookupTypeCode, enterpriseId) {
    return `${lookupTypeCode ?? 'null'}:${enterpriseId ?? 'null'}`;
  }

  static toDateValue(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  static normalizeIsEnabled(value, defaultValue = 'Y') {
    if (value === undefined || value === null) return defaultValue;
    return value === true || value === 'Y' || value === 1 ? 'Y' : 'N';
  }

  static async fetchByLookupId(connection, lookupId) {
    const selectQuery = `SELECT ${this.LOOKUP_VALUE_SELECT}
    FROM ${this.TABLE_NAME} a
    WHERE a.LOOKUP_ID = :1`;

    const selectResult = await connection.execute(selectQuery, [lookupId], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    if (selectResult.rows?.length) {
      return this.convertKeysToSnakeCase(selectResult.rows[0]);
    }
    throw new DatabaseError('Failed to retrieve created lookup value');
  }

  static async fetchByGuidBuffer(connection, guidBuffer) {
    const selectQuery = `SELECT ${this.LOOKUP_VALUE_SELECT}
    FROM ${this.TABLE_NAME} a
    WHERE a.LOOKUP_GUID = :1`;

    const selectResult = await connection.execute(selectQuery, [guidBuffer], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    if (selectResult.rows?.length) {
      return this.convertKeysToSnakeCase(selectResult.rows[0]);
    }
    throw new DatabaseError('Lookup value not found');
  }

  static async resolveLookupTypeCode(connection, data) {
    const enterpriseId = data.ENTERPRISE_ID !== undefined && data.ENTERPRISE_ID !== null ? data.ENTERPRISE_ID : null;
    let lookupTypeCode = data.LOOKUP_TYPE ?? null;
    if (!lookupTypeCode && data.LOOKUP_TYPE_ID != null) {
      lookupTypeCode = await this.resolveLookupTypeCodeById(connection, data.LOOKUP_TYPE_ID, enterpriseId);
    }
    return { lookupTypeCode, enterpriseId };
  }

  static async resolveBulkDisplaySequence(connection, data, nextDisplaySequenceByScope) {
    if (data.DISPLAY_SEQUENCE != null) {
      return Number(data.DISPLAY_SEQUENCE);
    }

    const { lookupTypeCode, enterpriseId } = await this.resolveLookupTypeCode(connection, data);
    const scopeKey = this.displaySequenceScopeKey(lookupTypeCode, enterpriseId);
    if (!nextDisplaySequenceByScope.has(scopeKey)) {
      nextDisplaySequenceByScope.set(
        scopeKey,
        await this.getNextDisplaySequence(connection, lookupTypeCode, enterpriseId)
      );
    }

    const displaySequence = nextDisplaySequenceByScope.get(scopeKey);
    nextDisplaySequenceByScope.set(scopeKey, displaySequence + 1);
    return displaySequence;
  }

  static rethrowCreateError(error, fallbackMessage) {
    if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
      const conflictError = new DatabaseError(
        'Lookup value with this LOOKUP_CODE already exists for this type',
        error
      );
      conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
      throw conflictError;
    }
    if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
      throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
    }
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(fallbackMessage, error);
  }

  static async insertOne(connection, data, userId, displaySequenceOverride = null) {
    let lookupId;
    try {
      const seqQuery = `SELECT REC.REC_LOOKUP_VALUES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
      const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      lookupId = seqResult.rows[0].NEXT_ID;
    } catch (_) {
      const maxQuery = `SELECT NVL(MAX(LOOKUP_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
      const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      lookupId = maxResult.rows[0].NEXT_ID;
    }

    const { lookupTypeCode, enterpriseId } = await this.resolveLookupTypeCode(connection, data);

    const displaySequence = displaySequenceOverride != null
      ? displaySequenceOverride
      : (data.DISPLAY_SEQUENCE != null
        ? Number(data.DISPLAY_SEQUENCE)
        : await this.getNextDisplaySequence(connection, lookupTypeCode, enterpriseId));

    const { buffer: guidBuffer } = await generateSysGuid(connection);
    const now = new Date();

    const query = `INSERT INTO ${this.TABLE_NAME} (
      LOOKUP_GUID,
      LOOKUP_ID,
      ENTERPRISE_ID,
      LOOKUP_TYPE,
      LOOKUP_CODE,
      MEANING_EN,
      MEANING_AR,
      DESCRIPTION_EN,
      DESCRIPTION_AR,
      DISPLAY_SEQUENCE,
      IS_ENABLED,
      START_DATE,
      END_DATE,
      CREATED_AT,
      CREATED_BY,
      UPDATED_AT,
      UPDATED_BY
    ) VALUES (
      :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17
    )`;

    const bindParams = [
      guidBuffer,
      lookupId,
      enterpriseId,
      lookupTypeCode,
      data.LOOKUP_CODE ?? null,
      data.MEANING_EN ?? null,
      data.MEANING_AR ?? null,
      data.DESCRIPTION_EN ?? null,
      data.DESCRIPTION_AR ?? null,
      displaySequence,
      this.normalizeIsEnabled(data.IS_ENABLED),
      this.toDateValue(data.START_DATE),
      this.toDateValue(data.END_DATE),
      now,
      userId || 'SYSTEM',
      now,
      userId || 'SYSTEM'
    ];

    await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return this.fetchByLookupId(connection, lookupId);
  }

  static async createBulk(dataArray, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const created = [];
        const nextDisplaySequenceByScope = new Map();

        for (const data of dataArray) {
          const displaySequenceOverride = await this.resolveBulkDisplaySequence(
            connection,
            data,
            nextDisplaySequenceByScope
          );
          created.push(await this.insertOne(connection, data, userId, displaySequenceOverride));
        }

        return created;
      });
    } catch (error) {
      this.rethrowCreateError(error, 'Failed to create lookup values');
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

        if (data.ENTERPRISE_ID !== undefined) {
          updateFields.push(`ENTERPRISE_ID = :${paramIndex}`);
          bindParams.push(data.ENTERPRISE_ID);
          paramIndex++;
        }
        if (data.LOOKUP_TYPE !== undefined) {
          updateFields.push(`LOOKUP_TYPE = :${paramIndex}`);
          bindParams.push(data.LOOKUP_TYPE);
          paramIndex++;
        }
        if (data.LOOKUP_CODE !== undefined) {
          updateFields.push(`LOOKUP_CODE = :${paramIndex}`);
          bindParams.push(data.LOOKUP_CODE);
          paramIndex++;
        }
        if (data.MEANING_EN !== undefined) {
          updateFields.push(`MEANING_EN = :${paramIndex}`);
          bindParams.push(data.MEANING_EN);
          paramIndex++;
        }
        if (data.MEANING_AR !== undefined) {
          updateFields.push(`MEANING_AR = :${paramIndex}`);
          bindParams.push(data.MEANING_AR);
          paramIndex++;
        }
        if (data.DESCRIPTION_EN !== undefined) {
          updateFields.push(`DESCRIPTION_EN = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION_EN);
          paramIndex++;
        }
        if (data.DESCRIPTION_AR !== undefined) {
          updateFields.push(`DESCRIPTION_AR = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION_AR);
          paramIndex++;
        }
        if (data.DISPLAY_SEQUENCE !== undefined) {
          updateFields.push(`DISPLAY_SEQUENCE = :${paramIndex}`);
          bindParams.push(data.DISPLAY_SEQUENCE);
          paramIndex++;
        }
        if (data.IS_ENABLED !== undefined) {
          updateFields.push(`IS_ENABLED = :${paramIndex}`);
          bindParams.push(this.normalizeIsEnabled(data.IS_ENABLED));
          paramIndex++;
        }
        if (data.START_DATE !== undefined) {
          updateFields.push(`START_DATE = :${paramIndex}`);
          bindParams.push(this.toDateValue(data.START_DATE));
          paramIndex++;
        }
        if (data.END_DATE !== undefined) {
          updateFields.push(`END_DATE = :${paramIndex}`);
          bindParams.push(this.toDateValue(data.END_DATE));
          paramIndex++;
        }

        if (updateFields.length === 0) {
          return this.fetchByGuidBuffer(connection, guidBuffer);
        }

        updateFields.push(`UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;
        updateFields.push(`UPDATED_AT = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(guidBuffer);
        const updateQuery = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE LOOKUP_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (updateResult.rowsAffected === 0) throw new DatabaseError('Lookup value not found');

        return this.fetchByGuidBuffer(connection, guidBuffer);
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Lookup value with this LOOKUP_CODE already exists', error);
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
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LOOKUP_GUID = :1`;
        const result = await connection.execute(query, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (result.rowsAffected === 0) throw new DatabaseError('Lookup value not found');
        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError('Cannot delete lookup value: it is referenced by other records', error);
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

export default RecLookupValueModel;

