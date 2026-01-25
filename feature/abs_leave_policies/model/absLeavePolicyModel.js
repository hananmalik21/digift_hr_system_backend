import db from '../../../config/db.js';
import oracledb from 'oracledb';

/**
 * ABS Leave Policy Model
 * Handles all database operations for ABS.ABS_LEAVE_POLICIES table
 */
class AbsLeavePolicyModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_POLICIES';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * @param {*} obj - Object or array to convert
   * @returns {*} Converted object or array
   */
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
      } else if (Buffer.isBuffer(value)) {
        // Convert Buffer (RAW) to hex string for GUID fields
        if (key.toLowerCase() === 'policy_guid' || key === 'POLICY_GUID') {
          converted[newKey] = value.toString('hex').toUpperCase();
        } else {
          converted[newKey] = value;
        }
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
   * Verify accrual_method_code exists in ABS_ACCRUAL_METHODS table
   * @param {string} accrualMethodCode - Accrual method code
   * @param {number} tenantId - Tenant ID (not used for this table, but kept for consistency)
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<boolean>} True if exists
   */
  static async verifyAccrualMethodCode(accrualMethodCode, tenantId, connection = null) {
    try {
      if (!accrualMethodCode) return true; // Optional field, skip validation if not provided

      // Check if the method code exists in ABS_ACCRUAL_METHODS table
      const query = `SELECT COUNT(*) AS count FROM ABS.ABS_ACCRUAL_METHODS 
        WHERE UPPER(METHOD_CODE) = UPPER(:1)`;
      
      let result;
      if (connection) {
        result = await connection.execute(query, [accrualMethodCode], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        result = await this.executeQuery(query, [accrualMethodCode]);
      }

      // Handle both uppercase (from connection.execute) and lowercase (from executeQuery)
      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      if (!row) return false;
      const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in verifyAccrualMethodCode:', error);
      return false;
    }
  }

  /**
   * Get all leave policies for a tenant with optional filters
   * @param {number} tenantId - Tenant ID (required)
   * @param {Object} filters - Optional filters (status, accrual_method_code, kuwait_labor_compliant)
   * @returns {Promise<Array>} Array of leave policies
   */
  static async findAll(tenantId, filters = {}) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      let query = `SELECT 
        POLICY_ID,
        RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
        TENANT_ID,
        LEAVE_TYPE_ID,
        LEAVE_TYPE_EN,
        LEAVE_TYPE_AR,
        ENTITLEMENT_DAYS,
        ACCRUAL_METHOD_CODE,
        STATUS,
        KUWAIT_LABOR_COMPLIANT,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :1`;

      const bindParams = [tenantId];
      let paramIndex = 2;

      // Apply filters
      if (filters.status) {
        query += ` AND STATUS = :${paramIndex}`;
        bindParams.push(filters.status.toUpperCase());
        paramIndex++;
      }

      if (filters.accrual_method_code) {
        query += ` AND UPPER(ACCRUAL_METHOD_CODE) = UPPER(:${paramIndex})`;
        bindParams.push(filters.accrual_method_code);
        paramIndex++;
      }

      if (filters.kuwait_labor_compliant !== undefined && filters.kuwait_labor_compliant !== null) {
        query += ` AND KUWAIT_LABOR_COMPLIANT = :${paramIndex}`;
        bindParams.push(filters.kuwait_labor_compliant.toUpperCase());
        paramIndex++;
      }

      query += ` ORDER BY LEAVE_TYPE_EN`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch leave policies: ${error.message}`);
    }
  }

  /**
   * Check if a string is a hex GUID (32 hex characters)
   * @param {string} str - String to check
   * @returns {boolean} True if valid hex GUID
   */
  static isHexGuid(str) {
    return typeof str === 'string' && /^[0-9A-F]{32}$/i.test(str);
  }

  /**
   * Get a single leave policy by ID or GUID and tenant
   * @param {number|string} identifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for multi-tenant security)
   * @returns {Promise<Object|null>} Leave policy object or null
   */
  static async findById(identifier, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      let query;
      let bindParams;

      // Check if identifier is a hex GUID (32 hex characters) or numeric ID
      if (this.isHexGuid(identifier)) {
        // Lookup by POLICY_GUID (hex string)
        query = `SELECT 
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          ENTITLEMENT_DAYS,
          ACCRUAL_METHOD_CODE,
          STATUS,
          KUWAIT_LABOR_COMPLIANT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE POLICY_GUID = HEXTORAW(:1) AND TENANT_ID = :2`;
        bindParams = [identifier.toUpperCase(), tenantId];
      } else {
        // Lookup by POLICY_ID (numeric)
        const policyId = parseInt(identifier);
        if (isNaN(policyId) || policyId <= 0) {
          const validationError = new Error('Invalid policy_id format (must be numeric or 32-character hex GUID)');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        query = `SELECT 
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          ENTITLEMENT_DAYS,
          ACCRUAL_METHOD_CODE,
          STATUS,
          KUWAIT_LABOR_COMPLIANT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE POLICY_ID = :1 AND TENANT_ID = :2`;
        bindParams = [policyId, tenantId];
      }

      const result = await this.executeQuery(query, bindParams);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch leave policy: ${error.message}`);
    }
  }

  /**
   * Generate a GUID for POLICY_GUID
   * @returns {string} GUID string (32 hex characters)
   */
  static generateGuid() {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16).toUpperCase();
    });
  }

  /**
   * Create a new leave policy
   * @param {Object} data - Leave policy data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created leave policy
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Validate tenant_id
        if (!data.TENANT_ID) {
          const validationError = new Error('TENANT_ID is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Validate accrual_method_code if provided
        if (data.ACCRUAL_METHOD_CODE) {
          const isValid = await this.verifyAccrualMethodCode(data.ACCRUAL_METHOD_CODE, data.TENANT_ID, connection);
          if (!isValid) {
            const validationError = new Error(`Accrual method code '${data.ACCRUAL_METHOD_CODE}' does not exist in ACCRUAL_METHOD lookup`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
        }

        // Get next sequence value for POLICY_ID (with fallback to MAX+1)
        let policyId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_POLICIES_SEQ.NEXTVAL AS next_id FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const seqRow = seqResult.rows && seqResult.rows.length > 0 ? seqResult.rows[0] : null;
          policyId = seqRow ? (seqRow.NEXT_ID !== undefined ? seqRow.NEXT_ID : seqRow.next_id) : null;
          if (!policyId) {
            throw new Error('Failed to get next sequence value');
          }
        } catch (seqError) {
          // If sequence doesn't exist or fails, use MAX+1 as fallback
          const maxQuery = `SELECT NVL(MAX(POLICY_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
          policyId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
        }

        // Generate GUID for POLICY_GUID
        const policyGuid = this.generateGuid();

        // Set defaults
        const accrualMethodCode = data.ACCRUAL_METHOD_CODE || 'NONE';
        const status = data.STATUS || 'ACTIVE';
        const kuwaitLaborCompliant = data.KUWAIT_LABOR_COMPLIANT || null;

        // Insert new leave policy (POLICY_GUID is RAW(16), use HEXTORAW)
        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          POLICY_ID,
          POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          ENTITLEMENT_DAYS,
          ACCRUAL_METHOD_CODE,
          STATUS,
          KUWAIT_LABOR_COMPLIANT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, HEXTORAW(:2), :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14
        )`;

        const now = new Date();
        try {
          await connection.execute(insertQuery, [
            policyId,
            policyGuid,
            data.TENANT_ID,
            data.LEAVE_TYPE_ID || null,
            data.LEAVE_TYPE_EN,
            data.LEAVE_TYPE_AR || null,
            data.ENTITLEMENT_DAYS,
            accrualMethodCode,
            status,
            kuwaitLaborCompliant,
            userId || 'SYSTEM',
            now,
            userId || 'SYSTEM',
            now
          ], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        } catch (insertError) {
          // If unique constraint violation (sequence out of sync), use MAX+1 and retry
          if (insertError.errorNum === 1 || insertError.message?.includes('ORA-00001') || 
              insertError.message?.includes('unique constraint')) {
            const maxQuery = `SELECT NVL(MAX(POLICY_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
            policyId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
            
            // Retry insert with new policyId (POLICY_GUID is RAW(16), use HEXTORAW)
            await connection.execute(insertQuery, [
              policyId,
              policyGuid,
              data.TENANT_ID,
              data.LEAVE_TYPE_ID || null,
              data.LEAVE_TYPE_EN,
              data.LEAVE_TYPE_AR || null,
              data.ENTITLEMENT_DAYS,
              accrualMethodCode,
              status,
              kuwaitLaborCompliant,
              userId || 'SYSTEM',
              now,
              userId || 'SYSTEM',
              now
            ], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
          } else {
            // Re-throw other errors
            throw insertError;
          }
        }

        // Fetch and return the created record using same connection
        const selectQuery = `SELECT 
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          ENTITLEMENT_DAYS,
          ACCRUAL_METHOD_CODE,
          STATUS,
          KUWAIT_LABOR_COMPLIANT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE POLICY_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [policyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      // Handle unique constraint violation (TENANT_ID + LEAVE_TYPE_EN)
      if (error.errorNum === 1 || error.message?.includes('ORA-00001') || 
          error.message?.includes('unique constraint')) {
        if (error.message?.includes('UK_ABS_LEAVE_POL_BY_NAME') || 
            error.message?.includes('TENANT_ID, LEAVE_TYPE_EN')) {
          const conflictError = new Error(
            `A leave policy with leave_type_en '${data.LEAVE_TYPE_EN}' already exists for this tenant`
          );
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }
      }
      throw new Error(`Failed to create leave policy: ${error.message}`);
    }
  }

  /**
   * Update leave policy
   * @param {number|string} identifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for multi-tenant security)
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated leave policy
   */
  static async update(identifier, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Verify policy exists and belongs to tenant (supports both ID and GUID)
        const existing = await this.findById(identifier, tenantId);
        if (!existing) {
          const notFoundError = new Error('Leave policy not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual POLICY_ID from the existing record (for WHERE clause)
        const policyId = existing.policy_id || existing.POLICY_ID;

        // Validate accrual_method_code if provided
        if (data.ACCRUAL_METHOD_CODE !== undefined && data.ACCRUAL_METHOD_CODE !== null) {
          const isValid = await this.verifyAccrualMethodCode(data.ACCRUAL_METHOD_CODE, tenantId, connection);
          if (!isValid) {
            const validationError = new Error(`Accrual method code '${data.ACCRUAL_METHOD_CODE}' does not exist in ACCRUAL_METHOD lookup`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.LEAVE_TYPE_ID !== undefined) {
          updateFields.push(`LEAVE_TYPE_ID = :${paramIndex}`);
          bindParams.push(data.LEAVE_TYPE_ID !== null ? data.LEAVE_TYPE_ID : null);
          paramIndex++;
        }

        if (data.LEAVE_TYPE_EN !== undefined) {
          if (!data.LEAVE_TYPE_EN || data.LEAVE_TYPE_EN.trim() === '') {
            const validationError = new Error('LEAVE_TYPE_EN cannot be empty');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`LEAVE_TYPE_EN = :${paramIndex}`);
          bindParams.push(data.LEAVE_TYPE_EN);
          paramIndex++;
        }

        if (data.LEAVE_TYPE_AR !== undefined) {
          updateFields.push(`LEAVE_TYPE_AR = :${paramIndex}`);
          bindParams.push(data.LEAVE_TYPE_AR !== null ? data.LEAVE_TYPE_AR : null);
          paramIndex++;
        }

        if (data.ENTITLEMENT_DAYS !== undefined) {
          if (data.ENTITLEMENT_DAYS === null || isNaN(data.ENTITLEMENT_DAYS) || data.ENTITLEMENT_DAYS < 0) {
            const validationError = new Error('ENTITLEMENT_DAYS must be a valid number >= 0');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`ENTITLEMENT_DAYS = :${paramIndex}`);
          bindParams.push(data.ENTITLEMENT_DAYS);
          paramIndex++;
        }

        if (data.ACCRUAL_METHOD_CODE !== undefined) {
          updateFields.push(`ACCRUAL_METHOD_CODE = :${paramIndex}`);
          bindParams.push(data.ACCRUAL_METHOD_CODE !== null ? data.ACCRUAL_METHOD_CODE : 'NONE');
          paramIndex++;
        }

        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }

        if (data.KUWAIT_LABOR_COMPLIANT !== undefined) {
          updateFields.push(`KUWAIT_LABOR_COMPLIANT = :${paramIndex}`);
          bindParams.push(data.KUWAIT_LABOR_COMPLIANT !== null ? data.KUWAIT_LABOR_COMPLIANT.toUpperCase() : null);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(policyId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE POLICY_ID = :${paramIndex - 1} AND TENANT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record using same connection
        const selectQuery = `SELECT 
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          ENTITLEMENT_DAYS,
          ACCRUAL_METHOD_CODE,
          STATUS,
          KUWAIT_LABOR_COMPLIANT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE POLICY_ID = :1 AND TENANT_ID = :2`;
        const selectResult = await connection.execute(selectQuery, [policyId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const notFoundError = new Error('Leave policy not found');
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
      throw new Error(`Failed to update leave policy: ${error.message}`);
    }
  }

  /**
   * Check if policy has child records (for deletion validation)
   * Note: This is a placeholder - you'll need to identify actual child tables
   * @param {number} policyId - Policy ID
   * @param {number} tenantId - Tenant ID
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<number>} Count of child records
   */
  static async getChildRecordCount(policyId, tenantId, connection = null) {
    try {
      // TODO: Replace with actual child table checks
      // Example: Check ABS_EMPLOYEE_LEAVE_POLICIES or similar tables
      // For now, return 0 to allow deletion
      // You should add actual child table checks here
      
      // Example structure (uncomment and modify as needed):
      // const childQuery = `SELECT COUNT(*) AS count 
      //   FROM ABS.CHILD_TABLE_NAME
      //   WHERE POLICY_ID = :1 AND TENANT_ID = :2`;
      // 
      // let result;
      // if (connection) {
      //   result = await connection.execute(childQuery, [policyId, tenantId], {
      //     outFormat: oracledb.OUT_FORMAT_OBJECT
      //   });
      // } else {
      //   result = await this.executeQuery(childQuery, [policyId, tenantId]);
      // }
      // 
      // const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      // if (!row) return 0;
      // const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      // return count;

      return 0; // Placeholder - no child records for now
    } catch (error) {
      console.error('Error in getChildRecordCount:', error);
      return 0; // Return 0 on error to be safe
    }
  }

  /**
   * Delete a leave policy (only if no child records exist)
   * @param {number|string} identifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for multi-tenant security)
   * @returns {Promise<boolean>} Success status
   */
  static async delete(identifier, tenantId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Verify policy exists and belongs to tenant (supports both ID and GUID)
        const existing = await this.findById(identifier, tenantId);
        if (!existing) {
          const notFoundError = new Error('Leave policy not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual POLICY_ID from the existing record (for WHERE clause)
        const policyId = existing.policy_id || existing.POLICY_ID;

        // Check for child records
        const childCount = await this.getChildRecordCount(policyId, tenantId, connection);
        if (childCount > 0) {
          const validationError = new Error(
            `Cannot delete leave policy: ${childCount} child record(s) exist. Please delete child records first.`
          );
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          validationError.childCount = childCount;
          throw validationError;
        }

        // Delete the leave policy
        const deleteQuery = `DELETE FROM ${this.TABLE_NAME} 
          WHERE POLICY_ID = :1 AND TENANT_ID = :2`;

        const deleteResult = await connection.execute(deleteQuery, [policyId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          const notFoundError = new Error('Leave policy not found');
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
      throw new Error(`Failed to delete leave policy: ${error.message}`);
    }
  }
}

export default AbsLeavePolicyModel;
