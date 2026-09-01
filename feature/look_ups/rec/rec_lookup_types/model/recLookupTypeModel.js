import db from '../../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../../utils/errors/index.js';
import { ensureHex32, hexToRawBuffer, generateSysGuid } from '@digifyhr/common';

/**
 * Rec Lookup Type Model
 * Handles all database operations for REC.REC_LOOKUP_TYPES table
 * Enterprise scoping: if enterprise_id is provided, return both global (NULL) + enterprise rows.
 */
class RecLookupTypeModel {
  static TABLE_NAME = 'REC.REC_LOOKUP_TYPES';

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

  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT
        RAWTOHEX(a.LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
        a.LOOKUP_TYPE_ID,
        a.ENTERPRISE_ID,
        a.TYPE_CODE,
        a.TYPE_NAME,
        a.IS_ACTIVE,
        a.CREATED_AT,
        a.CREATED_BY,
        a.UPDATED_AT,
        a.UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.enterpriseId !== undefined) {
        conditions.push(`(a.ENTERPRISE_ID = :${paramIndex} OR a.ENTERPRISE_ID IS NULL)`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }
      if (filters.isActive !== undefined) {
        const activeVal = filters.isActive === true || filters.isActive === 'Y' || filters.isActive === 1 ? 'Y' : 'N';
        conditions.push(`a.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(activeVal);
        paramIndex++;
      }
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.TYPE_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(a.TYPE_NAME) LIKE UPPER(:${paramIndex + 1})
        )`);
        bindParams.push(searchValue, searchValue);
        paramIndex += 2;
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

      dataQuery += ` ORDER BY NVL(a.ENTERPRISE_ID, -1), a.TYPE_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset, pageSize);

      const dataResult = await this.executeQuery(dataQuery, bindParams);
      return {
        lookupTypes: dataResult.rows || [],
        total
      };
    } catch (error) {
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup types', error);
    }
  }

  static async findByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      const query = `SELECT
        RAWTOHEX(a.LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
        a.LOOKUP_TYPE_ID,
        a.ENTERPRISE_ID,
        a.TYPE_CODE,
        a.TYPE_NAME,
        a.IS_ACTIVE,
        a.CREATED_AT,
        a.CREATED_BY,
        a.UPDATED_AT,
        a.UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.LOOKUP_TYPE_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      return result.rows?.[0] ?? null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch lookup type', error);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let lookupTypeId;
        try {
          const seqQuery = `SELECT REC.REC_LOOKUP_TYPES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          lookupTypeId = seqResult.rows[0].NEXT_ID;
        } catch (_) {
          const maxQuery = `SELECT NVL(MAX(LOOKUP_TYPE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          lookupTypeId = maxResult.rows[0].NEXT_ID;
        }

        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const now = new Date();

        const query = `INSERT INTO ${this.TABLE_NAME} (
          LOOKUP_TYPE_GUID,
          LOOKUP_TYPE_ID,
          ENTERPRISE_ID,
          TYPE_CODE,
          TYPE_NAME,
          IS_ACTIVE,
          CREATED_AT,
          CREATED_BY,
          UPDATED_AT,
          UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10
        )`;

        const bindParams = [
          guidBuffer,
          lookupTypeId,
          data.ENTERPRISE_ID !== undefined && data.ENTERPRISE_ID !== null ? data.ENTERPRISE_ID : null,
          data.TYPE_CODE || null,
          data.TYPE_NAME || null,
          data.IS_ACTIVE !== undefined && data.IS_ACTIVE !== null
            ? (data.IS_ACTIVE === true || data.IS_ACTIVE === 'Y' || data.IS_ACTIVE === 1 ? 'Y' : 'N')
            : 'Y',
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
          a.LOOKUP_TYPE_ID,
          a.ENTERPRISE_ID,
          a.TYPE_CODE,
          a.TYPE_NAME,
          a.IS_ACTIVE,
          a.CREATED_AT,
          a.CREATED_BY,
          a.UPDATED_AT,
          a.UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_TYPE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [lookupTypeId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve created lookup type');
      });
    } catch (error) {
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError(
          'Lookup type with this TYPE_CODE already exists for this enterprise',
          error
        );
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create lookup type', error);
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
        if (data.TYPE_CODE !== undefined) {
          updateFields.push(`TYPE_CODE = :${paramIndex}`);
          bindParams.push(data.TYPE_CODE);
          paramIndex++;
        }
        if (data.TYPE_NAME !== undefined) {
          updateFields.push(`TYPE_NAME = :${paramIndex}`);
          bindParams.push(data.TYPE_NAME);
          paramIndex++;
        }
        if (data.IS_ACTIVE !== undefined) {
          const activeVal = data.IS_ACTIVE === true || data.IS_ACTIVE === 'Y' || data.IS_ACTIVE === 1 ? 'Y' : 'N';
          updateFields.push(`IS_ACTIVE = :${paramIndex}`);
          bindParams.push(activeVal);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          const selectQuery = `SELECT
            RAWTOHEX(a.LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
            a.LOOKUP_TYPE_ID,
            a.ENTERPRISE_ID,
            a.TYPE_CODE,
            a.TYPE_NAME,
            a.IS_ACTIVE,
            a.CREATED_AT,
            a.CREATED_BY,
            a.UPDATED_AT,
            a.UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.LOOKUP_TYPE_GUID = :1`;
          const selectResult = await connection.execute(selectQuery, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
          throw new DatabaseError('Lookup type not found');
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
          WHERE LOOKUP_TYPE_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (updateResult.rowsAffected === 0) throw new DatabaseError('Lookup type not found');

        const selectQuery = `SELECT
          RAWTOHEX(a.LOOKUP_TYPE_GUID) AS LOOKUP_TYPE_GUID,
          a.LOOKUP_TYPE_ID,
          a.ENTERPRISE_ID,
          a.TYPE_CODE,
          a.TYPE_NAME,
          a.IS_ACTIVE,
          a.CREATED_AT,
          a.CREATED_BY,
          a.UPDATED_AT,
          a.UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.LOOKUP_TYPE_GUID = :1`;
        const selectResult = await connection.execute(selectQuery, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (selectResult.rows?.length) return this.convertKeysToSnakeCase(selectResult.rows[0]);
        throw new DatabaseError('Failed to retrieve updated lookup type');
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Lookup type with this TYPE_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update lookup type', error);
    }
  }

  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = ensureHex32(guidHex32, 'guid');
      const guidBuffer = hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE LOOKUP_TYPE_GUID = :1`;
        const result = await connection.execute(query, [guidBuffer], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (result.rowsAffected === 0) throw new DatabaseError('Lookup type not found');
        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) throw error;
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError(
          'Cannot delete lookup type: it is referenced by other records (e.g., lookup values)',
          error
        );
        fkError.code = 'FOREIGN_KEY_CONSTRAINT';
        throw fkError;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete lookup type', error);
    }
  }
}

export default RecLookupTypeModel;

