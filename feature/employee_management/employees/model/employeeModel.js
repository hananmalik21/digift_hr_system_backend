import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { generateSysGuid } from '../../../../utils/guidUtils.js';

class EmployeeModel {
  static TABLE_NAME = 'EMPL.EMPLOYEES';
  static SEQ_NAME = 'EMPL.EMPLOYEES_SEQ';

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
        } catch (_) {}
      }
      throw error;
    } finally {
      if (connection && connection.close) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  static convertToDate(dateValue) {
    if (!dateValue) return null;
    if (dateValue instanceof Date) return dateValue;
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  }

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

  static async findAll(filters = {}) {
    try {
      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} e WHERE 1=1`;

      let dataQuery = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY
      FROM ${this.TABLE_NAME} e WHERE 1=1`;

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
          UPPER(e.FIRST_NAME_EN) LIKE UPPER(:${paramIndex}) OR
          UPPER(e.LAST_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(e.MIDDLE_NAME_EN) LIKE UPPER(:${paramIndex + 2})
        )`);
        const like = `%${filters.name}%`;
        bindParams.push(like, like, like);
        paramIndex += 3;
      }

      const whereClause = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY e.EMPLOYEE_ID DESC`;
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
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch employees', error);
    }
  }

  static async findByGuidHex(guid) {
    try {
      const guidHex = String(guid).trim().toUpperCase().replace(/-/g, '');
      if (!/^[0-9A-F]{32}$/.test(guidHex)) return null;

      const query = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY
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

  static async findById(enterpriseId, employeeId) {
    try {
      const query = `SELECT 
        e.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.ENTERPRISE_ID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        e.PHONE_NUMBER,
        e.MOBILE_NUMBER,
        e.DATE_OF_BIRTH,
        e.STATUS,
        e.IS_ACTIVE,
        e.CREATED_BY
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

  static async create(data, enterpriseId, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
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
        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const query = `INSERT INTO ${this.TABLE_NAME} (
          EMPLOYEE_ID,
          EMPLOYEE_GUID,
          ENTERPRISE_ID,
          FIRST_NAME_EN,
          MIDDLE_NAME_EN,
          LAST_NAME_EN,
          FIRST_NAME_AR,
          MIDDLE_NAME_AR,
          LAST_NAME_AR,
          FAMILY_NAME_AR,
          EMAIL,
          PHONE_NUMBER,
          MOBILE_NUMBER,
          DATE_OF_BIRTH,
          STATUS,
          IS_ACTIVE,
          CREATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17
        )`;

        const bindParams = [
          employeeId,
          guidBuffer,
          Number(enterpriseId),
          data.FIRST_NAME_EN ?? data.FIRST_NAME ?? null,
          data.MIDDLE_NAME_EN ?? data.MIDDLE_NAME ?? null,
          data.LAST_NAME_EN ?? data.LAST_NAME ?? null,
          data.FIRST_NAME_AR ?? null,
          data.MIDDLE_NAME_AR ?? null,
          data.LAST_NAME_AR ?? null,
          data.FAMILY_NAME_AR ?? null,
          data.EMAIL ?? null,
          data.PHONE_NUMBER ?? null,
          data.MOBILE_NUMBER ?? null,
          this.convertToDate(data.DATE_OF_BIRTH),
          (data.STATUS ?? 'DRAFT'),
          this.toYN(data.IS_ACTIVE, 'Y'),
          userId || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const selectQuery = `SELECT 
          e.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.ENTERPRISE_ID,
          e.FIRST_NAME_EN,
          e.MIDDLE_NAME_EN,
          e.LAST_NAME_EN,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.FAMILY_NAME_AR,
          e.EMAIL,
          e.PHONE_NUMBER,
          e.MOBILE_NUMBER,
          e.DATE_OF_BIRTH,
          e.STATUS,
          e.IS_ACTIVE,
          e.CREATED_BY
        FROM ${this.TABLE_NAME} e
        WHERE e.EMPLOYEE_ID = :1 AND e.ENTERPRISE_ID = :2`;

        const selectResult = await connection.execute(selectQuery, [employeeId, Number(enterpriseId)], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      if (error?.errorNum !== undefined || error?.message?.includes('ORA-')) {
        throw new DatabaseError(DatabaseError.getUserFriendlyMessage(error), error);
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create employee', error);
    }
  }

  static async update(enterpriseId, employeeId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.FIRST_NAME_EN !== undefined || data.FIRST_NAME !== undefined) {
          updateFields.push(`FIRST_NAME_EN = :${paramIndex}`);
          bindParams.push(data.FIRST_NAME_EN ?? data.FIRST_NAME);
          paramIndex++;
        }
        if (data.MIDDLE_NAME_EN !== undefined || data.MIDDLE_NAME !== undefined) {
          updateFields.push(`MIDDLE_NAME_EN = :${paramIndex}`);
          bindParams.push(data.MIDDLE_NAME_EN ?? data.MIDDLE_NAME);
          paramIndex++;
        }
        if (data.LAST_NAME_EN !== undefined || data.LAST_NAME !== undefined) {
          updateFields.push(`LAST_NAME_EN = :${paramIndex}`);
          bindParams.push(data.LAST_NAME_EN ?? data.LAST_NAME);
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
        if (data.FAMILY_NAME_AR !== undefined) {
          updateFields.push(`FAMILY_NAME_AR = :${paramIndex}`);
          bindParams.push(data.FAMILY_NAME_AR);
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
