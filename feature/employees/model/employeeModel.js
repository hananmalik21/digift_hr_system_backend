import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ValidationError } from '../../../utils/errors/index.js';

/**
 * Employee Model
 * Handles all database operations for EMPL.EMPLOYEES table
 */
class EmployeeModel {
  static TABLE_NAME = 'EMPL.EMPLOYEES';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   * @param {*} obj - Object or array to convert
   * @returns {*} Converted object or array
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date || value instanceof Buffer) {
        converted[newKey] = value;
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
   * Convert date string to Date object for Oracle
   * @param {string|Date|null} dateValue - Date string or Date object
   * @returns {Date|null} Date object or null
   */
  static convertToDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed;
    }
    return null;
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
   * Get all employees
   * @param {Object} filters - Optional filters (enterpriseId, isActive, status, email, name, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object>} Object with {employees, total}
   */
  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataQuery = `SELECT 
        EMPLOYEE_ID,
        RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        ENTERPRISE_ID,
        FIRST_NAME,
        MIDDLE_NAME,
        LAST_NAME,
        FIRST_NAME_AR,
        MIDDLE_NAME_AR,
        LAST_NAME_AR,
        EMAIL,
        PHONE_NUMBER,
        MOBILE_NUMBER,
        DATE_OF_BIRTH,
        STATUS,
        IS_ACTIVE,
        CREATED_AT,
        CREATED_BY,
        UPDATED_AT,
        UPDATED_BY
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.enterpriseId) {
        conditions.push(`ENTERPRISE_ID = :${paramIndex}`);
        bindParams.push(filters.enterpriseId);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`IS_ACTIVE = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'Y' : 'N');
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`STATUS = :${paramIndex}`);
        bindParams.push(String(filters.status).toUpperCase());
        paramIndex++;
      }

      if (filters.email) {
        conditions.push(`LOWER(EMAIL) LIKE LOWER(:${paramIndex})`);
        bindParams.push(`%${String(filters.email)}%`);
        paramIndex++;
      }

      if (filters.name) {
        conditions.push(`(LOWER(FIRST_NAME) LIKE LOWER(:${paramIndex}) OR LOWER(LAST_NAME) LIKE LOWER(:${paramIndex}) OR LOWER(MIDDLE_NAME) LIKE LOWER(:${paramIndex}))`);
        bindParams.push(`%${String(filters.name)}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY CREATED_AT DESC, EMPLOYEE_ID DESC`;

      const pagination = filters.pagination;
      let totalCount = 0;
      
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const employees = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return {
          employees: employees,
          total: totalCount
        };
      }

      return employees;
    } catch (error) {
      console.error('Error in findAll:', error);
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      throw new DatabaseError(`Failed to fetch employees: ${error.message}`, error);
    }
  }

  /**
   * Get a single employee by ID
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} employeeId - Employee ID
   * @returns {Promise<Object|null>} Employee object or null
   */
  static async findById(enterpriseId, employeeId) {
    try {
      const query = `SELECT 
        EMPLOYEE_ID,
        RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        ENTERPRISE_ID,
        FIRST_NAME,
        MIDDLE_NAME,
        LAST_NAME,
        FIRST_NAME_AR,
        MIDDLE_NAME_AR,
        LAST_NAME_AR,
        EMAIL,
        PHONE_NUMBER,
        MOBILE_NUMBER,
        DATE_OF_BIRTH,
        STATUS,
        IS_ACTIVE,
        CREATED_AT,
        CREATED_BY,
        UPDATED_AT,
        UPDATED_BY
      FROM ${this.TABLE_NAME}
      WHERE ENTERPRISE_ID = :1 AND EMPLOYEE_ID = :2`;

      const result = await this.executeQuery(query, [enterpriseId, employeeId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      throw new DatabaseError('Failed to fetch employee', error);
    }
  }

  /**
   * Get a single employee by GUID (32-char hex)
   * @param {string} guidHex32 - Employee GUID as 32-char hex string
   * @returns {Promise<Object|null>} Employee object or null
   */
  static async findByGuidHex(guidHex32) {
    try {
      const hex = String(guidHex32 || '').trim().replace(/-/g, '').toUpperCase();
      if (hex.length !== 32) {
        throw new ValidationError('GUID must be 32-character hex string', { guid: guidHex32 });
      }

      const query = `SELECT 
        EMPLOYEE_ID,
        RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        ENTERPRISE_ID,
        FIRST_NAME,
        MIDDLE_NAME,
        LAST_NAME,
        FIRST_NAME_AR,
        MIDDLE_NAME_AR,
        LAST_NAME_AR,
        EMAIL,
        PHONE_NUMBER,
        MOBILE_NUMBER,
        DATE_OF_BIRTH,
        STATUS,
        IS_ACTIVE,
        CREATED_AT,
        CREATED_BY,
        UPDATED_AT,
        UPDATED_BY
      FROM ${this.TABLE_NAME}
      WHERE RAWTOHEX(EMPLOYEE_GUID) = :1`;

      const result = await this.executeQuery(query, [hex]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      if (error instanceof ValidationError) {
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
      
      throw new DatabaseError('Failed to fetch employee by GUID', error);
    }
  }

  /**
   * Create a new employee
   * @param {Object} data - Employee data
   * @param {number} enterpriseId - Enterprise ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created employee
   */
  static async create(data, enterpriseId, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next EMPLOYEE_ID from sequence or use provided ID
        let employeeId;
        const useSeq = String(data.use_seq || 'N').toUpperCase() === 'Y';
        
        if (useSeq) {
          try {
            const seqQuery = `SELECT EMPL.SEQ_EMPLOYEES.NEXTVAL AS NEXT_ID FROM DUAL`;
            const seqResult = await connection.execute(seqQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            employeeId = seqResult.rows[0].NEXT_ID;
          } catch (seqError) {
            // If sequence doesn't exist, get max ID and increment
            const maxQuery = `SELECT NVL(MAX(EMPLOYEE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
            const maxResult = await connection.execute(maxQuery, [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            employeeId = maxResult.rows[0].NEXT_ID;
          }
        } else {
          if (!data.EMPLOYEE_ID) {
            throw new ValidationError('EMPLOYEE_ID is required (or pass use_seq="Y" if you have a sequence)');
          }
          employeeId = Number(data.EMPLOYEE_ID);
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          EMPLOYEE_ID,
          ENTERPRISE_ID,
          FIRST_NAME,
          MIDDLE_NAME,
          LAST_NAME,
          FIRST_NAME_AR,
          MIDDLE_NAME_AR,
          LAST_NAME_AR,
          EMAIL,
          PHONE_NUMBER,
          MOBILE_NUMBER,
          DATE_OF_BIRTH,
          STATUS,
          IS_ACTIVE,
          CREATED_AT,
          CREATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16
        )`;

        const bindParams = [
          employeeId,
          enterpriseId,
          String(data.FIRST_NAME || ''),
          data.MIDDLE_NAME || null,
          String(data.LAST_NAME || ''),
          data.FIRST_NAME_AR || null,
          data.MIDDLE_NAME_AR || null,
          data.LAST_NAME_AR || null,
          String(data.EMAIL || ''),
          String(data.PHONE_NUMBER || ''),
          data.MOBILE_NUMBER || null,
          this.convertToDate(data.DATE_OF_BIRTH),
          String(data.STATUS || 'DRAFT').toUpperCase(),
          String(data.IS_ACTIVE ?? 'Y').toUpperCase(),
          now,
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the created record using the same connection
        const selectQuery = `SELECT 
          EMPLOYEE_ID,
          RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          ENTERPRISE_ID,
          FIRST_NAME,
          MIDDLE_NAME,
          LAST_NAME,
          FIRST_NAME_AR,
          MIDDLE_NAME_AR,
          LAST_NAME_AR,
          EMAIL,
          PHONE_NUMBER,
          MOBILE_NUMBER,
          DATE_OF_BIRTH,
          STATUS,
          IS_ACTIVE,
          CREATED_AT,
          CREATED_BY,
          UPDATED_AT,
          UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE ENTERPRISE_ID = :1 AND EMPLOYEE_ID = :2`;

        const selectResult = await connection.execute(selectQuery, [enterpriseId, employeeId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (selectResult.rows && selectResult.rows.length > 0) {
          return this.convertKeysToSnakeCase(selectResult.rows[0]);
        }
        
        throw new Error(`Failed to retrieve created employee with ID: ${employeeId}`);
      });
    } catch (error) {
      if (error instanceof ValidationError) {
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
      
      throw new DatabaseError('Failed to create employee', error);
    }
  }

  /**
   * Update an existing employee
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} employeeId - Employee ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated employee
   */
  static async update(enterpriseId, employeeId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        const allowed = [
          'FIRST_NAME', 'MIDDLE_NAME', 'LAST_NAME',
          'FIRST_NAME_AR', 'MIDDLE_NAME_AR', 'LAST_NAME_AR',
          'EMAIL', 'PHONE_NUMBER', 'MOBILE_NUMBER',
          'DATE_OF_BIRTH', 'STATUS', 'IS_ACTIVE'
        ];

        for (const field of allowed) {
          if (data[field] === undefined) continue;
          
          if (field === 'DATE_OF_BIRTH') {
            updateFields.push(`${field} = :${paramIndex}`);
            bindParams.push(this.convertToDate(data[field]));
            paramIndex++;
            continue;
          }
          
          if (field === 'STATUS' || field === 'IS_ACTIVE') {
            updateFields.push(`${field} = :${paramIndex}`);
            bindParams.push(String(data[field]).toUpperCase());
            paramIndex++;
            continue;
          }
          
          updateFields.push(`${field} = :${paramIndex}`);
          bindParams.push(data[field]);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new ValidationError('No fields provided for update');
        }

        updateFields.push(`UPDATED_AT = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        updateFields.push(`UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        bindParams.push(enterpriseId);
        bindParams.push(employeeId);
        
        const query = `UPDATE ${this.TABLE_NAME} 
          SET ${updateFields.join(', ')} 
          WHERE ENTERPRISE_ID = :${paramIndex - 1} AND EMPLOYEE_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return await this.findById(enterpriseId, employeeId);
      });
    } catch (error) {
      if (error instanceof ValidationError) {
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
      
      throw new DatabaseError('Failed to update employee', error);
    }
  }

  /**
   * Delete an employee (hard delete)
   * @param {number} enterpriseId - Enterprise ID
   * @param {number} employeeId - Employee ID
   * @returns {Promise<Object>} Success status
   */
  static async remove(enterpriseId, employeeId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE ENTERPRISE_ID = :1 AND EMPLOYEE_ID = :2`;
        const deleteResult = await connection.execute(query, [enterpriseId, employeeId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new NotFoundError(`No employee found with ID: ${employeeId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Delete successful for employee ID: ${employeeId}, rows affected: ${result.rowsAffected}`);
      return { deleted: true, employeeId: Number(employeeId), enterpriseId };
    } catch (error) {
      if (error instanceof NotFoundError) {
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
      
      throw new DatabaseError('Failed to delete employee', error);
    }
  }
}

export default EmployeeModel;
