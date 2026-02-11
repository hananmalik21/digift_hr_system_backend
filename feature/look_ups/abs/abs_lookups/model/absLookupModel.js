import db from '../../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * ABS Lookup Model
 * Handles all database operations for ABS.ABS_LOOKUPS table
 */
class AbsLookupModel {
  static TABLE_NAME = 'ABS.ABS_LOOKUPS';
  static CHILD_TABLE_NAME = 'ABS.ABS_LOOKUP_VALUES';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
        converted[newKey] = value;
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

  static async findAll(tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      const query = `SELECT 
        LOOKUP_ID,
        LOOKUP_CODE,
        LOOKUP_NAME,
        TENANT_ID,
        STATUS,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :1
      ORDER BY LOOKUP_CODE`;

      const result = await this.executeQuery(query, [tenantId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch lookups: ${error.message}`);
    }
  }

  static async findById(lookupId, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      const query = `SELECT 
        LOOKUP_ID,
        LOOKUP_CODE,
        LOOKUP_NAME,
        TENANT_ID,
        STATUS,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;

      const result = await this.executeQuery(query, [lookupId, tenantId]);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch lookup: ${error.message}`);
    }
  }

  static async codeExists(lookupCode, tenantId, excludeLookupId = null) {
    try {
      let query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE UPPER(LOOKUP_CODE) = UPPER(:1) AND TENANT_ID = :2`;
      const bindParams = [lookupCode, tenantId];
      if (excludeLookupId) {
        query += ` AND LOOKUP_ID != :3`;
        bindParams.push(excludeLookupId);
      }
      const result = await this.executeQuery(query, bindParams);
      const count = result.rows && result.rows.length > 0 ? result.rows[0].count : 0;
      return count > 0;
    } catch (error) {
      console.error('Error in codeExists:', error);
      throw new Error(`Failed to check lookup code: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!data.TENANT_ID) {
          const validationError = new Error('TENANT_ID is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const exists = await this.codeExists(data.LOOKUP_CODE, data.TENANT_ID);
        if (exists) {
          const conflictError = new Error(`Lookup code '${data.LOOKUP_CODE}' already exists for this tenant`);
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        const seqQuery = `SELECT ABS.ABS_LOOKUPS_SEQ.NEXTVAL AS next_id FROM DUAL`;
        const seqResult = await connection.execute(seqQuery, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        const lookupId = seqResult.rows[0].NEXT_ID;
        const status = data.STATUS || 'ACTIVE';

        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          LOOKUP_ID,
          LOOKUP_CODE,
          LOOKUP_NAME,
          TENANT_ID,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9
        )`;

        const now = new Date();
        await connection.execute(insertQuery, [
          lookupId,
          data.LOOKUP_CODE.toUpperCase(),
          data.LOOKUP_NAME,
          data.TENANT_ID,
          status,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now
        ], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const selectQuery = `SELECT 
          LOOKUP_ID,
          LOOKUP_CODE,
          LOOKUP_NAME,
          TENANT_ID,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [lookupId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to create lookup: ${error.message}`);
    }
  }

  static async update(lookupId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const existing = await this.findById(lookupId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.LOOKUP_NAME !== undefined) {
          if (!data.LOOKUP_NAME || data.LOOKUP_NAME.trim() === '') {
            const validationError = new Error('LOOKUP_NAME cannot be empty');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`LOOKUP_NAME = :${paramIndex}`);
          bindParams.push(data.LOOKUP_NAME);
          paramIndex++;
        }

        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;
        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(lookupId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE LOOKUP_ID = :${paramIndex - 1} AND TENANT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const selectQuery = `SELECT 
          LOOKUP_ID,
          LOOKUP_CODE,
          LOOKUP_NAME,
          TENANT_ID,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;
        const selectResult = await connection.execute(selectQuery, [lookupId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to update lookup: ${error.message}`);
    }
  }

  static async getChildRecordCount(lookupId, tenantId) {
    try {
      const query = `SELECT COUNT(*) AS count 
        FROM ${this.CHILD_TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;
      const result = await this.executeQuery(query, [lookupId, tenantId]);
      const count = result.rows && result.rows.length > 0 ? result.rows[0].count : 0;
      return count;
    } catch (error) {
      console.error('Error in getChildRecordCount:', error);
      throw new Error(`Failed to check child records: ${error.message}`);
    }
  }

  static async delete(lookupId, tenantId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const existing = await this.findById(lookupId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const childCount = await this.getChildRecordCount(lookupId, tenantId);
        if (childCount > 0) {
          const validationError = new Error(
            `Cannot delete lookup: ${childCount} record(s) exist in ABS_LOOKUP_VALUES. Please delete child records first.`
          );
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          validationError.childCount = childCount;
          throw validationError;
        }

        const deleteQuery = `DELETE FROM ${this.TABLE_NAME} 
          WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;
        const deleteResult = await connection.execute(deleteQuery, [lookupId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          const notFoundError = new Error('Lookup not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        return true;
      });
    } catch (error) {
      console.error('Error in delete:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to delete lookup: ${error.message}`);
    }
  }
}

export default AbsLookupModel;
