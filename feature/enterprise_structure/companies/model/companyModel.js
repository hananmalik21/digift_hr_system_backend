import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';

/**
 * Company Model
 * Handles all database operations for ENT.COMPANIES table
 */
class CompanyModel {
  static TABLE_NAME = 'ENT.COMPANIES';

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
      // Try to parse the date string
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) {
        return null; // Invalid date
      }
      return parsed;
    }
    return null;
  }

  /**
   * Convert date to fiscal year start format (MM-DD) for VARCHAR(5) column
   * @param {string|Date|null} dateValue - Date string or Date object
   * @returns {string|null} MM-DD format string or null
   */
  static convertToFiscalYearStart(dateValue) {
    if (!dateValue) return null;
    
    // If it's already in MM-DD or MM/DD format (5 chars max), return as is
    if (typeof dateValue === 'string' && (dateValue.length <= 5)) {
      // Validate format MM-DD or MM/DD
      const match = dateValue.match(/^(\d{2})[-/](\d{2})$/);
      if (match) {
        const month = parseInt(match[1]);
        const day = parseInt(match[2]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${match[1]}-${match[2]}`; // Return in MM-DD format
        }
      }
    }
    
    // If it's a full date, extract month and day
    let dateObj;
    if (dateValue instanceof Date) {
      dateObj = dateValue;
    } else if (typeof dateValue === 'string') {
      dateObj = new Date(dateValue);
      if (isNaN(dateObj.getTime())) {
        return null; // Invalid date
      }
    } else {
      return null;
    }
    
    // Extract month and day, format as MM-DD
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${month}-${day}`;
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
   * Get all companies
   * @param {Object} filters - Optional filters (companyId, companyCode, status, isActive, pagination)
   * @param {Object} filters.pagination - Pagination options {page, pageSize}
   * @returns {Promise<Object|Array>} Object with {companies, total} if paginated, or Array of companies
   */
  static async findAll(filters = {}) {
    try {
      // Build base query for counting total records
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} c`;
      let dataQuery = `SELECT 
        c.COMPANY_ID,
        c.COMPANY_CODE,
        c.STATUS,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        c.LEGAL_NAME_EN,
        c.LEGAL_NAME_AR,
        c.REGISTRATION_NUMBER,
        c.TAX_ID,
        c.ESTABLISHED_DATE,
        c.INDUSTRY,
        c.COUNTRY,
        c.CITY,
        c.ADDRESS,
        c.PO_BOX,
        c.ZIP_CODE,
        c.PHONE,
        c.EMAIL,
        c.WEBSITE,
        c.TOTAL_EMPLOYEES,
        c.CURRENCY_CODE,
        c.FISCAL_YEAR_START,
        c.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        c.CREATED_BY,
        c.CREATED_DATE,
        c.LAST_UPDATED_BY,
        c.LAST_UPDATED_DATE,
        c.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} c
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON c.ORG_STRUCTURE_ID = s.STRUCTURE_ID`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.companyId) {
        conditions.push(`c.COMPANY_ID = :${paramIndex}`);
        bindParams.push(filters.companyId);
        paramIndex++;
      }

      // Search across company name, code, and registration number
      if (filters.search) {
        const searchValue = `%${filters.search}%`;
        conditions.push(`(
          UPPER(c.COMPANY_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(c.COMPANY_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(c.COMPANY_NAME_AR) LIKE UPPER(:${paramIndex + 2}) OR
          UPPER(c.REGISTRATION_NUMBER) LIKE UPPER(:${paramIndex + 3})
        )`);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        bindParams.push(searchValue);
        paramIndex += 4;
      }

      if (filters.companyCode) {
        conditions.push(`UPPER(c.COMPANY_CODE) = UPPER(:${paramIndex})`);
        bindParams.push(filters.companyCode);
        paramIndex++;
      }

      if (filters.companyName) {
        conditions.push(`(UPPER(c.COMPANY_NAME_EN) LIKE UPPER(:${paramIndex}) OR UPPER(c.COMPANY_NAME_AR) LIKE UPPER(:${paramIndex}))`);
        bindParams.push(`%${filters.companyName}%`);
        paramIndex++;
      }

      if (filters.registrationNumber) {
        conditions.push(`UPPER(c.REGISTRATION_NUMBER) LIKE UPPER(:${paramIndex})`);
        bindParams.push(`%${filters.registrationNumber}%`);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`c.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`c.STATUS = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'ACTIVE' : 'INACTIVE');
        paramIndex++;
      }

      if (filters.orgStructureId) {
        conditions.push(`c.ORG_STRUCTURE_ID = :${paramIndex}`);
        bindParams.push(filters.orgStructureId);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

      // Add WHERE clause to both queries
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY c.CREATED_DATE DESC, c.COMPANY_ID DESC`;

      // Handle pagination
      const pagination = filters.pagination;
      let totalCount = 0;
      
      // Create separate bind parameter arrays for count and data queries
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];
      
      if (pagination && pagination.page && pagination.pageSize) {
        // Get total count first using count bind params
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows && countResult.rows.length > 0 ? countResult.rows[0].total : 0;

        // Apply pagination using Oracle's OFFSET and FETCH NEXT
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(pagination.pageSize);
      }

      // Execute data query with parameterized bindings
      const result = await this.executeQuery(dataQuery, dataBindParams);
      const companies = result.rows || [];

      // Return paginated result with total count
      if (pagination && pagination.page && pagination.pageSize) {
        return {
          companies: companies,
          total: totalCount
        };
      }

    return companies;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch companies: ${error.message}`);
    }
  }

  /**
   * Get a single company by ID
   * @param {number} companyId - Company ID
   * @returns {Promise<Object|null>} Company object or null
   */
  static async findById(companyId) {
    try {
      const query = `SELECT 
        c.COMPANY_ID,
        c.COMPANY_CODE,
        c.STATUS,
        c.COMPANY_NAME_EN,
        c.COMPANY_NAME_AR,
        c.LEGAL_NAME_EN,
        c.LEGAL_NAME_AR,
        c.REGISTRATION_NUMBER,
        c.TAX_ID,
        c.ESTABLISHED_DATE,
        c.INDUSTRY,
        c.COUNTRY,
        c.CITY,
        c.ADDRESS,
        c.PO_BOX,
        c.ZIP_CODE,
        c.PHONE,
        c.EMAIL,
        c.WEBSITE,
        c.TOTAL_EMPLOYEES,
        c.CURRENCY_CODE,
        c.FISCAL_YEAR_START,
        c.ORG_STRUCTURE_ID,
        s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
        c.CREATED_BY,
        c.CREATED_DATE,
        c.LAST_UPDATED_BY,
        c.LAST_UPDATED_DATE,
        c.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} c
      LEFT JOIN ENT.HR_ORG_STRUCTURES s ON c.ORG_STRUCTURE_ID = s.STRUCTURE_ID
      WHERE c.COMPANY_ID = :1`;

      const result = await this.executeQuery(query, [companyId]);
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to fetch company',
        error
      );
    }
  }

  /**
   * Create a new company
   * @param {Object} data - Company data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Created company
   */
  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next COMPANY_ID from sequence (or use MAX+1 if sequence doesn't exist)
        let companyId;
        try {
          const seqQuery = `SELECT ENT.COMPANIES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          companyId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          // If sequence doesn't exist, get max ID and increment
          const maxQuery = `SELECT NVL(MAX(COMPANY_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          companyId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          COMPANY_ID,
          COMPANY_CODE,
          STATUS,
          COMPANY_NAME_EN,
          COMPANY_NAME_AR,
          LEGAL_NAME_EN,
          LEGAL_NAME_AR,
          REGISTRATION_NUMBER,
          TAX_ID,
          ESTABLISHED_DATE,
          INDUSTRY,
          COUNTRY,
          CITY,
          ADDRESS,
          PO_BOX,
          ZIP_CODE,
          PHONE,
          EMAIL,
          WEBSITE,
          TOTAL_EMPLOYEES,
          CURRENCY_CODE,
          FISCAL_YEAR_START,
          ORG_STRUCTURE_ID,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19, :20, :21, :22, :23, :24, :25, :26, :27, :28
        )`;

        const bindParams = [
          companyId,
          data.COMPANY_CODE || null,
          data.STATUS || 'ACTIVE',
          data.COMPANY_NAME_EN || null,
          data.COMPANY_NAME_AR || null,
          data.LEGAL_NAME_EN || null,
          data.LEGAL_NAME_AR || null,
          data.REGISTRATION_NUMBER || null,
          data.TAX_ID || null,
          this.convertToDate(data.ESTABLISHED_DATE),
          data.INDUSTRY || null,
          data.COUNTRY || null,
          data.CITY || null,
          data.ADDRESS || null,
          data.PO_BOX || null,
          data.ZIP_CODE || null,
          data.PHONE || null,
          data.EMAIL || null,
          data.WEBSITE || null,
          data.TOTAL_EMPLOYEES || null,
          data.CURRENCY_CODE || null,
          this.convertToFiscalYearStart(data.FISCAL_YEAR_START),
          data.ORG_STRUCTURE_ID || null,
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.LAST_UPDATE_LOGIN || null
        ];

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the created record with organization structure name
        const selectQuery = `SELECT 
          c.COMPANY_ID,
          c.COMPANY_CODE,
          c.STATUS,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          c.LEGAL_NAME_EN,
          c.LEGAL_NAME_AR,
          c.REGISTRATION_NUMBER,
          c.TAX_ID,
          c.ESTABLISHED_DATE,
          c.INDUSTRY,
          c.COUNTRY,
          c.CITY,
          c.ADDRESS,
          c.PO_BOX,
          c.ZIP_CODE,
          c.PHONE,
          c.EMAIL,
          c.WEBSITE,
          c.TOTAL_EMPLOYEES,
          c.CURRENCY_CODE,
          c.FISCAL_YEAR_START,
          c.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          c.CREATED_BY,
          c.CREATED_DATE,
          c.LAST_UPDATED_BY,
          c.LAST_UPDATED_DATE,
          c.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} c
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON c.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE c.COMPANY_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [companyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to create company',
        error
      );
    }
  }

  /**
   * Update an existing company
   * @param {number} companyId - Company ID
   * @param {Object} data - Updated data
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<Object>} Updated company
   */
  static async update(companyId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        // Build dynamic update query
        if (data.COMPANY_CODE !== undefined) {
          updateFields.push(`COMPANY_CODE = :${paramIndex}`);
          bindParams.push(data.COMPANY_CODE);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }
        if (data.COMPANY_NAME_EN !== undefined) {
          updateFields.push(`COMPANY_NAME_EN = :${paramIndex}`);
          bindParams.push(data.COMPANY_NAME_EN);
          paramIndex++;
        }
        if (data.COMPANY_NAME_AR !== undefined) {
          updateFields.push(`COMPANY_NAME_AR = :${paramIndex}`);
          bindParams.push(data.COMPANY_NAME_AR);
          paramIndex++;
        }
        if (data.LEGAL_NAME_EN !== undefined) {
          updateFields.push(`LEGAL_NAME_EN = :${paramIndex}`);
          bindParams.push(data.LEGAL_NAME_EN);
          paramIndex++;
        }
        if (data.LEGAL_NAME_AR !== undefined) {
          updateFields.push(`LEGAL_NAME_AR = :${paramIndex}`);
          bindParams.push(data.LEGAL_NAME_AR);
          paramIndex++;
        }
        if (data.REGISTRATION_NUMBER !== undefined) {
          updateFields.push(`REGISTRATION_NUMBER = :${paramIndex}`);
          bindParams.push(data.REGISTRATION_NUMBER);
          paramIndex++;
        }
        if (data.TAX_ID !== undefined) {
          updateFields.push(`TAX_ID = :${paramIndex}`);
          bindParams.push(data.TAX_ID);
          paramIndex++;
        }
        if (data.ESTABLISHED_DATE !== undefined) {
          updateFields.push(`ESTABLISHED_DATE = :${paramIndex}`);
          bindParams.push(this.convertToDate(data.ESTABLISHED_DATE));
          paramIndex++;
        }
        if (data.INDUSTRY !== undefined) {
          updateFields.push(`INDUSTRY = :${paramIndex}`);
          bindParams.push(data.INDUSTRY);
          paramIndex++;
        }
        if (data.COUNTRY !== undefined) {
          updateFields.push(`COUNTRY = :${paramIndex}`);
          bindParams.push(data.COUNTRY);
          paramIndex++;
        }
        if (data.CITY !== undefined) {
          updateFields.push(`CITY = :${paramIndex}`);
          bindParams.push(data.CITY);
          paramIndex++;
        }
        if (data.ADDRESS !== undefined) {
          updateFields.push(`ADDRESS = :${paramIndex}`);
          bindParams.push(data.ADDRESS);
          paramIndex++;
        }
        if (data.PO_BOX !== undefined) {
          updateFields.push(`PO_BOX = :${paramIndex}`);
          bindParams.push(data.PO_BOX);
          paramIndex++;
        }
        if (data.ZIP_CODE !== undefined) {
          updateFields.push(`ZIP_CODE = :${paramIndex}`);
          bindParams.push(data.ZIP_CODE);
          paramIndex++;
        }
        if (data.PHONE !== undefined) {
          updateFields.push(`PHONE = :${paramIndex}`);
          bindParams.push(data.PHONE);
          paramIndex++;
        }
        if (data.EMAIL !== undefined) {
          updateFields.push(`EMAIL = :${paramIndex}`);
          bindParams.push(data.EMAIL);
          paramIndex++;
        }
        if (data.WEBSITE !== undefined) {
          updateFields.push(`WEBSITE = :${paramIndex}`);
          bindParams.push(data.WEBSITE);
          paramIndex++;
        }
        if (data.TOTAL_EMPLOYEES !== undefined) {
          updateFields.push(`TOTAL_EMPLOYEES = :${paramIndex}`);
          bindParams.push(data.TOTAL_EMPLOYEES);
          paramIndex++;
        }
        if (data.CURRENCY_CODE !== undefined) {
          updateFields.push(`CURRENCY_CODE = :${paramIndex}`);
          bindParams.push(data.CURRENCY_CODE);
          paramIndex++;
        }
        if (data.FISCAL_YEAR_START !== undefined) {
          updateFields.push(`FISCAL_YEAR_START = :${paramIndex}`);
          bindParams.push(this.convertToFiscalYearStart(data.FISCAL_YEAR_START));
          paramIndex++;
        }
        if (data.ORG_STRUCTURE_ID !== undefined) {
          updateFields.push(`ORG_STRUCTURE_ID = :${paramIndex}`);
          bindParams.push(data.ORG_STRUCTURE_ID);
          paramIndex++;
        }
        if (data.LAST_UPDATE_LOGIN !== undefined) {
          updateFields.push(`LAST_UPDATE_LOGIN = :${paramIndex}`);
          bindParams.push(data.LAST_UPDATE_LOGIN);
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        // Add audit fields
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATED_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        // Add WHERE clause
        bindParams.push(companyId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE COMPANY_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch and return the updated record with organization structure name
        const selectQuery = `SELECT 
          c.COMPANY_ID,
          c.COMPANY_CODE,
          c.STATUS,
          c.COMPANY_NAME_EN,
          c.COMPANY_NAME_AR,
          c.LEGAL_NAME_EN,
          c.LEGAL_NAME_AR,
          c.REGISTRATION_NUMBER,
          c.TAX_ID,
          c.ESTABLISHED_DATE,
          c.INDUSTRY,
          c.COUNTRY,
          c.CITY,
          c.ADDRESS,
          c.PO_BOX,
          c.ZIP_CODE,
          c.PHONE,
          c.EMAIL,
          c.WEBSITE,
          c.TOTAL_EMPLOYEES,
          c.CURRENCY_CODE,
          c.FISCAL_YEAR_START,
          c.ORG_STRUCTURE_ID,
          s.STRUCTURE_NAME AS ORG_STRUCTURE_NAME,
          c.CREATED_BY,
          c.CREATED_DATE,
          c.LAST_UPDATED_BY,
          c.LAST_UPDATED_DATE,
          c.LAST_UPDATE_LOGIN
        FROM ${this.TABLE_NAME} c
        LEFT JOIN ENT.HR_ORG_STRUCTURES s ON c.ORG_STRUCTURE_ID = s.STRUCTURE_ID
        WHERE c.COMPANY_ID = :1`;
        const selectResult = await connection.execute(selectQuery, [companyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to update company',
        error
      );
    }
  }

  /**
   * Delete a company (soft delete by setting STATUS = 'INACTIVE')
   * @param {number} companyId - Company ID
   * @param {string} userId - User ID for audit fields
   * @returns {Promise<boolean>} Success status
   */
  static async softDelete(companyId, userId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME} 
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE COMPANY_ID = :3`;

        const updateResult = await connection.execute(query, [userId || 'SYSTEM', new Date(), companyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the update affected at least one row
        const rowsAffected = updateResult.rowsAffected || updateResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No company found with ID: ${companyId}`);
        }
        
        return { ...updateResult, rowsAffected };
      });
      
      console.log(`Soft delete successful for company ID: ${companyId}, rows affected: ${result.rowsAffected}`);
      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete company: ${error.message}`);
    }
  }

  /**
   * Hard delete a company (permanent removal)
   * @param {number} companyId - Company ID
   * @returns {Promise<Object>} Success status
   */
  static async hardDelete(companyId) {
    try {
      const result = await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE COMPANY_ID = :1`;
        const deleteResult = await connection.execute(query, [companyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
        
        // Verify that the delete affected at least one row
        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new Error(`No company found with ID: ${companyId}`);
        }
        
        return { ...deleteResult, rowsAffected };
      });
      
      console.log(`Hard delete successful for company ID: ${companyId}, rows affected: ${result.rowsAffected}`);
      return { success: true };
    } catch (error) {
      // Wrap Oracle errors in DatabaseError
      if (error.errorNum !== undefined || error.message?.includes('ORA-')) {
        throw new DatabaseError(
          DatabaseError.getUserFriendlyMessage(error),
          error
        );
      }
      
      // If it's already a DatabaseError, re-throw it
      if (error instanceof DatabaseError) {
        throw error;
      }
      
      // For other errors, wrap in DatabaseError
      throw new DatabaseError(
        'Failed to delete company',
        error
      );
    }
  }
}

export default CompanyModel;
