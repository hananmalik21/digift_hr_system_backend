import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { validateMinMaxGradeRange } from '../../../../utils/gradeUtils.js';

class JobLevelsModel {
  static TABLE_NAME = 'ENT.JOB_LEVELS';
  static POSITIONS_TABLE = 'ENT.POSITIONS';

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k.toLowerCase()] =
        (typeof v === 'object' && v !== null && !(v instanceof Date) && !(v instanceof Buffer))
          ? this.convertKeysToSnakeCase(v)
          : v;
    }
    return out;
  }

  static nestGradeObjects(row) {
    if (!row) return row;

    const min_grade = row.min_grade_id ? {
      grade_id: row.min_grade_id,
      grade_number: row.min_grade_number,
      grade_category: row.min_grade_category,
      step_1_salary: row.min_step_1_salary,
      step_2_salary: row.min_step_2_salary,
      step_3_salary: row.min_step_3_salary,
      step_4_salary: row.min_step_4_salary,
      step_5_salary: row.min_step_5_salary,
      status: row.min_grade_status,
      description: row.min_grade_description
    } : null;

    const max_grade = row.max_grade_id ? {
      grade_id: row.max_grade_id,
      grade_number: row.max_grade_number,
      grade_category: row.max_grade_category,
      step_1_salary: row.max_step_1_salary,
      step_2_salary: row.max_step_2_salary,
      step_3_salary: row.max_step_3_salary,
      step_4_salary: row.max_step_4_salary,
      step_5_salary: row.max_step_5_salary,
      status: row.max_grade_status,
      description: row.max_grade_description
    } : null;

    const cleaned = { ...row };
    delete cleaned.min_grade_number;
    delete cleaned.min_grade_category;
    delete cleaned.min_step_1_salary;
    delete cleaned.min_step_2_salary;
    delete cleaned.min_step_3_salary;
    delete cleaned.min_step_4_salary;
    delete cleaned.min_step_5_salary;
    delete cleaned.min_grade_status;
    delete cleaned.min_grade_description;

    delete cleaned.max_grade_number;
    delete cleaned.max_grade_category;
    delete cleaned.max_step_1_salary;
    delete cleaned.max_step_2_salary;
    delete cleaned.max_step_3_salary;
    delete cleaned.max_step_4_salary;
    delete cleaned.max_step_5_salary;
    delete cleaned.max_grade_status;
    delete cleaned.max_grade_description;

    return { ...cleaned, min_grade, max_grade };
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

  static baseSelect() {
    return `SELECT
      jl.JOB_LEVEL_ID,
      jl.TENANT_ID,
      jl.LEVEL_NAME_EN,
      jl.LEVEL_CODE,
      jl.DESCRIPTION,
      jl.MIN_GRADE_ID,
      jl.MAX_GRADE_ID,
      jl.STATUS,
      jl.CREATED_BY,
      jl.CREATED_DATE,
      jl.LAST_UPDATED_BY,
      jl.LAST_UPDATED_DATE,
      jl.LAST_UPDATE_LOGIN,

      gmin.GRADE_NUMBER   AS MIN_GRADE_NUMBER,
      gmin.GRADE_CATEGORY AS MIN_GRADE_CATEGORY,
      gmin.STEP_1_SALARY  AS MIN_STEP_1_SALARY,
      gmin.STEP_2_SALARY  AS MIN_STEP_2_SALARY,
      gmin.STEP_3_SALARY  AS MIN_STEP_3_SALARY,
      gmin.STEP_4_SALARY  AS MIN_STEP_4_SALARY,
      gmin.STEP_5_SALARY  AS MIN_STEP_5_SALARY,
      gmin.STATUS         AS MIN_GRADE_STATUS,
      gmin.DESCRIPTION    AS MIN_GRADE_DESCRIPTION,

      gmax.GRADE_NUMBER   AS MAX_GRADE_NUMBER,
      gmax.GRADE_CATEGORY AS MAX_GRADE_CATEGORY,
      gmax.STEP_1_SALARY  AS MAX_STEP_1_SALARY,
      gmax.STEP_2_SALARY  AS MAX_STEP_2_SALARY,
      gmax.STEP_3_SALARY  AS MAX_STEP_3_SALARY,
      gmax.STEP_4_SALARY  AS MAX_STEP_4_SALARY,
      gmax.STEP_5_SALARY  AS MAX_STEP_5_SALARY,
      gmax.STATUS         AS MAX_GRADE_STATUS,
      gmax.DESCRIPTION    AS MAX_GRADE_DESCRIPTION

    FROM ${this.TABLE_NAME} jl
    LEFT JOIN ENT.GRADES gmin ON jl.MIN_GRADE_ID = gmin.GRADE_ID
    LEFT JOIN ENT.GRADES gmax ON jl.MAX_GRADE_ID = gmax.GRADE_ID`;
  }

  /** Normalized job_level_id from a row (handles snake_case or UPPER from DB). */
  static _jobLevelIdFrom(row) {
    const id = row?.job_level_id ?? row?.JOB_LEVEL_ID;
    return id != null ? Number(id) : null;
  }

  /**
   * Returns position counts keyed by job_level_id for the given job level IDs (tenant-scoped).
   * Used to show how many positions use each job level. Deduplicates IDs before querying.
   */
  static async getPositionCountsByJobLevelIds(tenantId, jobLevelIds) {
    const uniqueIds = jobLevelIds?.length ? [...new Set(jobLevelIds.map((id) => Number(id)).filter(Number.isFinite))] : [];
    if (!uniqueIds.length) return new Map();
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) return new Map();

    const placeholders = uniqueIds.map((_, i) => `:${i + 2}`).join(', ');
    const q = `
      SELECT JOB_LEVEL_ID AS JOB_LEVEL_ID, COUNT(*) AS POSITION_COUNT
      FROM ${this.POSITIONS_TABLE}
      WHERE TENANT_ID = :1 AND JOB_LEVEL_ID IN (${placeholders})
      GROUP BY JOB_LEVEL_ID
    `;
    const bind = [tenantIdNum, ...uniqueIds];
    const r = await this.executeQuery(q, bind);
    const map = new Map();
    for (const row of r.rows || []) {
      const id = this._jobLevelIdFrom(row);
      const count = row.POSITION_COUNT ?? row.position_count ?? 0;
      if (id != null) map.set(id, Number(count));
    }
    return map;
  }

  /**
   * Builds a validation error with consistent code and status for grade-range failures.
   */
  static _gradeRangeError(message, code = 'GRADE_RANGE_INVALID') {
    const e = new Error(message);
    e.code = code;
    e.statusCode = 400;
    e.userMessage = e.message;
    return e;
  }

  /**
   * Validates that min and max grade IDs exist and form a valid range (same family, max >= min).
   * Single round-trip query; supports min_grade_id = max_grade_id (one row).
   */
  static async validateGradeRange(connection, minGradeId, maxGradeId) {
    const ids = minGradeId === maxGradeId ? [minGradeId] : [minGradeId, maxGradeId];
    const q = `
      SELECT grade_id, grade_number
      FROM ent.grades
      WHERE grade_id IN (${ids.map((_, i) => `:${i + 1}`).join(', ')})
    `;
    const r = await connection.execute(q, ids, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (!r.rows || r.rows.length < ids.length) {
      throw this._gradeRangeError(
        'min_grade_id or max_grade_id does not exist in grades',
        'FOREIGN_KEY_CONSTRAINT'
      );
    }

    const minRow = r.rows.find((x) => Number(x.GRADE_ID) === Number(minGradeId));
    const maxRow = minGradeId === maxGradeId ? minRow : r.rows.find((x) => Number(x.GRADE_ID) === Number(maxGradeId));

    if (!minRow || !maxRow) {
      throw this._gradeRangeError(
        'min_grade_id or max_grade_id does not exist in grades',
        'FOREIGN_KEY_CONSTRAINT'
      );
    }

    const minGradeNumber = minRow.GRADE_NUMBER ?? minRow.grade_number ?? '';
    const maxGradeNumber = maxRow.GRADE_NUMBER ?? maxRow.grade_number ?? '';
    const rangeCheck = validateMinMaxGradeRange(minGradeNumber, maxGradeNumber);
    if (!rangeCheck.valid) {
      throw this._gradeRangeError(rangeCheck.error);
    }
  }

  /**
   * List job levels with filters and pagination. Each item includes position_count (positions using that job level).
   */
  static async findAll(filters = {}) {
    const tenantId = filters.tenant_id ?? filters.tenantId;
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }

    let countQuery = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME} jl`;
    let dataQuery = this.baseSelect();

    const conditions = [`jl.TENANT_ID = :1`];
    const bind = [tenantIdNum];
    let idx = 2;

    if (filters.search) {
      const sv = `%${filters.search}%`;
      conditions.push(`(
        UPPER(jl.LEVEL_NAME_EN) LIKE UPPER(:${idx}) OR
        UPPER(jl.LEVEL_CODE) LIKE UPPER(:${idx + 1}) OR
        UPPER(jl.DESCRIPTION) LIKE UPPER(:${idx + 2})
      )`);
      bind.push(sv, sv, sv);
      idx += 3;
    }

    if (filters.levelCode) {
      conditions.push(`UPPER(jl.LEVEL_CODE) = UPPER(:${idx})`);
      bind.push(filters.levelCode);
      idx++;
    }

    if (filters.levelName) {
      conditions.push(`UPPER(jl.LEVEL_NAME_EN) LIKE UPPER(:${idx})`);
      bind.push(`%${filters.levelName}%`);
      idx++;
    }

    if (filters.status) {
      conditions.push(`jl.STATUS = :${idx}`);
      bind.push(filters.status);
      idx++;
    }

    if (filters.isActive !== undefined) {
      conditions.push(`jl.STATUS = :${idx}`);
      bind.push(filters.isActive ? 'ACTIVE' : 'INACTIVE');
      idx++;
    }

    const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    countQuery += whereClause;
    dataQuery += whereClause;

    dataQuery += ` ORDER BY jl.CREATED_DATE DESC, jl.JOB_LEVEL_ID DESC`;

    const pagination = filters.pagination;
    const countBind = [...bind];
    const dataBind = [...bind];
    let totalCount = 0;
    let result;

    if (pagination?.page && pagination?.pageSize) {
      const offset = (pagination.page - 1) * pagination.pageSize;
      dataQuery += ` OFFSET :${idx} ROWS FETCH NEXT :${idx + 1} ROWS ONLY`;
      dataBind.push(offset, pagination.pageSize);
      const [dataResult, countResult] = await Promise.all([
        this.executeQuery(dataQuery, dataBind),
        this.executeQuery(countQuery, countBind),
      ]);
      totalCount = countResult.rows?.[0]?.total ?? 0;
      result = dataResult;
    } else {
      result = await this.executeQuery(dataQuery, dataBind);
    }
    const rows = result.rows || [];
    const normalized = rows.map(r => this.nestGradeObjects(r));

    const jobLevelIds = normalized.map((jl) => this._jobLevelIdFrom(jl)).filter((id) => id != null);
    const positionCountMap = await this.getPositionCountsByJobLevelIds(tenantIdNum, jobLevelIds);
    const withCount = normalized.map((jl) => ({
      ...jl,
      position_count: positionCountMap.get(this._jobLevelIdFrom(jl)) ?? 0
    }));

    if (pagination?.page && pagination?.pageSize) {
      return { job_levels: withCount, total: totalCount };
    }
    return withCount;
  }

  /**
   * Get one job level by id. Includes position_count (number of positions using this job level).
   */
  static async findById(jobLevelId, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }
    const q = `${this.baseSelect()} WHERE jl.JOB_LEVEL_ID = :1 AND jl.TENANT_ID = :2`;
    const r = await this.executeQuery(q, [jobLevelId, tenantIdNum]);
    const row = r.rows?.[0] || null;
    if (!row) return null;
    const jobLevel = this.nestGradeObjects(row);
    const positionCountMap = await this.getPositionCountsByJobLevelIds(tenantIdNum, [jobLevelId]);
    jobLevel.position_count = positionCountMap.get(Number(jobLevelId)) ?? 0;
    return jobLevel;
  }

  static async create(data, userId) {
    const tenantId = data.tenant_id ?? data.TENANT_ID;
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required in request body');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }

    try {
      return await this.executeWithTransaction(async (connection) => {
        const minGradeId = parseInt(data.MIN_GRADE_ID, 10);
        const maxGradeId = parseInt(data.MAX_GRADE_ID, 10);
        if (!Number.isFinite(minGradeId) || !Number.isFinite(maxGradeId)) {
          const e = new Error('min_grade_id and max_grade_id must be valid integers');
          e.code = 'VALIDATION_ERROR';
          e.statusCode = 400;
          throw e;
        }
        await this.validateGradeRange(connection, minGradeId, maxGradeId);

        let id;
        try {
          const seq = await connection.execute(
            `SELECT ENT.JOB_LEVELS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          id = seq.rows[0].NEXT_ID;
        } catch {
          const max = await connection.execute(
            `SELECT NVL(MAX(JOB_LEVEL_ID),0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          id = max.rows[0].NEXT_ID;
        }

        const now = new Date();

        const insert = `INSERT INTO ${this.TABLE_NAME} (
          JOB_LEVEL_ID, TENANT_ID, LEVEL_NAME_EN, LEVEL_CODE, DESCRIPTION,
          MIN_GRADE_ID, MAX_GRADE_ID, STATUS,
          CREATED_BY, CREATED_DATE, LAST_UPDATED_BY, LAST_UPDATED_DATE, LAST_UPDATE_LOGIN
        ) VALUES (
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13
        )`;

        const bind = [
          id,
          tenantIdNum,
          data.LEVEL_NAME_EN,
          data.LEVEL_CODE,
          data.DESCRIPTION || null,
          minGradeId,
          maxGradeId,
          (data.STATUS || 'ACTIVE').toUpperCase(),
          userId || 'SYSTEM',
          now,
          userId || 'SYSTEM',
          now,
          data.LAST_UPDATE_LOGIN || 'SYSTEM'
        ];

        await connection.execute(insert, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const select = await connection.execute(
          `${this.baseSelect()} WHERE jl.JOB_LEVEL_ID = :1 AND jl.TENANT_ID = :2`,
          [id, tenantIdNum],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.nestGradeObjects(this.convertKeysToSnakeCase(select.rows[0]));
      });
    } catch (error) {
      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraint = error.message?.match(/\(([A-Z0-9_.]+)\)/)?.[1] || 'UNKNOWN';
        const e = new Error('level_code or level_name_en already exists');
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraint;
        e.columns = 'level_code, level_name_en';
        e.userMessage = e.message;
        throw e;
      }

      if (error.code) throw error;
      throw new Error(`Failed to create job level: ${error.message}`);
    }
  }

  static async update(jobLevelId, data, userId, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }
    const payload = { ...data };
    delete payload.tenant_id;
    delete payload.TENANT_ID;

    try {
      return await this.executeWithTransaction(async (connection) => {
        const minProvided = payload.MIN_GRADE_ID !== undefined;
        const maxProvided = payload.MAX_GRADE_ID !== undefined;

        if (minProvided || maxProvided) {
          const current = await connection.execute(
            `SELECT MIN_GRADE_ID, MAX_GRADE_ID FROM ${this.TABLE_NAME} WHERE JOB_LEVEL_ID = :1 AND TENANT_ID = :2`,
            [jobLevelId, tenantIdNum],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );

          if (!current.rows || !current.rows.length) {
            throw new Error(`No job level found with ID: ${jobLevelId}`);
          }

          const currentMin = current.rows[0].MIN_GRADE_ID;
          const currentMax = current.rows[0].MAX_GRADE_ID;

          const minId = minProvided ? Number(payload.MIN_GRADE_ID) : Number(currentMin);
          const maxId = maxProvided ? Number(payload.MAX_GRADE_ID) : Number(currentMax);

          await this.validateGradeRange(connection, minId, maxId);
        }

        const fields = [];
        const bind = [];
        let idx = 1;

        const setIf = (col, val, tf) => {
          if (val !== undefined) {
            fields.push(`${col} = :${idx}`);
            bind.push(tf ? tf(val) : val);
            idx++;
          }
        };

        setIf('LEVEL_NAME_EN', payload.LEVEL_NAME_EN);
        setIf('LEVEL_CODE', payload.LEVEL_CODE);
        setIf('DESCRIPTION', payload.DESCRIPTION);
        setIf('MIN_GRADE_ID', payload.MIN_GRADE_ID, v => Number(v));
        setIf('MAX_GRADE_ID', payload.MAX_GRADE_ID, v => Number(v));
        setIf('STATUS', payload.STATUS, v => String(v).toUpperCase());
        setIf('LAST_UPDATE_LOGIN', payload.LAST_UPDATE_LOGIN);

        if (!fields.length) throw new Error('No fields to update');

        fields.push(`LAST_UPDATED_BY = :${idx}`);
        bind.push(userId || 'SYSTEM');
        idx++;

        fields.push(`LAST_UPDATED_DATE = :${idx}`);
        bind.push(new Date());
        idx++;

        bind.push(jobLevelId, tenantIdNum);

        const q = `UPDATE ${this.TABLE_NAME} SET ${fields.join(', ')} WHERE JOB_LEVEL_ID = :${idx} AND TENANT_ID = :${idx + 1}`;
        await connection.execute(q, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const select = await connection.execute(
          `${this.baseSelect()} WHERE jl.JOB_LEVEL_ID = :1 AND jl.TENANT_ID = :2`,
          [jobLevelId, tenantIdNum],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        return this.nestGradeObjects(this.convertKeysToSnakeCase(select.rows[0]));
      });
    } catch (error) {
      const isUnique =
        error.errorNum === 1 ||
        error.message?.includes('ORA-00001') ||
        /unique constraint/i.test(error.message || '');

      if (isUnique) {
        const constraint = error.message?.match(/\(([A-Z0-9_.]+)\)/)?.[1] || 'UNKNOWN';
        const e = new Error('level_code or level_name_en already exists');
        e.code = 'UNIQUE_CONSTRAINT_VIOLATION';
        e.statusCode = 409;
        e.constraint = constraint;
        e.columns = 'level_code, level_name_en';
        e.userMessage = e.message;
        throw e;
      }

      if (error.code) throw error;
      throw new Error(`Failed to update job level: ${error.message}`);
    }
  }

  static async softDelete(jobLevelId, userId, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }
    return await this.executeWithTransaction(async (connection) => {
      const q = `UPDATE ${this.TABLE_NAME}
        SET STATUS = 'INACTIVE',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE JOB_LEVEL_ID = :3 AND TENANT_ID = :4`;

      const r = await connection.execute(q, [userId || 'SYSTEM', new Date(), jobLevelId, tenantIdNum], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      const rows = r.rowsAffected || r.rowCount || 0;
      if (rows === 0) throw new Error(`No job level found with ID: ${jobLevelId}`);
      return true;
    });
  }

  static async hardDelete(jobLevelId, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      throw new Error('tenant_id is required');
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      throw new Error('tenant_id must be a valid positive number');
    }
    return await this.executeWithTransaction(async (connection) => {
      const q = `DELETE FROM ${this.TABLE_NAME} WHERE JOB_LEVEL_ID = :1 AND TENANT_ID = :2`;
      const r = await connection.execute(q, [jobLevelId, tenantIdNum], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const rows = r.rowsAffected || r.rowCount || 0;
      if (rows === 0) throw new Error(`No job level found with ID: ${jobLevelId}`);
      return { success: true };
    });
  }
}

export default JobLevelsModel;
