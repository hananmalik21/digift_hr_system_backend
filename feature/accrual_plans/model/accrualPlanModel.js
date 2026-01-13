import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';

/**
 * Accrual Plan Model
 * Handles all database operations for ABS.ABS_ACCRUAL_PLANS table
 */
class AccrualPlanModel {
  static TABLE_NAME = 'ABS.ABS_ACCRUAL_PLANS';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * @param {*} obj - Object or array to convert
   * @returns {*} Converted object or array
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) {
      // Convert Buffer (Oracle RAW/GUID types) to hex string
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
        // Convert Buffer (Oracle RAW/GUID types) to hex string
        converted[newKey] = value.toString('hex').toUpperCase();
      } else if (typeof value === 'object') {
        converted[newKey] = this.convertKeysToSnakeCase(value);
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  /**
   * Helper method to execute queries with proper connection handling
   */
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    
    // Convert keys to lowercase snake_case
    if (result.rows) {
      result.rows = this.convertKeysToSnakeCase(result.rows);
    }
    
    return result;
  }

  /**
   * Helper method to execute queries with transaction support
   */
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
   * Normalize hex32 GUID string (uppercase, strip hyphens, trim)
   * @param {string} v - Hex string (may contain hyphens, lowercase, spaces)
   * @returns {string} Normalized hex32 string (uppercase, no hyphens)
   */
  static normalizeHex32(v) {
    if (v === null || v === undefined) return '';
    if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
    return String(v).trim().replace(/-/g, '').toUpperCase();
  }

  /**
   * Validate and ensure hex32 format
   * @param {string} v - Hex string to validate
   * @param {string} fieldName - Field name for error message
   * @returns {string} Normalized hex32 string
   * @throws {Error} If not valid hex32 format
   */
  static ensureHex32(v, fieldName = 'guid') {
    const hex = this.normalizeHex32(v);
    if (!/^[0-9A-F]{32}$/.test(hex)) {
      throw new Error(`${fieldName} must be a 32-character hex GUID`);
    }
    return hex;
  }

  /**
   * Convert hex32 string to Buffer for Oracle RAW(16) binding
   * @param {string} v - Hex32 string
   * @returns {Buffer|null} Buffer or null
   */
  static hexToRawBuffer(v) {
    if (v === null || v === undefined || v === '') return null;

    if (Buffer.isBuffer(v)) {
      if (v.length === 16) return v;
      return this.hexToRawBuffer(v.toString('hex'));
    }

    const hex = this.normalizeHex32(v);
    if (!/^[0-9A-F]+$/.test(hex)) return String(v);

    let h = hex;
    if (h.length < 32) h = h.padStart(32, '0');
    if (h.length > 32) h = h.slice(0, 32);

    return Buffer.from(h, 'hex');
  }

  /**
   * Get all accrual plans with optional filters and pagination
   * @param {Object} filters - Optional filters (status, search, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object>} Object with {accrualPlans, total} if paginated
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} a`;
      let dataQuery = `SELECT 
        a.ACCRUAL_PLAN_ID,
        RAWTOHEX(a.ACCRUAL_PLAN_GUID) AS ACCRUAL_PLAN_GUID,
        a.TENANT_ID,
        a.PLAN_CODE,
        a.PLAN_NAME_EN,
        a.PLAN_NAME_AR,
        a.ACCRUAL_METHOD,
        a.ACCRUAL_RATE_DAYS,
        a.MAX_BALANCE_DAYS,
        a.ALLOW_CARRY_FORWARD,
        a.MAX_CARRY_FORWARD,
        a.ALLOW_NEGATIVE,
        a.NEGATIVE_LIMIT_DAYS,
        a.STATUS,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // Filter by STATUS
      if (filters.status) {
        conditions.push(`a.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      // Search by PLAN_CODE, PLAN_NAME_EN, or PLAN_NAME_AR
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(a.PLAN_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(a.PLAN_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(a.PLAN_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 3;
      }

      // Apply WHERE clause if conditions exist
      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(' AND ')}`;
        countQuery += whereClause;
        dataQuery += whereClause;
      }

      // Handle pagination
      const pagination = filters.pagination || {};
      const page = pagination.page || 1;
      const pageSize = pagination.pageSize || 10;
      const offset = (page - 1) * pageSize;

      // Execute count query
      const countResult = await this.executeQuery(countQuery, bindParams);
      const total = countResult.rows[0]?.total || 0;

      // Add ORDER BY and pagination
      dataQuery += ` ORDER BY a.PLAN_CODE`;
      dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
      bindParams.push(offset);
      bindParams.push(pageSize);

      // Execute data query
      const dataResult = await this.executeQuery(dataQuery, bindParams);

      return {
        accrualPlans: dataResult.rows || [],
        total: total
      };
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to fetch accrual plans',
        error
      );
    }
  }

  /**
   * Get a single accrual plan by GUID
   * @param {string} guidHex32 - Accrual Plan GUID (32-hex string)
   * @returns {Promise<Object|null>} Accrual plan object or null
   */
  static async findByGuid(guidHex32) {
    try {
      const hexGuid = this.ensureHex32(guidHex32, 'guid');
      const guidBuffer = this.hexToRawBuffer(hexGuid);

      const query = `SELECT 
        a.ACCRUAL_PLAN_ID,
        RAWTOHEX(a.ACCRUAL_PLAN_GUID) AS ACCRUAL_PLAN_GUID,
        a.TENANT_ID,
        a.PLAN_CODE,
        a.PLAN_NAME_EN,
        a.PLAN_NAME_AR,
        a.ACCRUAL_METHOD,
        a.ACCRUAL_RATE_DAYS,
        a.MAX_BALANCE_DAYS,
        a.ALLOW_CARRY_FORWARD,
        a.MAX_CARRY_FORWARD,
        a.ALLOW_NEGATIVE,
        a.NEGATIVE_LIMIT_DAYS,
        a.STATUS,
        a.CREATION_DATE,
        a.CREATED_BY,
        a.LAST_UPDATE_DATE,
        a.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} a
      WHERE a.ACCRUAL_PLAN_GUID = :1`;

      const result = await this.executeQuery(query, [guidBuffer]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to fetch accrual plan',
        error
      );
    }
  }

  /**
   * Create a new accrual plan
   * @param {Object} data - Accrual plan data
   * @param {string} userId - User ID for audit fields (if needed)
   * @returns {Promise<Object>} Created accrual plan
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next ACCRUAL_PLAN_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let accrualPlanId;
        try {
          const seqQuery = `SELECT ABS.ABS_ACCRUAL_PLANS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          accrualPlanId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(ACCRUAL_PLAN_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          accrualPlanId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();

        const query = `INSERT INTO ${this.TABLE_NAME} (
          ACCRUAL_PLAN_ID,
          TENANT_ID,
          PLAN_CODE,
          PLAN_NAME_EN,
          PLAN_NAME_AR,
          ACCRUAL_METHOD,
          ACCRUAL_RATE_DAYS,
          MAX_BALANCE_DAYS,
          ALLOW_CARRY_FORWARD,
          MAX_CARRY_FORWARD,
          ALLOW_NEGATIVE,
          NEGATIVE_LIMIT_DAYS,
          STATUS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17
        )`;

        const bindParams = [
          accrualPlanId,
          data.TENANT_ID !== undefined && data.TENANT_ID !== null ? parseInt(data.TENANT_ID) : null,
          data.PLAN_CODE || null,
          data.PLAN_NAME_EN || null,
          data.PLAN_NAME_AR || null,
          data.ACCRUAL_METHOD || null,
          data.ACCRUAL_RATE_DAYS !== undefined && data.ACCRUAL_RATE_DAYS !== null ? parseFloat(data.ACCRUAL_RATE_DAYS) : null,
          data.MAX_BALANCE_DAYS !== undefined && data.MAX_BALANCE_DAYS !== null ? parseFloat(data.MAX_BALANCE_DAYS) : null,
          data.ALLOW_CARRY_FORWARD || 'N',
          data.MAX_CARRY_FORWARD !== undefined && data.MAX_CARRY_FORWARD !== null ? parseFloat(data.MAX_CARRY_FORWARD) : null,
          data.ALLOW_NEGATIVE || 'N',
          data.NEGATIVE_LIMIT_DAYS !== undefined && data.NEGATIVE_LIMIT_DAYS !== null ? parseFloat(data.NEGATIVE_LIMIT_DAYS) : null,
          data.STATUS || 'ACTIVE',
          now,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the created record
        const selectQuery = `SELECT 
          a.ACCRUAL_PLAN_ID,
          RAWTOHEX(a.ACCRUAL_PLAN_GUID) AS ACCRUAL_PLAN_GUID,
          a.TENANT_ID,
          a.PLAN_CODE,
          a.PLAN_NAME_EN,
          a.PLAN_NAME_AR,
          a.ACCRUAL_METHOD,
          a.ACCRUAL_RATE_DAYS,
          a.MAX_BALANCE_DAYS,
          a.ALLOW_CARRY_FORWARD,
          a.MAX_CARRY_FORWARD,
          a.ALLOW_NEGATIVE,
          a.NEGATIVE_LIMIT_DAYS,
          a.STATUS,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.ACCRUAL_PLAN_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [accrualPlanId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }

        throw new DatabaseError('Failed to retrieve created accrual plan');
      });
    } catch (error) {
      // Handle unique constraint violations (e.g., duplicate PLAN_CODE)
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Accrual plan with this PLAN_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }

      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to create accrual plan',
        error
      );
    }
  }

  /**
   * Update an accrual plan by GUID
   * @param {string} guidHex32 - Accrual Plan GUID (32-hex string)
   * @param {Object} data - Accrual plan data to update
   * @param {string} userId - User ID for audit fields (if needed)
   * @returns {Promise<Object>} Updated accrual plan
   */
  static async updateByGuid(guidHex32, data, userId) {
    try {
      const hexGuid = this.ensureHex32(guidHex32, 'guid');
      const guidBuffer = this.hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        // Build dynamic UPDATE query
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.TENANT_ID !== undefined) {
          updateFields.push(`TENANT_ID = :${paramIndex}`);
          bindParams.push(data.TENANT_ID !== null ? parseInt(data.TENANT_ID) : null);
          paramIndex++;
        }

        if (data.PLAN_CODE !== undefined) {
          updateFields.push(`PLAN_CODE = :${paramIndex}`);
          bindParams.push(data.PLAN_CODE);
          paramIndex++;
        }

        if (data.PLAN_NAME_EN !== undefined) {
          updateFields.push(`PLAN_NAME_EN = :${paramIndex}`);
          bindParams.push(data.PLAN_NAME_EN);
          paramIndex++;
        }

        if (data.PLAN_NAME_AR !== undefined) {
          updateFields.push(`PLAN_NAME_AR = :${paramIndex}`);
          bindParams.push(data.PLAN_NAME_AR);
          paramIndex++;
        }

        if (data.ACCRUAL_METHOD !== undefined) {
          updateFields.push(`ACCRUAL_METHOD = :${paramIndex}`);
          bindParams.push(data.ACCRUAL_METHOD);
          paramIndex++;
        }

        if (data.ACCRUAL_RATE_DAYS !== undefined) {
          updateFields.push(`ACCRUAL_RATE_DAYS = :${paramIndex}`);
          bindParams.push(data.ACCRUAL_RATE_DAYS !== null ? parseFloat(data.ACCRUAL_RATE_DAYS) : null);
          paramIndex++;
        }

        if (data.MAX_BALANCE_DAYS !== undefined) {
          updateFields.push(`MAX_BALANCE_DAYS = :${paramIndex}`);
          bindParams.push(data.MAX_BALANCE_DAYS !== null ? parseFloat(data.MAX_BALANCE_DAYS) : null);
          paramIndex++;
        }

        if (data.ALLOW_CARRY_FORWARD !== undefined) {
          updateFields.push(`ALLOW_CARRY_FORWARD = :${paramIndex}`);
          bindParams.push(data.ALLOW_CARRY_FORWARD);
          paramIndex++;
        }

        if (data.MAX_CARRY_FORWARD !== undefined) {
          updateFields.push(`MAX_CARRY_FORWARD = :${paramIndex}`);
          bindParams.push(data.MAX_CARRY_FORWARD !== null ? parseFloat(data.MAX_CARRY_FORWARD) : null);
          paramIndex++;
        }

        if (data.ALLOW_NEGATIVE !== undefined) {
          updateFields.push(`ALLOW_NEGATIVE = :${paramIndex}`);
          bindParams.push(data.ALLOW_NEGATIVE);
          paramIndex++;
        }

        if (data.NEGATIVE_LIMIT_DAYS !== undefined) {
          updateFields.push(`NEGATIVE_LIMIT_DAYS = :${paramIndex}`);
          bindParams.push(data.NEGATIVE_LIMIT_DAYS !== null ? parseFloat(data.NEGATIVE_LIMIT_DAYS) : null);
          paramIndex++;
        }

        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        // Check if no fields to update (before adding audit fields)
        if (updateFields.length === 0) {
          // No fields to update, fetch existing record
          const selectQuery = `SELECT 
            a.ACCRUAL_PLAN_ID,
            RAWTOHEX(a.ACCRUAL_PLAN_GUID) AS ACCRUAL_PLAN_GUID,
            a.TENANT_ID,
            a.PLAN_CODE,
            a.PLAN_NAME_EN,
            a.PLAN_NAME_AR,
            a.ACCRUAL_METHOD,
            a.ACCRUAL_RATE_DAYS,
            a.MAX_BALANCE_DAYS,
            a.ALLOW_CARRY_FORWARD,
            a.MAX_CARRY_FORWARD,
            a.ALLOW_NEGATIVE,
            a.NEGATIVE_LIMIT_DAYS,
            a.STATUS,
            a.CREATION_DATE,
            a.CREATED_BY,
            a.LAST_UPDATE_DATE,
            a.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} a
          WHERE a.ACCRUAL_PLAN_GUID = :1`;

          const selectResult = await connection.execute(selectQuery, [guidBuffer], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (selectResult.rows && selectResult.rows.length > 0) {
            return this.convertKeysToSnakeCase(selectResult.rows[0]);
          }
          throw new DatabaseError('Accrual plan not found');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(guidBuffer);
        const updateQuery = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE ACCRUAL_PLAN_GUID = :${paramIndex}`;

        const updateResult = await connection.execute(updateQuery, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (updateResult.rowsAffected === 0) {
          throw new DatabaseError('Accrual plan not found');
        }

        // Fetch and return the updated record
        const selectQuery = `SELECT 
          a.ACCRUAL_PLAN_ID,
          RAWTOHEX(a.ACCRUAL_PLAN_GUID) AS ACCRUAL_PLAN_GUID,
          a.TENANT_ID,
          a.PLAN_CODE,
          a.PLAN_NAME_EN,
          a.PLAN_NAME_AR,
          a.ACCRUAL_METHOD,
          a.ACCRUAL_RATE_DAYS,
          a.MAX_BALANCE_DAYS,
          a.ALLOW_CARRY_FORWARD,
          a.MAX_CARRY_FORWARD,
          a.ALLOW_NEGATIVE,
          a.NEGATIVE_LIMIT_DAYS,
          a.STATUS,
          a.CREATION_DATE,
          a.CREATED_BY,
          a.LAST_UPDATE_DATE,
          a.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} a
        WHERE a.ACCRUAL_PLAN_GUID = :1`;

        const selectResult = await connection.execute(selectQuery, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }

        throw new DatabaseError('Failed to retrieve updated accrual plan');
      });
    } catch (error) {
      // Handle unique constraint violations
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const conflictError = new DatabaseError('Accrual plan with this PLAN_CODE already exists', error);
        conflictError.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        throw conflictError;
      }

      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to update accrual plan',
        error
      );
    }
  }

  /**
   * Delete an accrual plan by GUID (hard delete)
   * @param {string} guidHex32 - Accrual Plan GUID (32-hex string)
   * @returns {Promise<boolean>} True if deleted successfully
   */
  static async deleteByGuid(guidHex32) {
    try {
      const hexGuid = this.ensureHex32(guidHex32, 'guid');
      const guidBuffer = this.hexToRawBuffer(hexGuid);

      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} 
          WHERE ACCRUAL_PLAN_GUID = :1`;

        const result = await connection.execute(query, [guidBuffer], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (result.rowsAffected === 0) {
          throw new DatabaseError('Accrual plan not found');
        }

        return true;
      });
    } catch (error) {
      if (error.message?.includes('must be a 32-character hex GUID')) {
        throw error;
      }
      // Handle foreign key constraint violations
      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const fkError = new DatabaseError(
          'Cannot delete accrual plan: it is referenced by other records (e.g., leave types, employee balances)',
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
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError(
        'Failed to delete accrual plan',
        error
      );
    }
  }
}

export default AccrualPlanModel;
