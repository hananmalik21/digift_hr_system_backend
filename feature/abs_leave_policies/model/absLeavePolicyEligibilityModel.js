import db from '../../../config/db.js';
import oracledb from 'oracledb';
import AbsLeavePolicyModel from './absLeavePolicyModel.js';

/**
 * ABS Leave Policy Eligibility Model
 * Handles all database operations for ABS.ABS_LEAVE_POLICY_ELIGIBILITY table
 */
class AbsLeavePolicyEligibilityModel {
  static TABLE_NAME = 'ABS.ABS_LEAVE_POLICY_ELIGIBILITY';
  static PARENT_TABLE_NAME = 'ABS.ABS_LEAVE_POLICIES';
  static GENDER_LOOKUP_CODE = 'GENDER';

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
        if (key.toLowerCase() === 'eligibility_guid' || key === 'ELIGIBILITY_GUID') {
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
   * Verify gender_code exists in GENDER lookup
   * @param {string} genderCode - Gender code
   * @param {number} tenantId - Tenant ID
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<boolean>} True if exists
   */
  static async verifyGenderCode(genderCode, tenantId, connection = null) {
    try {
      if (!genderCode) return true; // Optional field, skip validation if not provided

      // Find the GENDER lookup for this tenant
      const lookupQuery = `SELECT LOOKUP_ID FROM ABS.ABS_LOOKUPS 
        WHERE LOOKUP_CODE = :1 AND TENANT_ID = :2 AND STATUS = 'ACTIVE'`;
      
      let lookupResult;
      if (connection) {
        lookupResult = await connection.execute(lookupQuery, [this.GENDER_LOOKUP_CODE, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        lookupResult = await this.executeQuery(lookupQuery, [this.GENDER_LOOKUP_CODE, tenantId]);
      }

      const lookupRow = lookupResult.rows && lookupResult.rows.length > 0 ? lookupResult.rows[0] : null;
      if (!lookupRow) {
        return false; // Lookup doesn't exist
      }

      const lookupId = lookupRow.LOOKUP_ID !== undefined ? lookupRow.LOOKUP_ID : lookupRow.lookup_id;
      if (!lookupId) {
        return false;
      }

      // Check if the value exists in ABS_LOOKUP_VALUES
      const valueQuery = `SELECT COUNT(*) AS count FROM ABS.ABS_LOOKUP_VALUES 
        WHERE LOOKUP_ID = :1 AND UPPER(LOOKUP_VALUE_CODE) = UPPER(:2) AND TENANT_ID = :3 AND STATUS = 'ACTIVE'`;
      
      let valueResult;
      if (connection) {
        valueResult = await connection.execute(valueQuery, [lookupId, genderCode, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        valueResult = await this.executeQuery(valueQuery, [lookupId, genderCode, tenantId]);
      }

      // Handle both uppercase (from connection.execute) and lowercase (from executeQuery)
      const valueRow = valueResult.rows && valueResult.rows.length > 0 ? valueResult.rows[0] : null;
      if (!valueRow) return false;
      const count = valueRow.COUNT !== undefined ? valueRow.COUNT : (valueRow.count !== undefined ? valueRow.count : 0);
      return count > 0;
    } catch (error) {
      console.error('Error in verifyGenderCode:', error);
      return false;
    }
  }

  /**
   * Check if eligibility record already exists for a policy
   * @param {number} policyId - Policy ID
   * @param {number} tenantId - Tenant ID
   * @param {number} excludeEligibilityId - Optional eligibility ID to exclude from check (for updates)
   * @param {Object} connection - Optional database connection (for transaction)
   * @returns {Promise<boolean>} True if exists
   */
  static async eligibilityExists(policyId, tenantId, excludeEligibilityId = null, connection = null) {
    try {
      let query = `SELECT COUNT(*) AS count 
        FROM ${this.TABLE_NAME}
        WHERE POLICY_ID = :1 AND TENANT_ID = :2`;
      
      const bindParams = [policyId, tenantId];
      
      if (excludeEligibilityId) {
        query += ` AND ELIGIBILITY_ID != :3`;
        bindParams.push(excludeEligibilityId);
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
      console.error('Error in eligibilityExists:', error);
      return false;
    }
  }

  /**
   * Get eligibility rules for a policy
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<Array>} Array of eligibility rules (should be 0 or 1 record)
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
        ELIGIBILITY_ID,
        RAWTOHEX(ELIGIBILITY_GUID) AS ELIGIBILITY_GUID,
        TENANT_ID,
        POLICY_ID,
        MIN_SERVICE_YEARS,
        GENDER_CODE,
        PROBATION_ALLOWED,
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
      throw new Error(`Failed to fetch eligibility rules: ${error.message}`);
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
   * Get a single eligibility rule by ID or GUID
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number|string} eligibilityIdentifier - Eligibility ID (number) or Eligibility GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<Object|null>} Eligibility rule object or null
   */
  static async findById(policyIdentifier, eligibilityIdentifier, tenantId) {
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

      // Check if eligibilityIdentifier is a hex GUID (32 hex characters) or numeric ID
      if (this.isHexGuid(eligibilityIdentifier)) {
        // Lookup by ELIGIBILITY_GUID (hex string)
        query = `SELECT 
          ELIGIBILITY_ID,
          RAWTOHEX(ELIGIBILITY_GUID) AS ELIGIBILITY_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_SERVICE_YEARS,
          GENDER_CODE,
          PROBATION_ALLOWED,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE ELIGIBILITY_GUID = HEXTORAW(:1) AND POLICY_ID = :2 AND TENANT_ID = :3`;
        bindParams = [eligibilityIdentifier.toUpperCase(), policyId, tenantId];
      } else {
        // Lookup by ELIGIBILITY_ID (numeric)
        const eligibilityId = parseInt(eligibilityIdentifier);
        if (isNaN(eligibilityId) || eligibilityId <= 0) {
          const validationError = new Error('Invalid eligibility_id format (must be numeric or 32-character hex GUID)');
          validationError.code = 'VALIDATION_ERROR';
          validationError.statusCode = 400;
          throw validationError;
        }
        query = `SELECT 
          ELIGIBILITY_ID,
          RAWTOHEX(ELIGIBILITY_GUID) AS ELIGIBILITY_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_SERVICE_YEARS,
          GENDER_CODE,
          PROBATION_ALLOWED,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE ELIGIBILITY_ID = :1 AND POLICY_ID = :2 AND TENANT_ID = :3`;
        bindParams = [eligibilityId, policyId, tenantId];
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
      throw new Error(`Failed to fetch eligibility rule: ${error.message}`);
    }
  }

  /**
   * Generate a GUID for ELIGIBILITY_GUID
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
   * Create a new eligibility rule
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @param {Object} data - Eligibility rule data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created eligibility rule
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

        // Check if eligibility record already exists for this policy (only one per policy)
        const exists = await this.eligibilityExists(policyId, tenantId, null, connection);
        if (exists) {
          const conflictError = new Error('An eligibility rule already exists for this policy. Only one eligibility rule is allowed per policy.');
          conflictError.code = 'CONFLICT';
          conflictError.statusCode = 409;
          throw conflictError;
        }

        // Validate gender_code if provided
        if (data.GENDER_CODE) {
          const isValid = await this.verifyGenderCode(data.GENDER_CODE, tenantId, connection);
          if (!isValid) {
            const validationError = new Error(`Gender code '${data.GENDER_CODE}' does not exist in GENDER lookup`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
        }

        // Get next sequence value for ELIGIBILITY_ID (with fallback to MAX+1)
        let eligibilityId;
        try {
          const seqQuery = `SELECT ABS.ABS_LEAVE_POLICY_ELIGIBILITY_SEQ.NEXTVAL AS next_id FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const seqRow = seqResult.rows && seqResult.rows.length > 0 ? seqResult.rows[0] : null;
          eligibilityId = seqRow ? (seqRow.NEXT_ID !== undefined ? seqRow.NEXT_ID : seqRow.next_id) : null;
          if (!eligibilityId) {
            throw new Error('Failed to get next sequence value');
          }
        } catch (seqError) {
          // If sequence doesn't exist or fails, use MAX+1 as fallback
          const maxQuery = `SELECT NVL(MAX(ELIGIBILITY_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
          eligibilityId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
        }

        // Generate GUID for ELIGIBILITY_GUID
        const eligibilityGuid = this.generateGuid();

        // Insert new eligibility rule
        const insertQuery = `INSERT INTO ${this.TABLE_NAME} (
          ELIGIBILITY_ID,
          ELIGIBILITY_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_SERVICE_YEARS,
          GENDER_CODE,
          PROBATION_ALLOWED,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, HEXTORAW(:2), :3, :4, :5, :6, :7, :8, :9, :10, :11
        )`;

        const now = new Date();
        try {
          await connection.execute(insertQuery, [
            eligibilityId,
            eligibilityGuid,
            tenantId,
            policyId,
            data.MIN_SERVICE_YEARS !== undefined && data.MIN_SERVICE_YEARS !== null ? data.MIN_SERVICE_YEARS : null,
            data.GENDER_CODE || null,
            data.PROBATION_ALLOWED ? data.PROBATION_ALLOWED.toUpperCase() : null,
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
            const maxQuery = `SELECT NVL(MAX(ELIGIBILITY_ID), 0) + 1 AS next_id FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            const maxRow = maxResult.rows && maxResult.rows.length > 0 ? maxResult.rows[0] : null;
            eligibilityId = maxRow ? (maxRow.NEXT_ID !== undefined ? maxRow.NEXT_ID : maxRow.next_id) : 1;
            
            // Retry insert with new eligibilityId
            await connection.execute(insertQuery, [
              eligibilityId,
              eligibilityGuid,
              tenantId,
              policyId,
              data.MIN_SERVICE_YEARS !== undefined && data.MIN_SERVICE_YEARS !== null ? data.MIN_SERVICE_YEARS : null,
              data.GENDER_CODE || null,
              data.PROBATION_ALLOWED ? data.PROBATION_ALLOWED.toUpperCase() : null,
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
          ELIGIBILITY_ID,
          RAWTOHEX(ELIGIBILITY_GUID) AS ELIGIBILITY_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_SERVICE_YEARS,
          GENDER_CODE,
          PROBATION_ALLOWED,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE ELIGIBILITY_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [eligibilityId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);
      if (error.code === 'CONFLICT' || error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error(`Failed to create eligibility rule: ${error.message}`);
    }
  }

  /**
   * Update eligibility rule
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number|string} eligibilityIdentifier - Eligibility ID (number) or Eligibility GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated eligibility rule
   */
  static async update(policyIdentifier, eligibilityIdentifier, tenantId, data, userId) {
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

        // Verify eligibility rule exists and belongs to policy and tenant
        // This will resolve the eligibilityIdentifier (GUID or ID) to the actual record
        const existing = await this.findById(policyIdentifier, eligibilityIdentifier, tenantId);
        if (!existing) {
          const notFoundError = new Error('Eligibility rule not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual numeric ELIGIBILITY_ID from the existing record
        const eligibilityId = existing.eligibility_id || existing.ELIGIBILITY_ID;

        // Validate gender_code if provided
        if (data.GENDER_CODE !== undefined && data.GENDER_CODE !== null) {
          const isValid = await this.verifyGenderCode(data.GENDER_CODE, tenantId, connection);
          if (!isValid) {
            const validationError = new Error(`Gender code '${data.GENDER_CODE}' does not exist in GENDER lookup`);
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
        }

        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.MIN_SERVICE_YEARS !== undefined) {
          if (data.MIN_SERVICE_YEARS !== null && (isNaN(data.MIN_SERVICE_YEARS) || data.MIN_SERVICE_YEARS < 0)) {
            const validationError = new Error('MIN_SERVICE_YEARS must be a valid number >= 0');
            validationError.code = 'VALIDATION_ERROR';
            validationError.statusCode = 400;
            throw validationError;
          }
          updateFields.push(`MIN_SERVICE_YEARS = :${paramIndex}`);
          bindParams.push(data.MIN_SERVICE_YEARS !== null ? data.MIN_SERVICE_YEARS : null);
          paramIndex++;
        }

        if (data.GENDER_CODE !== undefined) {
          updateFields.push(`GENDER_CODE = :${paramIndex}`);
          bindParams.push(data.GENDER_CODE !== null ? data.GENDER_CODE : null);
          paramIndex++;
        }

        if (data.PROBATION_ALLOWED !== undefined) {
          updateFields.push(`PROBATION_ALLOWED = :${paramIndex}`);
          bindParams.push(data.PROBATION_ALLOWED !== null ? data.PROBATION_ALLOWED.toUpperCase() : null);
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
        bindParams.push(eligibilityId);
        bindParams.push(policyId);
        bindParams.push(tenantId);
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE ELIGIBILITY_ID = :${paramIndex - 2} AND POLICY_ID = :${paramIndex - 1} AND TENANT_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record using same connection
        const selectQuery = `SELECT 
          ELIGIBILITY_ID,
          RAWTOHEX(ELIGIBILITY_GUID) AS ELIGIBILITY_GUID,
          TENANT_ID,
          POLICY_ID,
          MIN_SERVICE_YEARS,
          GENDER_CODE,
          PROBATION_ALLOWED,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME}
        WHERE ELIGIBILITY_ID = :1 AND POLICY_ID = :2 AND TENANT_ID = :3`;
        const selectResult = await connection.execute(selectQuery, [eligibilityId, policyId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        if (!selectResult.rows || selectResult.rows.length === 0) {
          const notFoundError = new Error('Eligibility rule not found');
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
      throw new Error(`Failed to update eligibility rule: ${error.message}`);
    }
  }

  /**
   * Delete an eligibility rule
   * @param {number|string} policyIdentifier - Policy ID (number) or Policy GUID (hex string)
   * @param {number|string} eligibilityIdentifier - Eligibility ID (number) or Eligibility GUID (hex string)
   * @param {number} tenantId - Tenant ID (required for tenant isolation)
   * @returns {Promise<boolean>} Success status
   */
  static async delete(policyIdentifier, eligibilityIdentifier, tenantId) {
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

        // Verify eligibility rule exists and belongs to policy and tenant
        // This will resolve the eligibilityIdentifier (GUID or ID) to the actual record
        const existing = await this.findById(policyIdentifier, eligibilityIdentifier, tenantId);
        if (!existing) {
          const notFoundError = new Error('Eligibility rule not found');
          notFoundError.code = 'NOT_FOUND';
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        // Get the actual numeric ELIGIBILITY_ID from the existing record
        const eligibilityId = existing.eligibility_id || existing.ELIGIBILITY_ID;

        // Delete the eligibility rule
        const deleteQuery = `DELETE FROM ${this.TABLE_NAME} 
          WHERE ELIGIBILITY_ID = :1 AND POLICY_ID = :2 AND TENANT_ID = :3`;

        const deleteResult = await connection.execute(deleteQuery, [eligibilityId, policyId, tenantId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          const notFoundError = new Error('Eligibility rule not found');
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
      throw new Error(`Failed to delete eligibility rule: ${error.message}`);
    }
  }
}

export default AbsLeavePolicyEligibilityModel;
