import db from '../../../../../config/db.js';
import oracledb from 'oracledb';

/**
 * ABS Lookup Value Model
 * Handles all database operations for ABS.ABS_LOOKUP_VALUES table
 */
class AbsLookupValueModel {
  static TABLE_NAME = 'ABS.ABS_LOOKUP_VALUES';
  static PARENT_TABLE_NAME = 'ABS.ABS_LOOKUPS';

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

  static async verifyLookupBelongsToTenant(lookupId, tenantId, connection = null) {
    try {
      const query = `SELECT COUNT(*) AS count 
        FROM ${this.PARENT_TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;

      let result;
      if (connection) {
        result = await connection.execute(query, [lookupId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        result = await this.executeQuery(query, [lookupId, tenantId]);
      }

      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      if (!row) return false;
      const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in verifyLookupBelongsToTenant:', error);
      throw new Error(`Failed to verify lookup: ${error.message}`);
    }
  }

  static async findAll(lookupId, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      const belongsToTenant = await this.verifyLookupBelongsToTenant(lookupId, tenantId);
      if (!belongsToTenant) {
        const notFoundError = new Error('Lookup not found or does not belong to tenant');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const query = `SELECT 
        LOOKUP_VALUE_ID,
        LOOKUP_ID,
        LOOKUP_VALUE_CODE,
        LOOKUP_VALUE_NAME,
        DISPLAY_ORDER,
        STATUS,
        TENANT_ID,
        CREATED_BY,
        CREATED_DATE
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_ID = :1 AND TENANT_ID = :2
      ORDER BY DISPLAY_ORDER, LOOKUP_VALUE_CODE`;

      const result = await this.executeQuery(query, [lookupId, tenantId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch lookup values: ${error.message}`);
    }
  }

  static async findById(lookupId, valueId, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      const belongsToTenant = await this.verifyLookupBelongsToTenant(lookupId, tenantId);
      if (!belongsToTenant) {
        const notFoundError = new Error('Lookup not found or does not belong to tenant');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const query = `SELECT 
        LOOKUP_VALUE_ID,
        LOOKUP_ID,
        LOOKUP_VALUE_CODE,
        LOOKUP_VALUE_NAME,
        DISPLAY_ORDER,
        STATUS,
        TENANT_ID,
        CREATED_BY,
        CREATED_DATE
      FROM ${this.TABLE_NAME}
      WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2 AND TENANT_ID = :3`;

      const result = await this.executeQuery(query, [valueId, lookupId, tenantId]);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch lookup value: ${error.message}`);
    }
  }

  static async getNextDisplayOrder(lookupId, tenantId, connection) {
    try {
      const query = `SELECT NVL(MAX(DISPLAY_ORDER), 0) + 1 AS next_order
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND TENANT_ID = :2`;

      const result = await connection.execute(query, [lookupId, tenantId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      const nextOrder = row ? (row.NEXT_ORDER !== undefined ? row.NEXT_ORDER : (row.next_order !== undefined ? row.next_order : 1)) : 1;
      return nextOrder;
    } catch (error) {
      console.error('Error in getNextDisplayOrder:', error);
      throw new Error(`Failed to get next display order: ${error.message}`);
    }
  }

  static async codeExists(lookupId, lookupValueCode, tenantId, excludeValueId = null, connection = null) {
    try {
      let query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND UPPER(LOOKUP_VALUE_CODE) = UPPER(:2) AND TENANT_ID = :3`;
      const bindParams = [lookupId, lookupValueCode, tenantId];
      if (excludeValueId) {
        query += ` AND LOOKUP_VALUE_ID != :4`;
        bindParams.push(excludeValueId);
      }

      let result;
      if (connection) {
        result = await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        result = await this.executeQuery(query, bindParams);
      }

      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      if (!row) return false;
      const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in codeExists:', error);
      throw new Error(`Failed to check lookup value code: ${error.message}`);
    }
  }

  static async displayOrderExists(lookupId, displayOrder, tenantId, excludeValueId = null, connection = null) {
    try {
      let query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_ID = :1 AND DISPLAY_ORDER = :2 AND TENANT_ID = :3`;
      const bindParams = [lookupId, displayOrder, tenantId];
      if (excludeValueId) {
        query += ` AND LOOKUP_VALUE_ID != :4`;
        bindParams.push(excludeValueId);
      }

      let result;
      if (connection) {
        result = await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        result = await this.executeQuery(query, bindParams);
      }

      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      if (!row) return false;
      const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in displayOrderExists:', error);
      throw new Error(`Failed to check display order: ${error.message}`);
    }
  }

  static async create(lookupId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const belongsToTenant = await this.verifyLookupBelongsToTenant(lookupId, tenantId, connection);
        if (!belongsToTenant) {
          const notFoundError = new Error('Lookup not found or does not belong to tenant');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const codeExists = await this.codeExists(lookupId, data.LOOKUP_VALUE_CODE, tenantId, null, connection);
        if (codeExists) {
          const conflictError = new Error(`Lookup value code '${data.LOOKUP_VALUE_CODE}' already exists for this lookup`);
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        let displayOrder = data.DISPLAY_ORDER;
        if (displayOrder === undefined || displayOrder === null) {
          displayOrder = await this.getNextDisplayOrder(lookupId, tenantId, connection);
        } else {
          const orderExists = await this.displayOrderExists(lookupId, displayOrder, tenantId, null, connection);
          if (orderExists) {
            const conflictError = new Error(`Display order ${displayOrder} already exists for this lookup`);
            conflictError.code = 'CONFLICT';
            conflictError.statusCode = 409;
            throw conflictError;
          }
        }

        const status = data.STATUS || 'ACTIVE';

        let valueId;
        try {
          const seqQuery = `SELECT ABS.ABS_LOOKUP_VALUES_SEQ.NEXTVAL AS next_id FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const seqRow = seqResult.rows && seqResult.rows.length > 0 ? seqResult.rows[0] : null;
          valueId = seqRow ? (seqRow.NEXT_ID !== undefined ? seqRow.NEXT_ID : seqRow.next_id) : null;
          if (!valueId) {
            throw new Error('Failed to get next sequence value');
          }
        } catch (seqError) {
          const maxQuery = `SELECT NVL(MAX(LOOKUP_VALUE_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
          valueId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
        }

        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          LOOKUP_VALUE_ID,
          LOOKUP_ID,
          LOOKUP_VALUE_CODE,
          LOOKUP_VALUE_NAME,
          DISPLAY_ORDER,
          STATUS,
          TENANT_ID,
          CREATED_BY,
          CREATED_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9
        )`;

        const now = new Date();
        try {
          await connection.execute(insertQuery, [
            valueId,
            lookupId,
            data.LOOKUP_VALUE_CODE.toUpperCase(),
            data.LOOKUP_VALUE_NAME,
            displayOrder,
            status,
            tenantId,
            userId || 'SYSTEM',
            now
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        } catch (insertError) {
          if (insertError.errorNum === 1 || insertError.message?.includes('ORA-00001') ||
              insertError.message?.includes('unique constraint')) {
            const maxQuery = `SELECT NVL(MAX(LOOKUP_VALUE_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
            valueId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
            await connection.execute(insertQuery, [
              valueId,
              lookupId,
              data.LOOKUP_VALUE_CODE.toUpperCase(),
              data.LOOKUP_VALUE_NAME,
              displayOrder,
              status,
              tenantId,
              userId || 'SYSTEM',
              now
            ], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
          } else {
            throw insertError;
          }
        }

        const selectQuery = `SELECT 
          LOOKUP_VALUE_ID,
          LOOKUP_ID,
          LOOKUP_VALUE_CODE,
          LOOKUP_VALUE_NAME,
          DISPLAY_ORDER,
          STATUS,
          TENANT_ID,
          CREATED_BY,
          CREATED_DATE
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_VALUE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [valueId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error(`Failed to create lookup value: ${error.message}`);
    }
  }

  static async update(lookupId, valueId, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const belongsToTenant = await this.verifyLookupBelongsToTenant(lookupId, tenantId, connection);
        if (!belongsToTenant) {
          const notFoundError = new Error('Lookup not found or does not belong to tenant');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const existing = await this.findById(lookupId, valueId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.LOOKUP_VALUE_NAME !== undefined) {
          if (!data.LOOKUP_VALUE_NAME || data.LOOKUP_VALUE_NAME.trim() === '') {
            const validationError = new Error('LOOKUP_VALUE_NAME cannot be empty');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`LOOKUP_VALUE_NAME = :${paramIndex}`);
          bindParams.push(data.LOOKUP_VALUE_NAME);
          paramIndex++;
        }

        if (data.DISPLAY_ORDER !== undefined) {
          if (data.DISPLAY_ORDER === null || isNaN(data.DISPLAY_ORDER) || data.DISPLAY_ORDER < 1) {
            const validationError = new Error('DISPLAY_ORDER must be a valid positive number');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          const orderExists = await this.displayOrderExists(lookupId, data.DISPLAY_ORDER, tenantId, valueId, connection);
          if (orderExists) {
            const conflictError = new Error(`Display order ${data.DISPLAY_ORDER} already exists for this lookup`);
            conflictError.code = 'CONFLICT';
            conflictError.statusCode = 409;
            throw conflictError;
          }
          updateFields.push(`DISPLAY_ORDER = :${paramIndex}`);
          bindParams.push(data.DISPLAY_ORDER);
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

        bindParams.push(valueId);
        bindParams.push(lookupId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE LOOKUP_VALUE_ID = :${paramIndex} AND LOOKUP_ID = :${paramIndex + 1} AND TENANT_ID = :${paramIndex + 2}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const selectQuery = `SELECT 
          LOOKUP_VALUE_ID,
          LOOKUP_ID,
          LOOKUP_VALUE_CODE,
          LOOKUP_VALUE_NAME,
          DISPLAY_ORDER,
          STATUS,
          TENANT_ID,
          CREATED_BY,
          CREATED_DATE
        FROM ${this.TABLE_NAME}
        WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2 AND TENANT_ID = :3`;
        const selectResult = await connection.execute(selectQuery, [valueId, lookupId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR' || error.code === 'CONFLICT') {
        throw error;
      }
      throw new Error(`Failed to update lookup value: ${error.message}`);
    }
  }

  static async delete(lookupId, valueId, tenantId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        const belongsToTenant = await this.verifyLookupBelongsToTenant(lookupId, tenantId, connection);
        if (!belongsToTenant) {
          const notFoundError = new Error('Lookup not found or does not belong to tenant');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const existing = await this.findById(lookupId, valueId, tenantId);
        if (!existing) {
          const notFoundError = new Error('Lookup value not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const deleteQuery = `DELETE FROM ${this.TABLE_NAME} 
          WHERE LOOKUP_VALUE_ID = :1 AND LOOKUP_ID = :2 AND TENANT_ID = :3`;

        const deleteResult = await connection.execute(deleteQuery, [valueId, lookupId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          const notFoundError = new Error('Lookup value not found');
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
      throw new Error(`Failed to delete lookup value: ${error.message}`);
    }
  }
}

export default AbsLookupValueModel;
