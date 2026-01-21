import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';
import { generateSysGuid } from '../../../utils/guidUtils.js';

/**
 * Employee Model
 * Handles all database operations for EMPL.EMPLOYEES table
 *
 * Table columns (confirmed):
 * - EMPLOYEE_ID (PK)
 * - EMPLOYEE_GUID (RAW(16))
 * - ENTERPRISE_ID
 * - FIRST_NAME, MIDDLE_NAME, LAST_NAME
 * - FIRST_NAME_AR, MIDDLE_NAME_AR, LAST_NAME_AR
 * - EMAIL, PHONE_NUMBER, MOBILE_NUMBER
 * - DATE_OF_BIRTH
 * - STATUS
 * - IS_ACTIVE (Y/N)
 * - CREATION_DATE, CREATED_BY
 * - LAST_UPDATE_DATE, LAST_UPDATED_BY
 */
class EmployeeModel {
  static TABLE_NAME = 'EMPL.EMPLOYEES';
  static SEQ_NAME = 'EMPL.EMPLOYEES_SEQ';

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
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
   * Helper method to execute queries (non-transaction)
   */
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

  /**
   * Helper method to execute operations within a transaction
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
   * Convert date string to Date object
   */
  static convertToDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Normalize boolean/Y/N to 'Y'/'N'
   */
  static toYN(v, defaultValue = 'Y') {
    if (v === null || v === undefined) return defaultValue;
    if (typeof v === 'string') {
      const s = v.trim().toUpperCase();
      if (s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1') return 'Y';
      if (s === 'N' || s === 'NO' || s === 'FALSE' || s === '0') return 'N';
      return defaultValue;
    }
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    if (typeof v === 'number') return v === 1 ? 'Y' : 'N';
    return defaultValue;
  }

  /**
   * Find all employees with filters and pagination
   *
   * Accepted filter keys:
   * - enterprise_id OR enterpriseId
   * - status
   * - is_active OR isActive (boolean/string)
   * - email
   * - name
   * - pagination: { page, pageSize }
   */
  static async findAll(filters = {}) {
    try {
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      // Base queries
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} e WHERE 1=1`;

      let dataQuery = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME,
        e.MIDDLE_NAME,
        e.LAST_NAME,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY,
        e.CREATION_DATE,
        e.LAST_UPDATED_BY,
        e.LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} e WHERE 1=1`;

      // ENTERPRISE filter (fix: accept both keys)
      const enterpriseId = filters.enterprise_id ?? filters.enterpriseId;
      if (enterpriseId !== undefined && enterpriseId !== null && enterpriseId !== '' && !isNaN(Number(enterpriseId))) {
        conditions.push(`e.ENTERPRISE_ID = :${paramIndex}`);
        bindParams.push(Number(enterpriseId));
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`UPPER(e.STATUS) = UPPER(:${paramIndex})`);
        bindParams.push(String(filters.status));
        paramIndex++;
      }

      const isActive = filters.is_active ?? filters.isActive;
      if (isActive !== undefined) {
        conditions.push(`e.IS_ACTIVE = :${paramIndex}`);
        bindParams.push(this.toYN(isActive, 'Y'));
        paramIndex++;
      }

      if (filters.email) {
        conditions.push(`UPPER(e.EMAIL) LIKE UPPER(:${paramIndex})`);
        bindParams.push(`%${filters.email}%`);
        paramIndex++;
      }

      if (filters.name) {
        conditions.push(`(
          UPPER(e.FIRST_NAME) LIKE UPPER(:${paramIndex}) OR
          UPPER(e.LAST_NAME) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(e.MIDDLE_NAME) LIKE UPPER(:${paramIndex + 2})
        )`);
        const like = `%${filters.name}%`;
        bindParams.push(like, like, like);
        paramIndex += 3;
      }

      const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      // FIX: order by CREATION_DATE (not CREATED_DATE)
      dataQuery += ` ORDER BY e.CREATION_DATE DESC NULLS LAST, e.EMPLOYEE_ID DESC`;

      // Pagination
      const pagination = filters.pagination;
      let totalCount = 0;

      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];

