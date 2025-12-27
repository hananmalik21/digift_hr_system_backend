import db from '../../../config/db.js';
import oracledb from 'oracledb';

class GradeModel {
  static TABLE_NAME = 'ENT.GRADES';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      converted[newKey] = (typeof value === 'object' && value !== null && !(value instanceof Date) && !(value instanceof Buffer))
        ? this.convertKeysToSnakeCase(value)
        : value;
    }
    return converted;
  }

  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });

    if (result.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
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
      if (connection?.rollback) {
        try { await connection.rollback(); } catch {}
      }
      throw error;
    } finally {
      if (connection?.close) {
        try { await connection.close(); } catch {}
      }
    }
  }

  static async findAll(filters = {}) {
    try {
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} g`;
      let dataQuery = `SELECT
        g.GRADE_ID,
        g.GRADE_NUMBER,
        g.GRADE_CATEGORY,
        g.CURRENCY_CODE,
        g.STEP_1_SALARY,
        g.STEP_2_SALARY,
        g.STEP_3_SALARY,
        g.STEP_4_SALARY,
        g.STEP_5_SALARY,
        g.DESCRIPTION,
        g.STATUS,
        g.CREATED_BY,
        g.CREATED_DATE,
        g.LAST_UPDATED_BY,
        g.LAST_UPDATED_DATE,
        g.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} g`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.gradeId) {
        conditions.push(`g.GRADE_ID = :${paramIndex}`);
        bindParams.push(filters.gradeId);
        paramIndex++;
      }

      if (filters.search) {
        const sv = `%${filters.search}%`;
        conditions.push(`(
          UPPER(g.GRADE_NUMBER) LIKE UPPER(:${paramIndex}) OR
          UPPER(g.GRADE_CATEGORY) LIKE UPPER(:${paramIndex + 1})
        )`);
        bindParams.push(sv, sv);
        paramIndex += 2;
      }

      if (filters.gradeNumber) {
        conditions.push(`UPPER(g.GRADE_NUMBER) = UPPER(:${paramIndex})`);
        bindParams.push(filters.gradeNumber);
        paramIndex++;
      }

      if (filters.gradeCategory) {
        conditions.push(`UPPER(g.GRADE_CATEGORY) LIKE UPPER(:${paramIndex})`);
        bindParams.push(`%${filters.gradeCategory}%`);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`g.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`g.STATUS = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'ACTIVE' : 'INACTIVE');
        paramIndex++;
      }

      const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY g.CREATED_DATE DESC, g.GRADE_ID DESC`;

      const pagination = filters.pagination;
      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];

      let totalCount = 0;

      if (pagination?.page && pagination?.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows?.[0]?.total ?? 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset, pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const grades = result.rows || [];

      if (pagination?.page && pagination?.pageSize) {
        return { grades, total: totalCount };
      }

      return grades;
    } catch (error) {
      throw new Error(`Failed to fetch grades: ${error.message}`);
    }
  }

  static async findById(gradeId) {
    try {
      const query = `SELECT
        g.GRADE_ID,
        g.GRADE_NUMBER,
        g.GRADE_CATEGORY,
        g.CURRENCY_CODE,
        g.STEP_1_SALARY,
        g.STEP_2_SALARY,
        g.STEP_3_SALARY,
        g.STEP_4_SALARY,
        g.STEP_5_SALARY,
        g.DESCRIPTION,
        g.STATUS,
        g.CREATED_BY,
        g.CREATED_DATE,
        g.LAST_UPDATED_BY,
        g.LAST_UPDATED_DATE,
        g.LAST_UPDATE_LOGIN
      FROM ${this.TABLE_NAME} g
      WHERE g.GRADE_ID = :1`;

      const result = await this.executeQuery(query, [gradeId]);
      return result.rows?.[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch grade: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let gradeId;

        try {
          const seq = await connection.execute(`SELECT ENT.GRADES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          gradeId = seq.rows[0].NEXT_ID;
        } catch {
          const max = await connection.execute(`SELECT NVL(MAX(GRADE_ID),0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`, [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          gradeId = max.rows[0].NEXT_ID;
        }

        const now = new Date();

        const query = `INSERT INTO ${this.TABLE_NAME} (
          GRADE_ID, GRADE_NUMBER, GRADE_CATEGORY, CURRENCY_CODE,
          STEP_1_SALARY, STEP_2_SALARY, STEP_3_SALARY, STEP_4_SALARY, STEP_5_SALARY,
          DESCRIPTION, STATUS,
          CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATED_DATE, LAST_UPDATE_LOGIN
        ) VALUES (
          :1, :2, :3, :4,
          :5, :6, :7, :8, :9,
          :10, :11,
          :12, :13, :14, :15, :16
        )`;

        const bindParams = [
          gradeId,
          data.GRADE_NUMBER || null,
          data.GRADE_CATEGORY || null,
          (data.CURRENCY_CODE || 'KWD').toUpperCase(),

          Number(data.STEP_1_SALARY),
          Number(data.STEP_2_SALARY),
          Number(data.STEP_3_SALARY),
          Number(data.STEP_4_SALARY),
          Number(data.STEP_5_SALARY),

          data.DESCRIPTION || null,
          (data.STATUS || 'ACTIVE').toUpperCase(),

          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.LAST_UPDATE_LOGIN || 'SYSTEM'
        ];

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const select = await connection.execute(
          `SELECT
            GRADE_ID, GRADE_NUMBER, GRADE_CATEGORY, CURRENCY_CODE,
            STEP_1_SALARY, STEP_2_SALARY, STEP_3_SALARY, STEP_4_SALARY, STEP_5_SALARY,
            DESCRIPTION, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATED_DATE, LAST_UPDATE_LOGIN
          FROM ${this.TABLE_NAME}
          WHERE GRADE_ID = :1`,
          [gradeId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.convertKeysToSnakeCase(select.rows[0]);
      });
    } catch (error) {
      // Unique constraint
      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraint = error.message?.match(/\(([A-Z0-9_.]+)\)/)?.[1] || 'UNKNOWN';
        const e = new Error('A grade with the same GRADE_NUMBER already exists.');
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraint;
        e.columns = 'GRADE_NUMBER';
        e.userMessage = e.message;
        throw e;
      }

      throw new Error(`Failed to create grade: ${error.message}`);
    }
  }

  static async update(gradeId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let idx = 1;

        const setIfProvided = (col, val, transformFn) => {
          if (val !== undefined) {
            updateFields.push(`${col} = :${idx}`);
            bindParams.push(transformFn ? transformFn(val) : val);
            idx++;
          }
        };

        setIfProvided('GRADE_NUMBER', data.GRADE_NUMBER, v => v);
        setIfProvided('GRADE_CATEGORY', data.GRADE_CATEGORY, v => v);
        setIfProvided('CURRENCY_CODE', data.CURRENCY_CODE, v => String(v).toUpperCase());
        setIfProvided('STEP_1_SALARY', data.STEP_1_SALARY, v => Number(v));
        setIfProvided('STEP_2_SALARY', data.STEP_2_SALARY, v => Number(v));
        setIfProvided('STEP_3_SALARY', data.STEP_3_SALARY, v => Number(v));
        setIfProvided('STEP_4_SALARY', data.STEP_4_SALARY, v => Number(v));
        setIfProvided('STEP_5_SALARY', data.STEP_5_SALARY, v => Number(v));
        setIfProvided('DESCRIPTION', data.DESCRIPTION, v => v);
        setIfProvided('STATUS', data.STATUS, v => String(v).toUpperCase());
        setIfProvided('LAST_UPDATE_LOGIN', data.LAST_UPDATE_LOGIN, v => v);

        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }

        updateFields.push(`LAST_UPDATED_BY = :${idx}`);
        bindParams.push(userId || 'SYSTEM');
        idx++;

        updateFields.push(`LAST_UPDATED_DATE = :${idx}`);
        bindParams.push(new Date());
        idx++;

        bindParams.push(gradeId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE GRADE_ID = :${idx}`;

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const select = await connection.execute(
          `SELECT
            GRADE_ID, GRADE_NUMBER, GRADE_CATEGORY, CURRENCY_CODE,
            STEP_1_SALARY, STEP_2_SALARY, STEP_3_SALARY, STEP_4_SALARY, STEP_5_SALARY,
            DESCRIPTION, STATUS,
            CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATED_DATE, LAST_UPDATE_LOGIN
          FROM ${this.TABLE_NAME}
          WHERE GRADE_ID = :1`,
          [gradeId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.convertKeysToSnakeCase(select.rows[0]);
      });
    } catch (error) {
      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraint = error.message?.match(/\(([A-Z0-9_.]+)\)/)?.[1] || 'UNKNOWN';
        const e = new Error('A grade with the same GRADE_NUMBER already exists.');
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraint;
        e.columns = 'GRADE_NUMBER';
        e.userMessage = e.message;
        throw e;
      }

      throw new Error(`Failed to update grade: ${error.message}`);
    }
  }

  static async softDelete(gradeId, userId) {
    return await this.executeWithTransaction(async (connection) => {
      const q = `UPDATE ${this.TABLE_NAME}
        SET STATUS = 'INACTIVE',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE GRADE_ID = :3`;

      const r = await connection.execute(q, [userId || 'SYSTEM', new Date(), gradeId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      const rowsAffected = r.rowsAffected || r.rowCount || 0;
      if (rowsAffected === 0) throw new Error(`No grade found with ID: ${gradeId}`);
      return true;
    });
  }

  static async hardDelete(gradeId) {
    return await this.executeWithTransaction(async (connection) => {
      const q = `DELETE FROM ${this.TABLE_NAME} WHERE GRADE_ID = :1`;
      const r = await connection.execute(q, [gradeId], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const rowsAffected = r.rowsAffected || r.rowCount || 0;
      if (rowsAffected === 0) throw new Error(`No grade found with ID: ${gradeId}`);
      return { success: true };
    });
  }
}

export default GradeModel;
