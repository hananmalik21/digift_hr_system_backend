import db from '../../../config/db.js';
import oracledb from 'oracledb';
import AbsLeavePolicyModel from './absLeavePolicyModel.js';

/**
 * ABS Leave Policy Rules Model
 * Handles all database operations for ABS.ABS_LEAVE_POLICY_RULES table
 */
class AbsLeavePolicyRulesModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_POLICY_RULES';
  static PARENT_TABLE_NAME = 'ABS.ABS_LEAVE_POLICIES';

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
        if (key.toLowerCase() === 'rule_guid' || key === 'RULE_GUID') {
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
   * Verify policy exists and belongs to tenant (for tenant isolation)
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<boolean>} True if policy exists and belongs to tenant
   */
  static async verifyPolicyBelongsToTenant(policyIdentifier, tenantId, connection = null) {
    try {
      const policy = await AbsLeavePolicyModel.findById(policyIdentifier, tenantId);
      return policy !== null;
    } catch (error) {
      console.error('Error in verifyPolicyBelongsToTenant:', error);
      return false;
    }
  }

  /**
   * Check if rules record already exists for a policy
   * @param {number} policyId - Policy ID
   * @param {number} tenantId - Tenant ID
   * @param {number} excludeRuleId - Optional rule ID to exclude from check (for updates)
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<boolean>} True if exists
   */
  static async rulesExists(policyId, tenantId, excludeRuleId = null, connection = null) {
    try {
      let query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE POLICY_ID = :1 AND TENANT_ID = :2`;
      
      const bindParams = [policyId, tenantId];
      
      if (excludeRuleId) {
        query += ` AND RULE_ID != :3`;
        bindParams.push(excludeRuleId);
      }

      let result;
      if (connection) {
        result = await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        result = await this.executeQuery(query, bindParams);
      }

      // Handle both uppercase (from connection.execute) and lowercase (from executeQuery)
      const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
      if (!row) return false;
      const count = row.COUNT !== undefined ? row.COUNT : (row.count !== undefined ? row.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in rulesExists:', error);
      return false;
    }
  }

  /**
   * Get leave policy rules for a policy
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<Array>} Array of rules (should be 0 or 1 record)
   */
  static async findAll(policyIdentifier, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      // Verify policy belongs to tenant
      const policyBelongsToTenant = await this.verifyPolicyBelongsToTenant(policyIdentifier, tenantId);
      if (!policyBelongsToTenant) {
        const notFoundError = new Error('Leave policy not found or does not belong to tenant');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      // Get the actual POLICY_ID from the policy
      const policy = await AbsLeavePolicyModel.findById(policyIdentifier, tenantId);
      if (!policy) {
        const notFoundError = new Error('Leave policy not found');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const policyId = policy.policy_id || policy.POLICY_ID;

      const query = `SELECT 
        RULE_ID,
        RAWTOHEX(RULE_GUID) AS RULE_GUID,
        TENANT_ID,
        POLICY_ID,
        MIN_NOTICE_DAYS,
        MAX_CONSECUTIVE_DAYS,
        REQUIRES_DOCUMENT,
        ALLOW_CARRY_FORWARD,
        ALLOW_ENCASHMENT,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME}
      WHERE POLICY_ID = :1 AND TENANT_ID = :2`;

      const result = await this.executeQuery(query, [policyId, tenantId]);
      return result.rows || [];
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch leave policy rules: ${error.message}`);
    }
  }

  /**
   * Get a single rule by ID or GUID
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number|string} ruleIdentifier - Rule ID (number) or Rule GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<Object|null>} Rule object or null
   */
  static async findById(policyIdentifier, ruleIdentifier, tenantId) {
    try {
      if (!tenantId) {
        const validationError = new Error('tenant_id is required');
        validationError.code = 'VALIDATION_ERROR';
        validationError.statusCode = 400;
        throw validationError;
      }

      // Verify policy belongs to tenant
      const policyBelongsToTenant = await this.verifyPolicyBelongsToTenant(policyIdentifier, tenantId);
      if (!policyBelongsToTenant) {
        const notFoundError = new Error('Leave policy not found or does not belong to tenant');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      // Get the actual POLICY_ID from the policy
      const policy = await AbsLeavePolicyModel.findById(policyIdentifier, tenantId);
      if (!policy) {
        const notFoundError = new Error('Leave policy not found');
        notFoundError.code = 'NOT_FOUND';
        notFoundError.statusCode = 404;
        throw notFoundError;
      }

      const policyId = policy.policy_id || policy.POLICY_ID;

      let query;
      let bindParams;

      // Check if ruleIdentifier is a hex GUID (32 hex characters) or numeric ID
      if (this.isHexGuid(ruleIdentifier)) {
        // Lookup by RULE_GUID (hex string)
        query = `SELECT 
          RULE_ID,
          RAWTOHEX(RULE_GUID) AS RULE_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          ALLOW_CARRY_FORWARD,
          ALLOW_ENCASHMENT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE RULE_GUID = HEXTORAW(:1) AND POLICY_ID = :2 AND TENANT_ID = :3`;
        bindParams = [ruleIdentifier.toUpperCase(), policyId, tenantId];
      } else {
        // Lookup by RULE_ID (numeric)
        const ruleId = parseInt(ruleIdentifier);
        if (isNaN(ruleId) || ruleId <= 0) {
          const validationError = new Error('Invalid rule_id format (must be numeric or 32-character hex GUID)');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        query = `SELECT 
          RULE_ID,
          RAWTOHEX(RULE_GUID) AS RULE_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          ALLOW_CARRY_FORWARD,
          ALLOW_ENCASHMENT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE RULE_ID = :1 AND POLICY_ID = :2 AND TENANT_ID = :3`;
        bindParams = [ruleId, policyId, tenantId];
      }

      const result = await this.executeQuery(query, bindParams);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error in findById:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error(`Failed to fetch leave policy rule: ${error.message}`);
    }
  }

  /**
   * Check if a string is a valid hex GUID (32 hex characters)
   * @param {string} str - String to check
   * @returns {boolean} True if valid hex GUID
   */
  static isHexGuid(str) {
    return typeof str === 'string' && /^[0-9A-F]{32}$/i.test(str);
  }

  /**
   * Generate a GUID for RULE_GUID
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
   * Create a new leave policy rule
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @param {Object} data - Rule data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created rule
   */
  static async create(policyIdentifier, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Verify policy belongs to tenant
        const policyBelongsToTenant = await this.verifyPolicyBelongsToTenant(policyIdentifier, tenantId);
        if (!policyBelongsToTenant) {
          const notFoundError = new Error('Leave policy not found or does not belong to tenant');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual POLICY_ID from the policy
        const policy = await AbsLeavePolicyModel.findById(policyIdentifier, tenantId);
        if (!policy) {
          const notFoundError = new Error('Leave policy not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const policyId = policy.policy_id || policy.POLICY_ID;

        // Check if rules record already exists for this policy (only one per policy)
        const exists = await this.rulesExists(policyId, tenantId, null, connection);
        if (exists) {
          const conflictError = new Error('A rules record already exists for this policy. Only one rules record is allowed per policy.');
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        // Get next sequence value for RULE_ID (with fallback to MAX+1)
        let ruleId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_POLICY_RULES_SEQ.NEXTVAL AS next_id FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const seqRow = seqResult.rows && seqResult.rows.length > 0 ? seqResult.rows[0] : null;
          ruleId = seqRow ? (seqRow.NEXT_ID !== undefined ? seqRow.NEXT_ID : seqRow.next_id) : null;
          if (!ruleId) {
            throw new Error('Failed to get next sequence value');
          }
        } catch (seqError) {
          // If sequence doesn't exist or fails, use MAX+1 as fallback
          const maxQuery = `SELECT NVL(MAX(RULE_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
          ruleId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
        }

        // Generate GUID for RULE_GUID
        const ruleGuid = this.generateGuid();

        // Insert new rule
        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          RULE_ID,
          RULE_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          ALLOW_CARRY_FORWARD,
          ALLOW_ENCASHMENT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, HEXTORAW(:2), :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13
        )`;

        const now = new Date();
        try {
          await connection.execute(insertQuery, [
            ruleId,
            ruleGuid,
            tenantId,
            policyId,
            data.MIN_NOTICE_DAYS !== undefined && data.MIN_NOTICE_DAYS !== null ? data.MIN_NOTICE_DAYS : null,
            data.MAX_CONSECUTIVE_DAYS !== undefined && data.MAX_CONSECUTIVE_DAYS !== null ? data.MAX_CONSECUTIVE_DAYS : null,
            data.REQUIRES_DOCUMENT ? data.REQUIRES_DOCUMENT.toUpperCase() : null,
            data.ALLOW_CARRY_FORWARD ? data.ALLOW_CARRY_FORWARD.toUpperCase() : null,
            data.ALLOW_ENCASHMENT ? data.ALLOW_ENCASHMENT.toUpperCase() : null,
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
            const maxQuery = `SELECT NVL(MAX(RULE_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
            ruleId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
            
            // Retry insert with new ruleId
            await connection.execute(insertQuery, [
              ruleId,
              ruleGuid,
              tenantId,
              policyId,
              data.MIN_NOTICE_DAYS !== undefined && data.MIN_NOTICE_DAYS !== null ? data.MIN_NOTICE_DAYS : null,
              data.MAX_CONSECUTIVE_DAYS !== undefined && data.MAX_CONSECUTIVE_DAYS !== null ? data.MAX_CONSECUTIVE_DAYS : null,
              data.REQUIRES_DOCUMENT ? data.REQUIRES_DOCUMENT.toUpperCase() : null,
              data.ALLOW_CARRY_FORWARD ? data.ALLOW_CARRY_FORWARD.toUpperCase() : null,
              data.ALLOW_ENCASHMENT ? data.ALLOW_ENCASHMENT.toUpperCase() : null,
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
          RULE_ID,
          RAWTOHEX(RULE_GUID) AS RULE_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          ALLOW_CARRY_FORWARD,
          ALLOW_ENCASHMENT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE RULE_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [ruleId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error(`Failed to create leave policy rule: ${error.message}`);
    }
  }

  /**
   * Update leave policy rule
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number|string} ruleIdentifier - Rule ID (number) or Rule GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated rule
   */
  static async update(policyIdentifier, ruleIdentifier, tenantId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        if (!tenantId) {
          const validationError = new Error('tenant_id is required');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }

        // Verify policy belongs to tenant
        const policyBelongsToTenant = await this.verifyPolicyBelongsToTenant(policyIdentifier, tenantId);
        if (!policyBelongsToTenant) {
          const notFoundError = new Error('Leave policy not found or does not belong to tenant');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual POLICY_ID from the policy
        const policy = await AbsLeavePolicyModel.findById(policyIdentifier, tenantId);
        if (!policy) {
          const notFoundError = new Error('Leave policy not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const policyId = policy.policy_id || policy.POLICY_ID;

        // Verify rule exists and belongs to policy and tenant
        // This will resolve the ruleIdentifier (GUID or ID) to the actual record
        const existing = await this.findById(policyIdentifier, ruleIdentifier, tenantId);
        if (!existing) {
          const notFoundError = new Error('Leave policy rule not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual numeric RULE_ID from the existing record
        const ruleId = existing.rule_id || existing.RULE_ID;

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.MIN_NOTICE_DAYS !== undefined) {
          if (data.MIN_NOTICE_DAYS !== null && (isNaN(data.MIN_NOTICE_DAYS) || data.MIN_NOTICE_DAYS < 0)) {
            const validationError = new Error('MIN_NOTICE_DAYS must be a valid number >= 0');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`MIN_NOTICE_DAYS = :${paramIndex}`);
          bindParams.push(data.MIN_NOTICE_DAYS !== null ? data.MIN_NOTICE_DAYS : null);
          paramIndex++;
        }

        if (data.MAX_CONSECUTIVE_DAYS !== undefined) {
          if (data.MAX_CONSECUTIVE_DAYS !== null && (isNaN(data.MAX_CONSECUTIVE_DAYS) || data.MAX_CONSECUTIVE_DAYS < 1)) {
            const validationError = new Error('MAX_CONSECUTIVE_DAYS must be a valid number >= 1');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`MAX_CONSECUTIVE_DAYS = :${paramIndex}`);
          bindParams.push(data.MAX_CONSECUTIVE_DAYS !== null ? data.MAX_CONSECUTIVE_DAYS : null);
          paramIndex++;
        }

        if (data.REQUIRES_DOCUMENT !== undefined) {
          updateFields.push(`REQUIRES_DOCUMENT = :${paramIndex}`);
          bindParams.push(data.REQUIRES_DOCUMENT !== null ? data.REQUIRES_DOCUMENT.toUpperCase() : null);
          paramIndex++;
        }

        if (data.ALLOW_CARRY_FORWARD !== undefined) {
          updateFields.push(`ALLOW_CARRY_FORWARD = :${paramIndex}`);
          bindParams.push(data.ALLOW_CARRY_FORWARD !== null ? data.ALLOW_CARRY_FORWARD.toUpperCase() : null);
          paramIndex++;
        }

        if (data.ALLOW_ENCASHMENT !== undefined) {
          updateFields.push(`ALLOW_ENCASHMENT = :${paramIndex}`);
          bindParams.push(data.ALLOW_ENCASHMENT !== null ? data.ALLOW_ENCASHMENT.toUpperCase() : null);
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
        bindParams.push(ruleId);
        bindParams.push(policyId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE RULE_ID = :${paramIndex - 2} AND POLICY_ID = :${paramIndex - 1} AND TENANT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record using same connection
        const selectQuery = `SELECT 
          RULE_ID,
          RAWTOHEX(RULE_GUID) AS RULE_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          ALLOW_CARRY_FORWARD,
          ALLOW_ENCASHMENT,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE RULE_ID = :1 AND POLICY_ID = :2 AND TENANT_ID = :3`;
        const selectResult = await connection.execute(selectQuery, [ruleId, policyId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const notFoundError = new Error('Leave policy rule not found');
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
      throw new Error(`Failed to update leave policy rule: ${error.message}`);
    }
  }
}

export default AbsLeavePolicyRulesModel;