      if (pagination && pagination.page && pagination.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount =
          countResult.rows && countResult.rows.length > 0
            ? Number(countResult.rows[0].total || 0)
            : 0;

        const offset = (Number(pagination.page) - 1) * Number(pagination.pageSize);
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset);
        dataBindParams.push(Number(pagination.pageSize));
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const employees = result.rows || [];

      if (pagination && pagination.page && pagination.pageSize) {
        return { employees, total: totalCount };
      }

      return employees;
    } catch (error) {
      console.error('[EmployeeModel.findAll] Error:', {
        errorType: error?.constructor?.name,
        message: error?.message,
        errorNum: error?.errorNum,
        code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6)
      });

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch employees', error);
    }
  }

  /**
   * Find employee by GUID (hex string)
   */
  static async findByGuidHex(guid) {
    try {
      const guidHex = String(guid).trim().toUpperCase().replace(/-/g, '');
      if (!/^[0-9A-F]{32}$/.test(guidHex)) return null;

      const query = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME,
        e.MIDDLE_NAME,
        e.LAST_NAME,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY,
        e.CREATION_DATE,
        e.LAST_UPDATED_BY,
        e.LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} e
      WHERE RAWTOHEX(e.EMPLOYEE_GUID) = :1`;

      const result = await this.executeQuery(query, [guidHex]);
      return result.rows && result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch employee by GUID', error);
    }
  }

  /**
   * Find employee by ID
   */
  static async findById(enterpriseId, employeeId) {
    try {
      const query = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME,
        e.MIDDLE_NAME,
        e.LAST_NAME,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY,
        e.CREATION_DATE,
        e.LAST_UPDATED_BY,
        e.LAST_UPDATE_DATE
      FROM ${this.TABLE_NAME} e
      WHERE e.ENTERPRISE_ID = :1 AND e.EMPLOYEE_ID = :2`;

      const result = await this.executeQuery(query, [Number(enterpriseId), Number(employeeId)]);
      return result.rows && result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch employee by ID', error);
    }
  }

  /**
   * Create a new employee
   */
  static async create(data, enterpriseId, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // 1) Get next EMPLOYEE_ID
        let employeeId;
        try {
          const seqQuery = `SELECT ${this.SEQ_NAME}.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          employeeId = seqResult.rows[0].NEXT_ID;
        } catch (seqError) {
          const maxQuery = `SELECT NVL(MAX(EMPLOYEE_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME} WHERE ENTERPRISE_ID = :1`;
          const maxResult = await connection.execute(maxQuery, [Number(enterpriseId)], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          employeeId = maxResult.rows[0].NEXT_ID;
        }

        // 2) Generate GUID (RAW buffer)
        const { buffer: guidBuffer } = await generateSysGuid(connection);

        // 3) Insert
        const now = new Date();
        const query = `INSERT INTO ${this.TABLE_NAME} (
          EMPLOYEE_ID,
          EMPLOYEE_GUID,
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
          CREATED_BY,
          CREATION_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATE_DATE
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17, :18, :19
        )`;

        const bindParams = [
          employeeId,
          guidBuffer,
          Number(enterpriseId),
          data.FIRST_NAME ?? null,
          data.MIDDLE_NAME ?? null,
          data.LAST_NAME ?? null,
          data.FIRST_NAME_AR ?? null,
          data.MIDDLE_NAME_AR ?? null,
          data.LAST_NAME_AR ?? null,
          data.EMAIL ?? null,
          data.PHONE_NUMBER ?? null,
          data.MOBILE_NUMBER ?? null,
          this.convertToDate(data.DATE_OF_BIRTH),
          (data.STATUS ?? 'DRAFT'),
          this.toYN(data.IS_ACTIVE, 'Y'),
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now
        ];

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // 4) Return created row
        const selectQuery = `SELECT 
          e.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.ENTERPRISE_ID,
          e.FIRST_NAME,
          e.MIDDLE_NAME,
          e.LAST_NAME,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.EMAIL,
          e.PHONE_NUMBER,
          e.MOBILE_NUMBER,
          e.DATE_OF_BIRTH,
          e.STATUS,
          e.IS_ACTIVE,
          e.CREATED_BY,
          e.CREATION_DATE,
          e.LAST_UPDATED_BY,
          e.LAST_UPDATE_DATE
        FROM ${this.TABLE_NAME} e
        WHERE e.EMPLOYEE_ID = :1 AND e.ENTERPRISE_ID = :2`;

        const selectResult = await connection.execute(selectQuery, [employeeId, Number(enterpriseId)], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('[EmployeeModel.create] Error:', {
        errorType: error?.constructor?.name,
        message: error?.message,
        errorNum: error?.errorNum,
        code: error?.code,
        stack: error?.stack?.split('\n').slice(0, 6)
      });

      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create employee', error);
    }
  }

  /**
   * Update an existing employee
   */
  static async update(enterpriseId, employeeId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.FIRST_NAME !== undefined) {
          updateFields.push(`FIRST_NAME = :${paramIndex}`);
          bindParams.push(data.FIRST_NAME);
          paramIndex++;
        }
        if (data.MIDDLE_NAME !== undefined) {
          updateFields.push(`MIDDLE_NAME = :${paramIndex}`);
          bindParams.push(data.MIDDLE_NAME);
          paramIndex++;
        }
        if (data.LAST_NAME !== undefined) {
          updateFields.push(`LAST_NAME = :${paramIndex}`);
          bindParams.push(data.LAST_NAME);
          paramIndex++;
        }
        if (data.FIRST_NAME_AR !== undefined) {
          updateFields.push(`FIRST_NAME_AR = :${paramIndex}`);
          bindParams.push(data.FIRST_NAME_AR);
          paramIndex++;
        }
        if (data.MIDDLE_NAME_AR !== undefined) {
          updateFields.push(`MIDDLE_NAME_AR = :${paramIndex}`);
          bindParams.push(data.MIDDLE_NAME_AR);
          paramIndex++;
        }
        if (data.LAST_NAME_AR !== undefined) {
          updateFields.push(`LAST_NAME_AR = :${paramIndex}`);
          bindParams.push(data.LAST_NAME_AR);
          paramIndex++;
        }
        if (data.EMAIL !== undefined) {
          updateFields.push(`EMAIL = :${paramIndex}`);
          bindParams.push(data.EMAIL);
          paramIndex++;
        }
        if (data.PHONE_NUMBER !== undefined) {
          updateFields.push(`PHONE_NUMBER = :${paramIndex}`);
          bindParams.push(data.PHONE_NUMBER);
          paramIndex++;
        }
        if (data.MOBILE_NUMBER !== undefined) {
          updateFields.push(`MOBILE_NUMBER = :${paramIndex}`);
          bindParams.push(data.MOBILE_NUMBER);
          paramIndex++;
        }
        if (data.DATE_OF_BIRTH !== undefined) {
          updateFields.push(`DATE_OF_BIRTH = :${paramIndex}`);
          bindParams.push(this.convertToDate(data.DATE_OF_BIRTH));
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(data.STATUS);
          paramIndex++;
        }
        if (data.IS_ACTIVE !== undefined) {
          updateFields.push(`IS_ACTIVE = :${paramIndex}`);
          bindParams.push(this.toYN(data.IS_ACTIVE, 'Y'));
          paramIndex++;
        }

        if (updateFields.length === 0) {
          throw new DatabaseError('No fields to update');
        }

        // Always update WHO fields
        const now = new Date();
        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATE_DATE = :${paramIndex}`);
        bindParams.push(now);
        paramIndex++;

        const query = `UPDATE ${this.TABLE_NAME}
          SET ${updateFields.join(', ')}
          WHERE ENTERPRISE_ID = :${paramIndex} AND EMPLOYEE_ID = :${paramIndex + 1}`;

        bindParams.push(Number(enterpriseId));
        bindParams.push(Number(employeeId));

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        return await this.findById(enterpriseId, employeeId);
      });
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update employee', error);
    }
  }

  /**
   * Remove (hard delete) an employee
   */
  static async remove(enterpriseId, employeeId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME}
                       WHERE ENTERPRISE_ID = :1 AND EMPLOYEE_ID = :2`;

        const result = await connection.execute(query, [Number(enterpriseId), Number(employeeId)], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return {
          rows_affected: result.rowsAffected || 0
        };
      });
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to delete employee', error);
    }
  }
}

export default EmployeeModel;
