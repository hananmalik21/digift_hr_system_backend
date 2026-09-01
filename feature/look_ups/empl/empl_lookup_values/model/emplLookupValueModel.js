import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '@digifyhr/common';
import {
  applyLookupEnterpriseFilter,
  bindLookupEnterpriseId
} from '../../../../../utils/lookupEnterpriseUtils.js';

/**
 * Empl Lookup Value Model
 * Handles all database operations for EMPL.EMPL_LOOKUP_VALUES table.
 */
class EmplLookupValueModel {
  static TABLE_NAME = 'EMPL.EMPL_LOOKUP_VALUES';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
      return obj.toString('hex').toUpperCase();
    }
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

  /**
   * Global vs enterprise LOOKUP_CODE (per LOOKUP_TYPE) cannot coexist (case-insensitive).
   */
  static async assertNoCrossScopeValueCodeConflict(
    connection,
    { enterpriseId, lookupType, lookupCode, excludeGuidBuffer = null }
  ) {
    const typeCode = lookupType != null ? String(lookupType).trim() : '';
    const code = lookupCode != null ? String(lookupCode).trim() : '';
    if (!typeCode || !code) return;

    const bindParams = [typeCode, code];
    let excludeClause = '';
    if (excludeGuidBuffer) {
      excludeClause = ' AND v.LOOKUP_GUID <> :3';
      bindParams.push(excludeGuidBuffer);
    }

    if (enterpriseId != null) {
      const query = `SELECT 1
        FROM ${this.TABLE_NAME} v
        WHERE v.ENTERPRISE_ID IS NULL
          AND UPPER(TRIM(v.LOOKUP_TYPE)) = UPPER(TRIM(:1))
          AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:2))
          ${excludeClause}
        FETCH FIRST 1 ROWS ONLY`;
      const result = await connection.execute(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      if (result.rows?.length) {
        const err = new DatabaseError(
          `LOOKUP_CODE "${code}" for type "${typeCode}" already exists as a global lookup value and cannot be duplicated for a specific enterprise.`,
          null,
          `LOOKUP_CODE "${code}" already exists as a global lookup value for this type.`
        );
        err.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw err;
      }
      return;
    }

    const query = `SELECT 1
      FROM ${this.TABLE_NAME} v
      WHERE v.ENTERPRISE_ID IS NOT NULL
        AND UPPER(TRIM(v.LOOKUP_TYPE)) = UPPER(TRIM(:1))
        AND UPPER(TRIM(v.LOOKUP_CODE)) = UPPER(TRIM(:2))
        ${excludeClause}
      FETCH FIRST 1 ROWS ONLY`;
    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    if (result.rows?.length) {
      const err = new DatabaseError(
        `LOOKUP_CODE "${code}" for type "${typeCode}" already exists for one or more enterprises and cannot be created as a global lookup value.`,
        null,
        `LOOKUP_CODE "${code}" already exists for an enterprise for this type.`
      );
      err.code = 'UNIQUE_CONSTRAINT_VIOLATION';
      throw err;
    }
  }

  static async getNextDisplaySequence(connection, lookupType, enterpriseId = null) {
    let query = `SELECT NVL(MAX(DISPLAY_SEQUENCE), 0) + 1 AS NEXT_SEQ FROM ${this.TABLE_NAME} WHERE LOOKUP_TYPE = :1`;
    const bindParams = [lookupType];
    if (enterpriseId !== undefined && enterpriseId !== null) {
      query += ` AND ENTERPRISE_ID = :2`;
      bindParams.push(enterpriseId);
    } else {
      query += ` AND ENTERPRISE_ID IS NULL`;
    }
    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    return result.rows[0]?.NEXT_SEQ ?? 1;
  }

  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT
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
        a.UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // GET: enterprise_id=N => global (NULL) + that enterprise; enterprise_id=null => global only
      paramIndex = applyLookupEnterpriseFilter(conditions, bindParams, paramIndex, filters.enterpriseId, 'a');
      if (filters.lookupType) {
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

      dataQuery += ` ORDER BY a.LOOKUP_TYPE, CASE WHEN a.ENTERPRISE_ID IS NULL THEN 0 ELSE 1 END, a.DISPLAY_SEQUENCE, a.LOOKUP_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset, pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);
      return {
        lookupValues: dataResult.rows || [],
        total
      };
    } catch (error) {
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
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
        a.UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LOOKUP_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup value', error);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let lookupId;
        try {
          const seqQuery = `SELECT EMPL.EMPL_LOOKUP_VALUES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          lookupId = seqResult.rows[0].NEXT_ID;
        } catch (_) {
          const maxQuery = `SELECT NVL(MAX(LOOKUP_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          lookupId = maxResult.rows[0].NEXT_ID;
        }

        const lookupType = data.LOOKUP_TYPE ?? null;
        const enterpriseId = data.ENTERPRISE_ID !== undefined && data.ENTERPRISE_ID !== null ? data.ENTERPRISE_ID : null;
        const lookupCode = data.LOOKUP_CODE ?? null;

        await this.assertNoCrossScopeValueCodeConflict(connection, {
          enterpriseId,
          lookupType,
          lookupCode
        });

        const displaySequence = await this.getNextDisplaySequence(connection, lookupType, enterpriseId);

        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const now = new Date();

        const toDate = (v) => {
          if (v == null) return null;
          if (v instanceof Date) return v;
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };

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
          bindLookupEnterpriseId(enterpriseId),
          lookupType,
          lookupCode,
          data.MEANING_EN ?? null,
          data.MEANING_AR ?? null,
          data.DESCRIPTION_EN ?? null,
          data.DESCRIPTION_AR ?? null,
          displaySequence,
          data.IS_ENABLED !== undefined && data.IS_ENABLED !== null
            ? (data.IS_ENABLED === true || data.IS_ENABLED === 'Y' || data.IS_ENABLED === 1 ? 'Y' : 'N')
            : 'Y',
          toDate(data.START_DATE),
          toDate(data.END_DATE),
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const selectQuery = `SELECT
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
          a.UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [lookupId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve created lookup value');
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup value with this LOOKUP_CODE already exists for this type',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
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

        const toDate = (v) => {
          if (v == null) return null;
          if (v instanceof Date) return v;
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };

        if (data.ENTERPRISE_ID !== undefined) {
          updateFields.push(`ENTERPRISE_ID = :${paramIndex}`);
          bindParams.push(bindLookupEnterpriseId(data.ENTERPRISE_ID));
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
          const v = data.IS_ENABLED === true || data.IS_ENABLED === 'Y' || data.IS_ENABLED === 1 ? 'Y' : 'N';
          updateFields.push(`IS_ENABLED = :${paramIndex}`);
          bindParams.push(v);
          paramIndex++;
        }
        if (data.START_DATE !== undefined) {
          updateFields.push(`START_DATE = :${paramIndex}`);
          bindParams.push(toDate(data.START_DATE));
          paramIndex++;
        }
        if (data.END_DATE !== undefined) {
          updateFields.push(`END_DATE = :${paramIndex}`);
          bindParams.push(toDate(data.END_DATE));
          paramIndex++;
        }

        const existingResult = await connection.execute(
          `SELECT ENTERPRISE_ID, LOOKUP_TYPE, LOOKUP_CODE FROM ${this.TABLE_NAME} WHERE LOOKUP_GUID = :1`,
          [guidBuffer],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!existingResult.rows?.length) {
          throw new DatabaseError('Lookup value not found');
        }
        const existing = existingResult.rows[0];

        if (updateFields.length === 0) {
          const selectQuery = `SELECT
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
            a.UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.LOOKUP_GUID = :1`;
          const selectResult = await connection.execute(selectQuery, [guidBuffer], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }

        const effectiveEnterpriseId =
          data.ENTERPRISE_ID !== undefined ? data.ENTERPRISE_ID : existing.ENTERPRISE_ID;
        const effectiveLookupType = data.LOOKUP_TYPE !== undefined ? data.LOOKUP_TYPE : existing.LOOKUP_TYPE;
        const effectiveLookupCode = data.LOOKUP_CODE !== undefined ? data.LOOKUP_CODE : existing.LOOKUP_CODE;

        await this.assertNoCrossScopeValueCodeConflict(connection, {
          enterpriseId: effectiveEnterpriseId,
          lookupType: effectiveLookupType,
          lookupCode: effectiveLookupCode,
          excludeGuidBuffer: guidBuffer
        });

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

        const updateResult = await connection.execute(updateQuery, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (updateResult.rowsAffected === 0) {
          throw new DatabaseError('Lookup value not found');
        }

        const selectQuery = `SELECT
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
          a.UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_GUID = :1`;
        const selectResult = await connection.execute(selectQuery, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        throw new DatabaseError('Failed to retrieve updated lookup value');
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup value with this LOOKUP_CODE already exists',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
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
        const result = await connection.execute(query, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

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
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete lookup value', error);
    }
  }
}

export default EmplLookupValueModel;
