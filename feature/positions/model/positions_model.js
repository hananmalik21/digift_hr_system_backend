import db from '../../../config/db.js';
import oracledb from 'oracledb';

class PositionsModel {
  static TABLE_NAME = 'ENT.POSITIONS';

  // ----------------------------
  // helpers
  // ----------------------------
  static toLowerCaseKeys(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((x) => this.toLowerCaseKeys(x));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = this.toLowerCaseKeys(v);
    return out;
  }

  static async executeQuery(sql, bindParams = [], options = {}) {
    const result = await db.executeQuery(sql, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
    if (result?.rows) result.rows = this.toLowerCaseKeys(result.rows);
    return result;
  }

  static async executeWithTransaction(cb) {
    let connection;
    try {
      connection = await db.getConnection();
      const out = await cb(connection);
      await connection.commit();
      return out;
    } catch (e) {
      if (connection?.rollback) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      throw e;
    } finally {
      if (connection?.close) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  static isMissing(v) {
    return v === undefined || v === null || v === '';
  }

  static strRequired(v, field) {
    if (this.isMissing(v) || String(v).trim() === '') {
      const err = new Error(`${field} is required`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return String(v).trim();
  }

  static numRequired(v, field) {
    if (this.isMissing(v)) {
      const err = new Error(`${field} is required and must be a valid number`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const n = Number(v);
    if (Number.isNaN(n)) {
      const err = new Error(`${field} must be a valid number`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return n;
  }

  static numOptional(v) {
    if (this.isMissing(v)) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  static intOptional(v, field, { min = null, max = null } = {}) {
    if (this.isMissing(v)) return null;
    const n = Number(v);
    if (!Number.isInteger(n)) {
      const err = new Error(`${field} must be an integer`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    if (min !== null && n < min) {
      const err = new Error(`${field} must be >= ${min}`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    if (max !== null && n > max) {
      const err = new Error(`${field} must be <= ${max}`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return n;
  }

  static async nextId(connection) {
    try {
      const r = await connection.execute(`SELECT ENT.POSITIONS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      return r.rows[0].NEXT_ID;
    } catch (_) {
      const r = await connection.execute(
        `SELECT NVL(MAX(POSITION_ID),0)+1 AS NEXT_ID FROM ${this.TABLE_NAME}`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows[0].NEXT_ID;
    }
  }

  // ----------------------------
  // Org path from org_unit_id (parents)
  // ----------------------------
  static async fetchOrgPath(orgUnitId) {
    const id = this.numRequired(orgUnitId, 'org_unit_id');
    const sql = `
      SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.LEVEL_CODE,
        ou.PARENT_ORG_UNIT_ID,
        LEVEL AS HIERARCHY_LEVEL
      FROM ENT.ORG_UNITS ou
      START WITH ou.ORG_UNIT_ID = :1
      CONNECT BY PRIOR ou.PARENT_ORG_UNIT_ID = ou.ORG_UNIT_ID
      ORDER BY LEVEL DESC
    `;
    const r = await this.executeQuery(sql, [id]);
    return (r.rows || []).map((x) => ({
      level_code: x.level_code,
      org_unit_id: x.org_unit_id,
      name_en: x.org_unit_name_en,
      name_ar: x.org_unit_name_ar,
    }));
  }

  // ----------------------------
  // Base SELECT (FIXED: STRUCTURE_NAME)
  // ----------------------------
  static selectBase() {
    return `
      SELECT
        p.POSITION_ID,
        p.POSITION_CODE,
        p.STATUS,
        p.POSITION_TITLE_EN,
        p.POSITION_TITLE_AR,

        p.ORG_STRUCTURE_ID,
        os.STRUCTURE_CODE  AS ORG_STRUCTURE_CODE_REF,
        os.STRUCTURE_NAME  AS ORG_STRUCTURE_NAME_REF,

        p.ORG_UNIT_ID,
        ou.ORG_UNIT_NAME_EN AS ORG_UNIT_NAME_EN_REF,
        ou.ORG_UNIT_NAME_AR AS ORG_UNIT_NAME_AR_REF,
        ou.LEVEL_CODE       AS ORG_UNIT_LEVEL_CODE_REF,

        p.ORG_PATH_JSON,
        p.COST_CENTER,
        p.LOCATION,

        p.JOB_FAMILY_ID,
        jf.JOB_FAMILY_CODE    AS JOB_FAMILY_CODE_REF,
        jf.JOB_FAMILY_NAME_EN AS JOB_FAMILY_NAME_EN_REF,
        jf.JOB_FAMILY_NAME_AR AS JOB_FAMILY_NAME_AR_REF,

        p.JOB_LEVEL_ID,
        jl.LEVEL_CODE    AS JOB_LEVEL_CODE_REF,
        jl.LEVEL_NAME_EN AS JOB_LEVEL_NAME_EN_REF,
        jl.MIN_GRADE_ID  AS JOB_LEVEL_MIN_GRADE_ID_REF,
        jl.MAX_GRADE_ID  AS JOB_LEVEL_MAX_GRADE_ID_REF,

        p.GRADE_ID,
        g.GRADE_NUMBER   AS GRADE_NUMBER_REF,
     

        p.STEP_NO,
        p.NUMBER_OF_POSITIONS,
        p.FILLED_POSITIONS,
        p.EMPLOYMENT_TYPE,

        p.BUDGETED_MIN_KD,
        p.BUDGETED_MAX_KD,
        p.ACTUAL_AVG_KD,

        p.REPORTS_TO_POSITION_ID,
        rt.POSITION_CODE     AS REPORTS_TO_CODE_REF,
        rt.POSITION_TITLE_EN AS REPORTS_TO_TITLE_EN_REF,

        p.CREATED_BY,
        p.CREATED_DATE,
        p.LAST_UPDATED_BY,
        p.LAST_UPDATED_DATE,
        p.LAST_UPDATE_LOGIN

      FROM ${this.TABLE_NAME} p
      JOIN ENT.HR_ORG_STRUCTURES os ON p.ORG_STRUCTURE_ID = os.STRUCTURE_ID
      JOIN ENT.ORG_UNITS ou         ON p.ORG_UNIT_ID      = ou.ORG_UNIT_ID
      JOIN ENT.JOB_FAMILIES jf      ON p.JOB_FAMILY_ID    = jf.JOB_FAMILY_ID
      JOIN ENT.JOB_LEVELS jl        ON p.JOB_LEVEL_ID     = jl.JOB_LEVEL_ID
      JOIN ENT.GRADES g             ON p.GRADE_ID         = g.GRADE_ID
      LEFT JOIN ${this.TABLE_NAME} rt ON p.REPORTS_TO_POSITION_ID = rt.POSITION_ID
    `;
  }

  static shape(row) {
    if (!row) return null;

    // Parse org_path_json if stored
    let org_path_json = row.org_path_json;
    if (typeof org_path_json === 'string') {
      try {
        org_path_json = JSON.parse(org_path_json);
      } catch (_) {
        // keep as string if not valid json
      }
    }

    const shaped = {
      ...row,
      org_path_json,
      org_structure: {
        structure_id: row.org_structure_id,
        structure_code: row.org_structure_code_ref ?? null,
        structure_name: row.org_structure_name_ref ?? null,
      },
      org_unit: {
        org_unit_id: row.org_unit_id,
        name_en: row.org_unit_name_en_ref ?? null,
        name_ar: row.org_unit_name_ar_ref ?? null,
        level_code: row.org_unit_level_code_ref ?? null,
      },
      job_family: {
        job_family_id: row.job_family_id,
        job_family_code: row.job_family_code_ref ?? null,
        job_family_name_en: row.job_family_name_en_ref ?? null,
        job_family_name_ar: row.job_family_name_ar_ref ?? null,
      },
      job_level: {
        job_level_id: row.job_level_id,
        level_code: row.job_level_code_ref ?? null,
        level_name_en: row.job_level_name_en_ref ?? null,
        min_grade_id: row.job_level_min_grade_id_ref ?? null,
        max_grade_id: row.job_level_max_grade_id_ref ?? null,
      },
      grade: {
        grade_id: row.grade_id,
        grade_number: row.grade_number_ref ?? null,

      },
      reports_to: row.reports_to_position_id
        ? {
            position_id: row.reports_to_position_id,
            position_code: row.reports_to_code_ref ?? null,
            position_title_en: row.reports_to_title_en_ref ?? null,
          }
        : null,
    };

    // remove *_ref fields
    for (const k of Object.keys(shaped)) {
      if (k.endsWith('_ref')) delete shaped[k];
    }

    return shaped;
  }

  static shapeMany(rows = []) {
    return rows.map((r) => this.shape(r));
  }

  // ----------------------------
  // GET ALL (paginated)
  // ----------------------------
  static async findAll(filters = {}) {
    const page = Number(filters?.pagination?.page || 1);
    const pageSize = Math.min(100, Number(filters?.pagination?.pageSize || 10));

    const where = [];
    const binds = [];
    let i = 1;

    if (filters.search) {
      const v = `%${filters.search}%`;
      where.push(`(
        UPPER(p.POSITION_CODE) LIKE UPPER(:${i}) OR
        UPPER(p.POSITION_TITLE_EN) LIKE UPPER(:${i + 1}) OR
        UPPER(p.POSITION_TITLE_AR) LIKE UPPER(:${i + 2})
      )`);
      binds.push(v, v, v);
      i += 3;
    }

    if (filters.status) {
      where.push(`p.STATUS = :${i}`);
      binds.push(String(filters.status).toUpperCase());
      i++;
    }

    const numFilterCols = ['org_structure_id', 'org_unit_id', 'job_family_id', 'job_level_id', 'grade_id'];
    for (const f of numFilterCols) {
      if (!this.isMissing(filters[f])) {
        where.push(`p.${f.toUpperCase()} = :${i}`);
        binds.push(this.numRequired(filters[f], f));
        i++;
      }
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    // Count
    const countSql = `SELECT COUNT(*) AS TOTAL FROM ${this.TABLE_NAME} p${whereSql}`;
    const countR = await this.executeQuery(countSql, [...binds]);
    const total = countR?.rows?.[0]?.total ?? 0;

    // Data
    let dataSql = this.selectBase() + whereSql + ` ORDER BY p.CREATED_DATE DESC, p.POSITION_ID DESC`;
    const offset = (page - 1) * pageSize;
    dataSql += ` OFFSET :${i} ROWS FETCH NEXT :${i + 1} ROWS ONLY`;
    const dataBinds = [...binds, offset, pageSize];

    const r = await this.executeQuery(dataSql, dataBinds);
    const rows = r.rows || [];

    // auto org path from leaf org_unit_id
    for (const row of rows) row.org_path = await this.fetchOrgPath(row.org_unit_id);

    return { positions: this.shapeMany(rows), total };
  }

  // ----------------------------
  // GET BY ID
  // ----------------------------
  static async findById(positionId) {
    const id = this.numRequired(positionId, 'position_id');
    const sql = this.selectBase() + ` WHERE p.POSITION_ID = :1`;
    const r = await this.executeQuery(sql, [id]);
    if (!r?.rows?.length) return null;

    const row = r.rows[0];
    row.org_path = await this.fetchOrgPath(row.org_unit_id);
    return this.shape(row);
  }

  // ----------------------------
  // CREATE
  // ----------------------------
  static async create(data, userId = 'SYSTEM') {
    const payload = this.toLowerCaseKeys(data);

    // step_no optional -> default 1
    const stepNo = this.intOptional(payload.step_no, 'step_no', { min: 1, max: 5 }) ?? 1;

    // salary required and valid
    const minKd = this.numRequired(payload.budgeted_min_kd, 'budgeted_min_kd');
    const maxKd = this.numRequired(payload.budgeted_max_kd, 'budgeted_max_kd');
    if (minKd > maxKd) {
      const err = new Error('budgeted_min_kd must be <= budgeted_max_kd');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const totalPos = this.numOptional(payload.number_of_positions) ?? 1;
    const filled = this.numOptional(payload.filled_positions) ?? 0;
    if (filled < 0) {
      const err = new Error('filled_positions must be >= 0');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    if (filled > totalPos) {
      const err = new Error('filled_positions must be <= number_of_positions');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    return await this.executeWithTransaction(async (connection) => {
      try {
        const id = await this.nextId(connection);
        const now = new Date();

        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
          POSITION_ID,
          POSITION_CODE,
          STATUS,
          POSITION_TITLE_EN,
          POSITION_TITLE_AR,
          ORG_STRUCTURE_ID,
          ORG_UNIT_ID,
          ORG_PATH_JSON,
          COST_CENTER,
          LOCATION,
          JOB_FAMILY_ID,
          JOB_LEVEL_ID,
          GRADE_ID,
          STEP_NO,
          NUMBER_OF_POSITIONS,
          FILLED_POSITIONS,
          EMPLOYMENT_TYPE,
          BUDGETED_MIN_KD,
          BUDGETED_MAX_KD,
          ACTUAL_AVG_KD,
          REPORTS_TO_POSITION_ID,
          CREATED_BY,
          CREATED_DATE,
          LAST_UPDATED_BY,
          LAST_UPDATED_DATE,
          LAST_UPDATE_LOGIN
        ) VALUES (
          :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,:16,:17,:18,:19,:20,:21,:22,:23,:24,:25,:26
        )`;

        const bind = [
          id,
          this.strRequired(payload.position_code, 'position_code'),
          String(payload.status ?? 'ACTIVE').toUpperCase(),
          this.strRequired(payload.position_title_en, 'position_title_en'),
          this.strRequired(payload.position_title_ar, 'position_title_ar'),
          this.numRequired(payload.org_structure_id, 'org_structure_id'),
          this.numRequired(payload.org_unit_id, 'org_unit_id'),

          // optional snapshot if user sends it; otherwise null
          payload.org_path_json ? JSON.stringify(payload.org_path_json) : null,

          this.strRequired(payload.cost_center, 'cost_center'),
          this.strRequired(payload.location, 'location'),
          this.numRequired(payload.job_family_id, 'job_family_id'),
          this.numRequired(payload.job_level_id, 'job_level_id'),
          this.numRequired(payload.grade_id, 'grade_id'),
          stepNo,

          totalPos,
          filled,

          this.strRequired(payload.employment_type, 'employment_type'),
          minKd,
          maxKd,
          this.numOptional(payload.actual_avg_kd),

          // optional -> never NaN
          this.numOptional(payload.reports_to_position_id),

          userId,
          now,
          userId,
          now,
          payload.last_update_login ?? null,
        ];

        await connection.execute(insertSql, bind, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // return created row
        const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1`;
        const rr = await connection.execute(selectSql, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const row = this.toLowerCaseKeys(rr.rows[0]);

        row.org_path = await this.fetchOrgPath(row.org_unit_id);
        return this.shape(row);
      } catch (e) {
        const msg = e?.message || '';

        // unique constraint (position_code)
        if (e.errorNum === 1 || msg.includes('ORA-00001')) {
          const err = new Error('position_code already exists');
          err.code = 'UNIQUE_CONSTRAINT_VIOLATION';
          err.statusCode = 409;
          throw err;
        }

        // fk
        if (e.errorNum === 2291 || msg.includes('ORA-02291')) {
          const err = new Error(
            'Referenced record does not exist (org_structure_id/org_unit_id/job_family_id/job_level_id/grade_id/reports_to_position_id)'
          );
          err.code = 'FOREIGN_KEY_CONSTRAINT';
          err.statusCode = 400;
          throw err;
        }

        // not null
        if (e.errorNum === 1400 || msg.includes('ORA-01400')) {
          const err = new Error('Missing required fields');
          err.code = 'NOT_NULL_CONSTRAINT';
          err.statusCode = 400;
          throw err;
        }

        // check constraints (status/step/salary/headcount)
        if (e.errorNum === 2290 || msg.includes('ORA-02290')) {
          const err = new Error('Invalid value (status/step_no/headcount/salary constraints)');
          err.code = 'CHECK_CONSTRAINT_VIOLATION';
          err.statusCode = 400;
          throw err;
        }

        throw new Error(`Failed to create position: ${msg}`);
      }
    });
  }

  // ----------------------------
  // UPDATE
  // ----------------------------
  static async update(positionId, data, userId = 'SYSTEM') {
    const id = this.numRequired(positionId, 'position_id');
    const payload = this.toLowerCaseKeys(data);

    return await this.executeWithTransaction(async (connection) => {
      const sets = [];
      const binds = [];
      let i = 1;

      const add = (col, val) => {
        sets.push(`${col} = :${i}`);
        binds.push(val);
        i++;
      };

      if (payload.position_code !== undefined) add('POSITION_CODE', this.strRequired(payload.position_code, 'position_code'));
      if (payload.status !== undefined) add('STATUS', String(payload.status).toUpperCase());
      if (payload.position_title_en !== undefined) add('POSITION_TITLE_EN', this.strRequired(payload.position_title_en, 'position_title_en'));
      if (payload.position_title_ar !== undefined) add('POSITION_TITLE_AR', this.strRequired(payload.position_title_ar, 'position_title_ar'));

      if (payload.org_structure_id !== undefined) add('ORG_STRUCTURE_ID', this.numRequired(payload.org_structure_id, 'org_structure_id'));
      if (payload.org_unit_id !== undefined) add('ORG_UNIT_ID', this.numRequired(payload.org_unit_id, 'org_unit_id'));

      if (payload.org_path_json !== undefined) add('ORG_PATH_JSON', payload.org_path_json ? JSON.stringify(payload.org_path_json) : null);

      if (payload.cost_center !== undefined) add('COST_CENTER', this.strRequired(payload.cost_center, 'cost_center'));
      if (payload.location !== undefined) add('LOCATION', this.strRequired(payload.location, 'location'));

      if (payload.job_family_id !== undefined) add('JOB_FAMILY_ID', this.numRequired(payload.job_family_id, 'job_family_id'));
      if (payload.job_level_id !== undefined) add('JOB_LEVEL_ID', this.numRequired(payload.job_level_id, 'job_level_id'));
      if (payload.grade_id !== undefined) add('GRADE_ID', this.numRequired(payload.grade_id, 'grade_id'));

      if (payload.step_no !== undefined) {
        const step = this.intOptional(payload.step_no, 'step_no', { min: 1, max: 5 });
        add('STEP_NO', step);
      }

      if (payload.number_of_positions !== undefined) add('NUMBER_OF_POSITIONS', this.numRequired(payload.number_of_positions, 'number_of_positions'));
      if (payload.filled_positions !== undefined) add('FILLED_POSITIONS', this.numRequired(payload.filled_positions, 'filled_positions'));

      if (payload.employment_type !== undefined) add('EMPLOYMENT_TYPE', this.strRequired(payload.employment_type, 'employment_type'));

      if (payload.budgeted_min_kd !== undefined) add('BUDGETED_MIN_KD', this.numRequired(payload.budgeted_min_kd, 'budgeted_min_kd'));
      if (payload.budgeted_max_kd !== undefined) add('BUDGETED_MAX_KD', this.numRequired(payload.budgeted_max_kd, 'budgeted_max_kd'));
      if (payload.actual_avg_kd !== undefined) add('ACTUAL_AVG_KD', this.numOptional(payload.actual_avg_kd));

      if (payload.reports_to_position_id !== undefined) add('REPORTS_TO_POSITION_ID', this.numOptional(payload.reports_to_position_id));
      if (payload.last_update_login !== undefined) add('LAST_UPDATE_LOGIN', payload.last_update_login ?? null);

      if (!sets.length) {
        const err = new Error('No fields to update');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }

      add('LAST_UPDATED_BY', userId);
      add('LAST_UPDATED_DATE', new Date());

      binds.push(id);
      const sql = `UPDATE ${this.TABLE_NAME} SET ${sets.join(', ')} WHERE POSITION_ID = :${i}`;
      const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      if ((r.rowsAffected || 0) === 0) return null;

      const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1`;
      const rr = await connection.execute(selectSql, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const row = this.toLowerCaseKeys(rr.rows[0]);
      row.org_path = await this.fetchOrgPath(row.org_unit_id);
      return this.shape(row);
    });
  }

  // ----------------------------
  // SOFT DELETE
  // ----------------------------
  static async softDelete(positionId, userId = 'SYSTEM') {
    const id = this.numRequired(positionId, 'position_id');
    return await this.executeWithTransaction(async (connection) => {
      const sql = `UPDATE ${this.TABLE_NAME}
        SET STATUS = 'INACTIVE',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE POSITION_ID = :3`;

      const r = await connection.execute(sql, [userId, new Date(), id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if ((r.rowsAffected || 0) === 0) return null;

      const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1`;
      const rr = await connection.execute(selectSql, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const row = this.toLowerCaseKeys(rr.rows[0]);
      row.org_path = await this.fetchOrgPath(row.org_unit_id);
      return this.shape(row);
    });
  }

  // ----------------------------
  // HARD DELETE
  // ----------------------------
  static async hardDelete(positionId) {
    const id = this.numRequired(positionId, 'position_id');
    return await this.executeWithTransaction(async (connection) => {
      const r = await connection.execute(`DELETE FROM ${this.TABLE_NAME} WHERE POSITION_ID = :1`, [id], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if ((r.rowsAffected || 0) === 0) return null;
      return { success: true };
    });
  }
}

export default PositionsModel;
