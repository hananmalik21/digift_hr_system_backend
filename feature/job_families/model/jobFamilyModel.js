import db from '../../../config/db.js';
import oracledb from 'oracledb';

class JobFamilyModel {
  static TABLE_NAME = 'ENT.JOB_FAMILIES';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) converted[newKey] = value;
      else if (value instanceof Date || value instanceof Buffer) converted[newKey] = value;
      else if (typeof value === 'object') converted[newKey] = this.convertKeysToSnakeCase(value);
      else converted[newKey] = value;
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
      let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} jf`;
      let dataQuery = `SELECT
        jf.JOB_FAMILY_ID,
        jf.JOB_FAMILY_CODE,
        jf.JOB_FAMILY_NAME_EN,
        jf.JOB_FAMILY_NAME_AR,
        jf.DESCRIPTION,
        jf.STATUS,
        jf.CREATED_BY,
        jf.CREATED_DATE,
        jf.LAST_UPDATED_BY,
        jf.LAST_UPDATED_DATE
      FROM ${this.TABLE_NAME} jf`;

      const conditions = [];
      const bindParams = [];
      let paramIndex = 1;

      if (filters.jobFamilyId) {
        conditions.push(`jf.JOB_FAMILY_ID = :${paramIndex}`);
        bindParams.push(filters.jobFamilyId);
        paramIndex++;
      }

      if (filters.search) {
        const v = `%${filters.search}%`;
        conditions.push(`(
          UPPER(jf.JOB_FAMILY_CODE) LIKE UPPER(:${paramIndex}) OR
          UPPER(jf.JOB_FAMILY_NAME_EN) LIKE UPPER(:${paramIndex + 1}) OR
          UPPER(jf.JOB_FAMILY_NAME_AR) LIKE UPPER(:${paramIndex + 2})
        )`);
        bindParams.push(v, v, v);
        paramIndex += 3;
      }

      if (filters.jobFamilyCode) {
        conditions.push(`UPPER(jf.JOB_FAMILY_CODE) = UPPER(:${paramIndex})`);
        bindParams.push(filters.jobFamilyCode);
        paramIndex++;
      }

      if (filters.jobFamilyName) {
        conditions.push(`(
          UPPER(jf.JOB_FAMILY_NAME_EN) LIKE UPPER(:${paramIndex}) OR
          UPPER(jf.JOB_FAMILY_NAME_AR) LIKE UPPER(:${paramIndex})
        )`);
        bindParams.push(`%${filters.jobFamilyName}%`);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`jf.STATUS = :${paramIndex}`);
        bindParams.push(filters.status);
        paramIndex++;
      }

      if (filters.isActive !== undefined) {
        conditions.push(`jf.STATUS = :${paramIndex}`);
        bindParams.push(filters.isActive ? 'ACTIVE' : 'INACTIVE');
        paramIndex++;
      }

      const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      countQuery += whereClause;
      dataQuery += whereClause;

      dataQuery += ` ORDER BY jf.CREATED_DATE DESC, jf.JOB_FAMILY_ID DESC`;

      const pagination = filters.pagination;
      let totalCount = 0;

      const countBindParams = [...bindParams];
      const dataBindParams = [...bindParams];

      if (pagination?.page && pagination?.pageSize) {
        const countResult = await this.executeQuery(countQuery, countBindParams);
        totalCount = countResult.rows?.[0]?.total || 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataQuery += ` OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY`;
        dataBindParams.push(offset, pagination.pageSize);
      }

      const result = await this.executeQuery(dataQuery, dataBindParams);
      const jobFamilies = result.rows || [];

      if (pagination?.page && pagination?.pageSize) {
        return { job_families: jobFamilies, total: totalCount };
      }

      return jobFamilies;
    } catch (error) {
      console.error('Error in findAll:', error);
      throw new Error(`Failed to fetch job families: ${error.message}`);
    }
  }

  static async findById(jobFamilyId) {
    try {
      const query = `SELECT
        JOB_FAMILY_ID,
        JOB_FAMILY_CODE,
        JOB_FAMILY_NAME_EN,
        JOB_FAMILY_NAME_AR,
        DESCRIPTION,
        STATUS,
        CREATED_BY,
        CREATED_DATE,
        LAST_UPDATED_BY,
        LAST_UPDATED_DATE
      FROM ${this.TABLE_NAME}
      WHERE JOB_FAMILY_ID = :1`;

      const result = await this.executeQuery(query, [jobFamilyId]);
      return result.rows?.length ? result.rows[0] : null;
    } catch (error) {
      console.error('Error in findById:', error);
      throw new Error(`Failed to fetch job family: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        let id;
        try {
          const seqQuery = `SELECT ENT.JOB_FAMILIES_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`;
          const seqResult = await connection.execute(seqQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          id = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxQuery = `SELECT NVL(MAX(JOB_FAMILY_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`;
          const maxResult = await connection.execute(maxQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
          id = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();

        const query = `INSERT INTO ${this.TABLE_NAME} (
          JOB_FAMILY_ID,
          JOB_FAMILY_CODE,
          JOB_FAMILY_NAME_EN,
          JOB_FAMILY_NAME_AR,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE
        ) VALUES (
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10
        )`;

        const bindParams = [
          id,
          data.JOB_FAMILY_CODE || null,
          data.JOB_FAMILY_NAME_EN || null,
          data.JOB_FAMILY_NAME_AR || null,
          data.DESCRIPTION || null,
          data.STATUS || 'ACTIVE',
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now
        ];

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const selectQuery = `SELECT
          JOB_FAMILY_ID,
          JOB_FAMILY_CODE,
          JOB_FAMILY_NAME_EN,
          JOB_FAMILY_NAME_AR,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE
        FROM ${this.TABLE_NAME}
        WHERE JOB_FAMILY_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in create:', error);

      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';

        const e = new Error('A job family with the same JOB_FAMILY_CODE already exists.');
        e.errorNum = 1;
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraintName;
        e.columns = 'JOB_FAMILY_CODE';
        e.userMessage = e.message;
        throw e;
      }

      if (error.errorNum === 1400 || error.message?.includes('ORA-01400')) {
        const e = new Error('One or more required fields are missing or null.');
        e.errorNum = 1400;
        e.code = 'NOT_NULL_CONSTRAINT';
        e.statusCode = 400;
        e.userMessage = e.message;
        throw e;
      }

      throw new Error(`Failed to create job family: ${error.message}`);
    }
  }

  static async update(jobFamilyId, data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        const updateFields = [];
        const bindParams = [];
        let paramIndex = 1;

        if (data.JOB_FAMILY_CODE !== undefined) {
          updateFields.push(`JOB_FAMILY_CODE = :${paramIndex}`);
          bindParams.push(data.JOB_FAMILY_CODE);
          paramIndex++;
        }
        if (data.JOB_FAMILY_NAME_EN !== undefined) {
          updateFields.push(`JOB_FAMILY_NAME_EN = :${paramIndex}`);
          bindParams.push(data.JOB_FAMILY_NAME_EN);
          paramIndex++;
        }
        if (data.JOB_FAMILY_NAME_AR !== undefined) {
          updateFields.push(`JOB_FAMILY_NAME_AR = :${paramIndex}`);
          bindParams.push(data.JOB_FAMILY_NAME_AR);
          paramIndex++;
        }
        if (data.DESCRIPTION !== undefined) {
          updateFields.push(`DESCRIPTION = :${paramIndex}`);
          bindParams.push(data.DESCRIPTION);
          paramIndex++;
        }
        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${paramIndex}`);
          bindParams.push(String(data.STATUS).toUpperCase());
          paramIndex++;
        }

        if (updateFields.length === 0) throw new Error('No fields to update');

        updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
        bindParams.push(userId || 'SYSTEM');
        paramIndex++;

        updateFields.push(`LAST_UPDATED_DATE = :${paramIndex}`);
        bindParams.push(new Date());
        paramIndex++;

        bindParams.push(jobFamilyId);
        const query = `UPDATE ${this.TABLE_NAME} SET ${updateFields.join(', ')} WHERE JOB_FAMILY_ID = :${paramIndex}`;

        await connection.execute(query, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const selectQuery = `SELECT
          JOB_FAMILY_ID,
          JOB_FAMILY_CODE,
          JOB_FAMILY_NAME_EN,
          JOB_FAMILY_NAME_AR,
          DESCRIPTION,
          STATUS,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE
        FROM ${this.TABLE_NAME}
        WHERE JOB_FAMILY_ID = :1`;

        const selectResult = await connection.execute(selectQuery, [jobFamilyId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        return this.convertKeysToSnakeCase(selectResult.rows[0]);
      });
    } catch (error) {
      console.error('Error in update:', error);

      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraintMatch = error.message?.match(/\(([A-Z_][A-Z0-9_.]+)\)/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'UNKNOWN';

        const e = new Error('A job family with the same JOB_FAMILY_CODE already exists.');
        e.errorNum = 1;
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraintName;
        e.columns = 'JOB_FAMILY_CODE';
        e.userMessage = e.message;
        throw e;
      }

      throw new Error(`Failed to update job family: ${error.message}`);
    }
  }

  static async softDelete(jobFamilyId, userId) {
    try {
      await this.executeWithTransaction(async (connection) => {
        const query = `UPDATE ${this.TABLE_NAME}
          SET STATUS = 'INACTIVE',
              LAST_UPDATED_BY = :1,
              LAST_UPDATED_DATE = :2
          WHERE JOB_FAMILY_ID = :3`;

        const result = await connection.execute(query, [userId || 'SYSTEM', new Date(), jobFamilyId], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const rowsAffected = result.rowsAffected || result.rowCount || 0;
        if (rowsAffected === 0) throw new Error(`No job family found with ID: ${jobFamilyId}`);
      });

      return true;
    } catch (error) {
      console.error('Error in softDelete:', error);
      throw new Error(`Failed to delete job family: ${error.message}`);
    }
  }

  static async hardDelete(jobFamilyId) {
    try {
      await this.executeWithTransaction(async (connection) => {
        const query = `DELETE FROM ${this.TABLE_NAME} WHERE JOB_FAMILY_ID = :1`;
        const result = await connection.execute(query, [jobFamilyId], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const rowsAffected = result.rowsAffected || result.rowCount || 0;
        if (rowsAffected === 0) throw new Error(`No job family found with ID: ${jobFamilyId}`);
      });

      return { success: true };
    } catch (error) {
      console.error('Error in hardDelete:', error);

      if (error.errorNum === 2292 || error.message?.includes('ORA-02292')) {
        const constraintName = error.message?.match(/\(([^)]+)\)/)?.[1] || 'UNKNOWN';
        const e = new Error('Cannot delete job family: This record is referenced by other records.');
        e.errorNum = 2292;
        e.code = 'FOREIGN_KEY_CONSTRAINT';
        e.constraint = constraintName;
        e.suggestion = 'Use soft delete to deactivate this record instead of permanently deleting it.';
        throw e;
      }

      throw new Error(`Failed to delete job family: ${error.message}`);
    }
  }
}

export default JobFamilyModel;
