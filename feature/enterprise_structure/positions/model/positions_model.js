// features/positions/model/positions_model.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { POSITION_ALLOWED_EMPLOYMENT_TYPES, POSITION_ALLOWED_STATUS } from '../constants/positions_constants.js';

class PositionsModel {
  static TABLE_NAME = 'ENT.POSITIONS';
  static ALLOWED_STATUS = new Set(POSITION_ALLOWED_STATUS);
  static ALLOWED_EMPLOYMENT_TYPES = new Set(POSITION_ALLOWED_EMPLOYMENT_TYPES);

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

  static isMissing(v) {
    return v === undefined || v === null || v === '';
  }

  // Accepts 32-hex or UUID-with-hyphens; returns uppercase hex32
  static normalizeGuidHex32(v) {
    return String(v ?? '').trim().replace(/-/g, '').toUpperCase();
  }

  static isHex32(s) {
    return typeof s === 'string' && /^[0-9A-F]{32}$/.test(s);
  }

  static raw16Required(v, field) {
    if (this.isMissing(v)) {
      const err = new Error(`${field} is required`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const hex = this.normalizeGuidHex32(v);
    if (!this.isHex32(hex)) {
      const err = new Error(`${field} must be a valid GUID (32-hex or UUID)`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return Buffer.from(hex, 'hex'); // RAW(16)
  }

  static raw16Optional(v, field) {
    if (this.isMissing(v)) return null;
    const hex = this.normalizeGuidHex32(v);
    if (!this.isHex32(hex)) {
      const err = new Error(`${field} must be a valid GUID (32-hex or UUID)`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return Buffer.from(hex, 'hex');
  }

  static buffersToHexInRow(row) {
    if (!row) return row;
    for (const k of Object.keys(row)) {
      if (Buffer.isBuffer(row[k])) row[k] = row[k].toString('hex').toUpperCase();
    }
    return row;
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

  static strOptional(v) {
    if (this.isMissing(v) || String(v).trim() === '') return null;
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

  static normalizeStepNumbers(v, field = 'step_no') {
    if (this.isMissing(v)) return null;
    const values = Array.isArray(v) ? v : [v];
    if (!values.length) {
      const err = new Error(`${field} must contain at least one step value`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const out = values.map((item) => {
      const n = Number(item);
      if (!Number.isInteger(n) || n < 1) {
        const err = new Error(`${field} values must be positive integers (>= 1)`);
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      return n;
    });
    return out;
  }

  static normalizeStatus(v, { required = false, defaultValue = null } = {}) {
    if (this.isMissing(v)) {
      if (required && defaultValue === null) {
        const err = new Error('status is required');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      return defaultValue;
    }
    const normalized = String(v).trim().toUpperCase();
    if (!this.ALLOWED_STATUS.has(normalized)) {
      const err = new Error(`status must be one of: ${Array.from(this.ALLOWED_STATUS).join(', ')}`);
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  static normalizeEmploymentType(v, { required = false } = {}) {
    if (this.isMissing(v)) {
      if (required) {
        const err = new Error('employment_type is required');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      return null;
    }
    const normalized = String(v).trim().toUpperCase();
    if (!this.ALLOWED_EMPLOYMENT_TYPES.has(normalized)) {
      const err = new Error(
        `employment_type must be one of: ${Array.from(this.ALLOWED_EMPLOYMENT_TYPES).join(', ')}`
      );
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    return normalized;
  }

  static async executeQuery(sql, bindParams = [], options = {}) {
    try {
      const result = await db.executeQuery(sql, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        ...options,
      });

      if (result?.rows) {
        result.rows = result.rows.map((r) => this.toLowerCaseKeys(this.buffersToHexInRow(r)));
      }
      return result;
    } catch (error) {
      // helpful debug
      console.error('SQL Query Error:', error.message);
      console.error('SQL (first 300):', String(sql).slice(0, 300));
      console.error('Binds:', bindParams?.map((b) => (Buffer.isBuffer(b) ? b.toString('hex').toUpperCase() : b)));
      throw error;
    }
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

  // ----------------------------
  // Org path from org_unit_id (parents)
  // ----------------------------
  static async fetchOrgPath(orgUnitIdHex32) {
    if (!orgUnitIdHex32) return [];
    const id = this.raw16Required(orgUnitIdHex32, 'org_unit_id');

    // NOTE: this traverses up from child -> parent
    const sql = `
      SELECT
        RAWTOHEX(ou.ORG_UNIT_ID) AS ORG_UNIT_ID,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.LEVEL_CODE,
        RAWTOHEX(ou.PARENT_ORG_UNIT_ID) AS PARENT_ORG_UNIT_ID,
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
  // Base SELECT
  // ----------------------------
  static selectBase() {
    return `
      SELECT
        RAWTOHEX(p.POSITION_ID) AS POSITION_ID,
        p.TENANT_ID,
        p.POSITION_CODE,
        p.STATUS,
        p.POSITION_TITLE_EN,
        p.POSITION_TITLE_AR,

        RAWTOHEX(p.ORG_STRUCTURE_ID) AS ORG_STRUCTURE_ID,
        os.STRUCTURE_CODE  AS ORG_STRUCTURE_CODE_REF,
        os.STRUCTURE_NAME  AS ORG_STRUCTURE_NAME_REF,

        RAWTOHEX(p.ORG_UNIT_ID) AS ORG_UNIT_ID,
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
        p.STEP_NOS_JSON,
        p.NUMBER_OF_POSITIONS,
        p.FILLED_POSITIONS,
        p.EMPLOYMENT_TYPE,

        p.BUDGETED_MIN_KD,
        p.BUDGETED_MAX_KD,
        p.ACTUAL_AVG_KD,

        RAWTOHEX(p.REPORTS_TO_POSITION_ID) AS REPORTS_TO_POSITION_ID,
        rt.POSITION_CODE     AS REPORTS_TO_CODE_REF,
        rt.POSITION_TITLE_EN AS REPORTS_TO_TITLE_EN_REF,

        p.CREATED_BY,
        p.CREATED_DATE,
        p.LAST_UPDATED_BY,
        p.LAST_UPDATED_DATE,
        p.LAST_UPDATE_LOGIN

      FROM ${this.TABLE_NAME} p
      LEFT JOIN ENT.HR_ORG_STRUCTURES os ON p.ORG_STRUCTURE_ID = os.STRUCTURE_ID
      LEFT JOIN ENT.ORG_UNITS ou         ON p.ORG_UNIT_ID      = ou.ORG_UNIT_ID
      JOIN ENT.JOB_FAMILIES jf           ON p.JOB_FAMILY_ID    = jf.JOB_FAMILY_ID
      JOIN ENT.JOB_LEVELS jl             ON p.JOB_LEVEL_ID     = jl.JOB_LEVEL_ID
      JOIN ENT.GRADES g                  ON p.GRADE_ID         = g.GRADE_ID
      LEFT JOIN ${this.TABLE_NAME} rt    ON p.REPORTS_TO_POSITION_ID = rt.POSITION_ID
    `;
  }

  static shape(row) {
    if (!row) return null;

    let org_path_json = row.org_path_json;
    if (typeof org_path_json === 'string') {
      try {
        org_path_json = JSON.parse(org_path_json);
      } catch (_) {}
    }

    let step_nos = row.step_nos_json;
    if (typeof step_nos === 'string' && step_nos.trim() !== '') {
      try {
        step_nos = JSON.parse(step_nos);
      } catch (_) {}
    }
    if (!Array.isArray(step_nos)) {
      const fallbackStep = Number(row.step_no);
      step_nos = Number.isInteger(fallbackStep) && fallbackStep > 0 ? [fallbackStep] : [];
    }

    const shaped = {
      ...row,
      org_path_json,
      step_nos,
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
    delete shaped.step_nos_json;

    return shaped;
  }

  static shapeMany(rows = []) {
    return rows.map((r) => this.shape(r));
  }

  // ----------------------------
  // GET ALL (paginated)
  // ----------------------------
  static async findAll(filters = {}) {
    const tenantId = filters.tenant_id ?? filters.tenantId;
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const page = Number(filters?.pagination?.page || 1);
    const pageSize = Math.min(100, Number(filters?.pagination?.pageSize || 10));

    const where = [`p.TENANT_ID = :${1}`];
    const binds = [tenantIdNum];
    let i = 2;

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

    // GUID filters -> bind RAW(16)
    if (filters.org_structure_id) {
      where.push(`p.ORG_STRUCTURE_ID = :${i}`);
      binds.push(this.raw16Required(filters.org_structure_id, 'org_structure_id'));
      i++;
    }
    if (filters.org_unit_id) {
      where.push(`p.ORG_UNIT_ID = :${i}`);
      binds.push(this.raw16Required(filters.org_unit_id, 'org_unit_id'));
      i++;
    }

    // numeric filters
    const numFilterCols = ['job_family_id', 'job_level_id', 'grade_id'];
    for (const f of numFilterCols) {
      if (!this.isMissing(filters[f])) {
        where.push(`p.${f.toUpperCase()} = :${i}`);
        binds.push(this.numRequired(filters[f], f));
        i++;
      }
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS TOTAL FROM ${this.TABLE_NAME} p${whereSql}`;
    let dataSql = this.selectBase() + whereSql + ` ORDER BY p.CREATED_DATE DESC`;
    const offset = (page - 1) * pageSize;
    dataSql += ` OFFSET :${i} ROWS FETCH NEXT :${i + 1} ROWS ONLY`;
    const dataBinds = [...binds, offset, pageSize];

    const [countR, r] = await Promise.all([
      this.executeQuery(countSql, [...binds]),
      this.executeQuery(dataSql, dataBinds),
    ]);
    const total = countR?.rows?.[0]?.total ?? 0;
    const rows = r.rows || [];

    const uniqueOrgUnitIds = [...new Set(rows.map((row) => row.org_unit_id).filter(Boolean))];
    const orgPathArrays = await Promise.all(
      uniqueOrgUnitIds.map((id) =>
        this.fetchOrgPath(id).catch(() => [])
      )
    );
    const orgPathByUnitId = new Map(uniqueOrgUnitIds.map((id, idx) => [id, orgPathArrays[idx]]));
    for (const row of rows) {
      row.org_path = row.org_unit_id ? (orgPathByUnitId.get(row.org_unit_id) || []) : [];
    }

    return { positions: this.shapeMany(rows), total };
  }

  // ----------------------------
  // GET BY ID
  // ----------------------------
  static async findById(positionIdHex32, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const id = this.raw16Required(positionIdHex32, 'position_id');
    const sql = this.selectBase() + ` WHERE p.POSITION_ID = :1 AND p.TENANT_ID = :2`;
    const r = await this.executeQuery(sql, [id, tenantIdNum]);
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
    const tenantId = payload.tenant_id;
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required in request body');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const requestedStepsInput = payload.step_nos !== undefined ? payload.step_nos : payload.step_no;
    const normalizedSteps = this.normalizeStepNumbers(requestedStepsInput, 'step_no');
    const stepNo = normalizedSteps?.[0] ?? 1;
    const stepNosJson = JSON.stringify(normalizedSteps ?? [stepNo]);

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

    if (totalPos < 1) {
      const err = new Error('number_of_positions must be >= 1');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
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
        const now = new Date();

        const insertSql = `
          INSERT INTO ${this.TABLE_NAME} (
            POSITION_ID,
            TENANT_ID,
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
            STEP_NOS_JSON,
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
            SYS_GUID(),
            :tenantId,
            :positionCode, :status, :positionTitleEn, :positionTitleAr,
            :orgStructureId, :orgUnitId, :orgPathJson,
            :costCenter, :location,
            :jobFamilyId, :jobLevelId, :gradeId,
            :stepNo, :stepNosJson, :numberOfPositions, :filledPositions,
            :employmentType,
            :budgetedMinKd, :budgetedMaxKd, :actualAvgKd,
            :reportsToPositionId,
            :createdBy, :createdDate, :lastUpdatedBy, :lastUpdatedDate, :lastUpdateLogin
          )
          RETURNING POSITION_ID INTO :returnPositionId
        `;

        const bindVars = {
          tenantId: { val: tenantIdNum, dir: oracledb.BIND_IN },
          positionCode: { val: this.strRequired(payload.position_code, 'position_code'), dir: oracledb.BIND_IN },
          status: { val: this.normalizeStatus(payload.status, { defaultValue: 'ACTIVE' }), dir: oracledb.BIND_IN },
          positionTitleEn: { val: this.strRequired(payload.position_title_en, 'position_title_en'), dir: oracledb.BIND_IN },
          positionTitleAr: { val: this.strOptional(payload.position_title_ar), dir: oracledb.BIND_IN },
          orgStructureId: { val: this.raw16Required(payload.org_structure_id, 'org_structure_id'), dir: oracledb.BIND_IN },
          orgUnitId: { val: this.raw16Required(payload.org_unit_id, 'org_unit_id'), dir: oracledb.BIND_IN },
          orgPathJson: { val: payload.org_path_json ? JSON.stringify(payload.org_path_json) : null, dir: oracledb.BIND_IN },
          costCenter: { val: this.strRequired(payload.cost_center, 'cost_center'), dir: oracledb.BIND_IN },
          location: { val: this.strRequired(payload.location, 'location'), dir: oracledb.BIND_IN },
          jobFamilyId: { val: this.numRequired(payload.job_family_id, 'job_family_id'), dir: oracledb.BIND_IN },
          jobLevelId: { val: this.numRequired(payload.job_level_id, 'job_level_id'), dir: oracledb.BIND_IN },
          gradeId: { val: this.numRequired(payload.grade_id, 'grade_id'), dir: oracledb.BIND_IN },
          stepNo: { val: stepNo, dir: oracledb.BIND_IN },
          stepNosJson: { val: stepNosJson, dir: oracledb.BIND_IN },
          numberOfPositions: { val: totalPos, dir: oracledb.BIND_IN },
          filledPositions: { val: filled, dir: oracledb.BIND_IN },
          employmentType: { val: this.normalizeEmploymentType(payload.employment_type, { required: true }), dir: oracledb.BIND_IN },
          budgetedMinKd: { val: minKd, dir: oracledb.BIND_IN },
          budgetedMaxKd: { val: maxKd, dir: oracledb.BIND_IN },
          actualAvgKd: { val: this.numOptional(payload.actual_avg_kd), dir: oracledb.BIND_IN },
          reportsToPositionId: { val: this.raw16Optional(payload.reports_to_position_id, 'reports_to_position_id'), dir: oracledb.BIND_IN },
          createdBy: { val: userId, dir: oracledb.BIND_IN },
          createdDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: userId, dir: oracledb.BIND_IN },
          lastUpdatedDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdateLogin: { val: payload.last_update_login ?? null, dir: oracledb.BIND_IN },
          returnPositionId: { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 }
        };

        const ins = await connection.execute(insertSql, bindVars, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const newIdBuf = Array.isArray(ins.outBinds.returnPositionId) 
          ? ins.outBinds.returnPositionId[0] 
          : ins.outBinds.returnPositionId;

        const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1 AND p.TENANT_ID = :2`;
        const rr = await connection.execute(selectSql, [newIdBuf, tenantIdNum], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const row = this.toLowerCaseKeys(this.buffersToHexInRow(rr.rows[0]));
        row.org_path = await this.fetchOrgPath(row.org_unit_id);

        return this.shape(row);
      } catch (e) {
        const msg = e?.message || '';

        if (e.errorNum === 1 || msg.includes('ORA-00001')) {
          const err = new Error('position_code already exists');
          err.code = 'UNIQUE_CONSTRAINT_VIOLATION';
          err.statusCode = 409;
          throw err;
        }

        if (e.errorNum === 2291 || msg.includes('ORA-02291')) {
          const err = new Error(
            'Referenced record does not exist (org_structure_id/org_unit_id/job_family_id/job_level_id/grade_id/reports_to_position_id)'
          );
          err.code = 'FOREIGN_KEY_CONSTRAINT';
          err.statusCode = 400;
          throw err;
        }

        if (e.errorNum === 1400 || msg.includes('ORA-01400')) {
          const err = new Error('Missing required fields');
          err.code = 'NOT_NULL_CONSTRAINT';
          err.statusCode = 400;
          throw err;
        }

        if (e.errorNum === 2290 || msg.includes('ORA-02290')) {
          const err = new Error('Invalid value (status/step_no/headcount/salary constraints)');
          err.code = 'CHECK_CONSTRAINT_VIOLATION';
          err.statusCode = 400;
          throw err;
        }

        const err = new Error(`Failed to create position: ${msg}`);
        err.code = 'INTERNAL_SERVER_ERROR';
        err.statusCode = 500;
        throw err;
      }
    });
  }

  // ----------------------------
  // UPDATE
  // ----------------------------
  static async update(positionIdHex32, data, userId = 'SYSTEM', tenantId) {
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const idBuf = this.raw16Required(positionIdHex32, 'position_id');
    const payload = this.toLowerCaseKeys(data);
    delete payload.tenant_id;

    return await this.executeWithTransaction(async (connection) => {
      const currentSql = `
        SELECT
          NUMBER_OF_POSITIONS,
          FILLED_POSITIONS,
          BUDGETED_MIN_KD,
          BUDGETED_MAX_KD
        FROM ${this.TABLE_NAME}
        WHERE POSITION_ID = :1 AND TENANT_ID = :2
      `;
      const currentRowResult = await connection.execute(currentSql, [idBuf, tenantIdNum], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if (!currentRowResult?.rows?.length) return null;
      const currentRow = this.toLowerCaseKeys(this.buffersToHexInRow(currentRowResult.rows[0]));

      const nextNumberOfPositions =
        payload.number_of_positions !== undefined
          ? this.numRequired(payload.number_of_positions, 'number_of_positions')
          : Number(currentRow.number_of_positions ?? 0);
      const nextFilledPositions =
        payload.filled_positions !== undefined
          ? this.numRequired(payload.filled_positions, 'filled_positions')
          : Number(currentRow.filled_positions ?? 0);
      const nextBudgetedMinKd =
        payload.budgeted_min_kd !== undefined
          ? this.numRequired(payload.budgeted_min_kd, 'budgeted_min_kd')
          : Number(currentRow.budgeted_min_kd ?? 0);
      const nextBudgetedMaxKd =
        payload.budgeted_max_kd !== undefined
          ? this.numRequired(payload.budgeted_max_kd, 'budgeted_max_kd')
          : Number(currentRow.budgeted_max_kd ?? 0);

      if (nextNumberOfPositions < 1) {
        const err = new Error('number_of_positions must be >= 1');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      if (nextFilledPositions < 0) {
        const err = new Error('filled_positions must be >= 0');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      if (nextFilledPositions > nextNumberOfPositions) {
        const err = new Error('filled_positions must be <= number_of_positions');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }
      if (nextBudgetedMinKd > nextBudgetedMaxKd) {
        const err = new Error('budgeted_min_kd must be <= budgeted_max_kd');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }

      const sets = [];
      const binds = [];
      let i = 1;

      const add = (col, val) => {
        sets.push(`${col} = :${i}`);
        binds.push(val);
        i++;
      };

      if (payload.position_code !== undefined) add('POSITION_CODE', this.strRequired(payload.position_code, 'position_code'));
      if (payload.status !== undefined) add('STATUS', this.normalizeStatus(payload.status, { required: true }));
      if (payload.position_title_en !== undefined) add('POSITION_TITLE_EN', this.strRequired(payload.position_title_en, 'position_title_en'));
      if (payload.position_title_ar !== undefined) add('POSITION_TITLE_AR', this.strOptional(payload.position_title_ar));

      if (payload.org_structure_id !== undefined) add('ORG_STRUCTURE_ID', this.raw16Required(payload.org_structure_id, 'org_structure_id'));
      if (payload.org_unit_id !== undefined) add('ORG_UNIT_ID', this.raw16Required(payload.org_unit_id, 'org_unit_id'));

      if (payload.org_path_json !== undefined) add('ORG_PATH_JSON', payload.org_path_json ? JSON.stringify(payload.org_path_json) : null);

      if (payload.cost_center !== undefined) add('COST_CENTER', this.strRequired(payload.cost_center, 'cost_center'));
      if (payload.location !== undefined) add('LOCATION', this.strRequired(payload.location, 'location'));

      if (payload.job_family_id !== undefined) add('JOB_FAMILY_ID', this.numRequired(payload.job_family_id, 'job_family_id'));
      if (payload.job_level_id !== undefined) add('JOB_LEVEL_ID', this.numRequired(payload.job_level_id, 'job_level_id'));
      if (payload.grade_id !== undefined) add('GRADE_ID', this.numRequired(payload.grade_id, 'grade_id'));

      if (payload.step_no !== undefined || payload.step_nos !== undefined) {
        const stepInput = payload.step_nos !== undefined ? payload.step_nos : payload.step_no;
        const normalizedSteps = this.normalizeStepNumbers(stepInput, 'step_no');
        add('STEP_NO', normalizedSteps[0]);
        add('STEP_NOS_JSON', JSON.stringify(normalizedSteps));
      }
      if (payload.number_of_positions !== undefined) add('NUMBER_OF_POSITIONS', nextNumberOfPositions);
      if (payload.filled_positions !== undefined) add('FILLED_POSITIONS', nextFilledPositions);

      if (payload.employment_type !== undefined) {
        add('EMPLOYMENT_TYPE', this.normalizeEmploymentType(payload.employment_type, { required: true }));
      }
      if (payload.budgeted_min_kd !== undefined) add('BUDGETED_MIN_KD', nextBudgetedMinKd);
      if (payload.budgeted_max_kd !== undefined) add('BUDGETED_MAX_KD', nextBudgetedMaxKd);
      if (payload.actual_avg_kd !== undefined) add('ACTUAL_AVG_KD', this.numOptional(payload.actual_avg_kd));

      if (payload.reports_to_position_id !== undefined) add('REPORTS_TO_POSITION_ID', this.raw16Optional(payload.reports_to_position_id, 'reports_to_position_id'));
      if (payload.last_update_login !== undefined) add('LAST_UPDATE_LOGIN', payload.last_update_login ?? null);

      if (!sets.length) {
        const err = new Error('No fields to update');
        err.code = 'VALIDATION_ERROR';
        err.statusCode = 400;
        throw err;
      }

      add('LAST_UPDATED_BY', userId);
      add('LAST_UPDATED_DATE', new Date());

      binds.push(idBuf, tenantIdNum);
      const sql = `UPDATE ${this.TABLE_NAME} SET ${sets.join(', ')} WHERE POSITION_ID = :${i} AND TENANT_ID = :${i + 1}`;
      const r = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if ((r.rowsAffected || 0) === 0) return null;

      const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1 AND p.TENANT_ID = :2`;
      const rr = await connection.execute(selectSql, [idBuf, tenantIdNum], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const row = this.toLowerCaseKeys(this.buffersToHexInRow(rr.rows[0]));
      row.org_path = await this.fetchOrgPath(row.org_unit_id);
      return this.shape(row);
    });
  }

  // ----------------------------
  // SOFT DELETE
  // ----------------------------
  static async softDelete(positionIdHex32, userId = 'SYSTEM', tenantId) {
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const idBuf = this.raw16Required(positionIdHex32, 'position_id');
    return await this.executeWithTransaction(async (connection) => {
      const sql = `
        UPDATE ${this.TABLE_NAME}
        SET STATUS = 'INACTIVE',
            LAST_UPDATED_BY = :1,
            LAST_UPDATED_DATE = :2
        WHERE POSITION_ID = :3 AND TENANT_ID = :4
      `;
      const r = await connection.execute(sql, [userId, new Date(), idBuf, tenantIdNum], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      if ((r.rowsAffected || 0) === 0) return null;

      const selectSql = this.selectBase() + ` WHERE p.POSITION_ID = :1 AND p.TENANT_ID = :2`;
      const rr = await connection.execute(selectSql, [idBuf, tenantIdNum], { outFormat: oracledb.OUT_FORMAT_OBJECT });

      const row = this.toLowerCaseKeys(this.buffersToHexInRow(rr.rows[0]));
      row.org_path = await this.fetchOrgPath(row.org_unit_id);
      return this.shape(row);
    });
  }

  // ----------------------------
  // HARD DELETE
  // ----------------------------
  static async hardDelete(positionIdHex32, tenantId) {
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const idBuf = this.raw16Required(positionIdHex32, 'position_id');
    return await this.executeWithTransaction(async (connection) => {
      const r = await connection.execute(`DELETE FROM ${this.TABLE_NAME} WHERE POSITION_ID = :1 AND TENANT_ID = :2`, [idBuf, tenantIdNum], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      if ((r.rowsAffected || 0) === 0) return null;
      return { success: true };
    });
  }

  // ----------------------------
  // REPORTING RELATIONSHIPS TREE
  // ----------------------------
  static async findReportingRelationships(tenantId, positionIdHex32 = null, includeHierarchy = true) {
    if (tenantId === undefined || tenantId === null) {
      const err = new Error('tenant_id is required');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    const tenantIdNum = Number(tenantId);
    if (!Number.isFinite(tenantIdNum) || tenantIdNum < 1) {
      const err = new Error('tenant_id must be a valid positive number');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }
    let rootHex = null;
    if (positionIdHex32) {
      const norm = this.normalizeGuidHex32(positionIdHex32);
      if (!this.isHex32(norm)) return [];
      rootHex = norm;
    }

    const sql = this.selectBase() + ` WHERE p.TENANT_ID = :1 ORDER BY p.CREATED_DATE DESC`;
    const r = await this.executeQuery(sql, [tenantIdNum]);
    const all = this.shapeMany(r.rows || []);

    // Build map: parentId => children[]
    const childrenByParent = new Map();
    const byId = new Map();
    for (const p of all) {
      byId.set(p.position_id, p);
      const parent = p.reports_to_position_id || null;
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(p);
    }

    const build = (parentId, level = 0) => {
      const kids = childrenByParent.get(parentId) || [];
      return kids.map((pos) => ({
        position_id: pos.position_id,
        position_code: pos.position_code,
        position_title_en: pos.position_title_en,
        position_title_ar: pos.position_title_ar,
        status: pos.status,
        reports_to: pos.reports_to,
        direct_reports:
          includeHierarchy ? build(pos.position_id, level + 1) : [],
      }));
    };

    if (rootHex) {
      const root = byId.get(rootHex);
      if (!root) return [];
      return [
        {
          position_id: root.position_id,
          position_code: root.position_code,
          position_title_en: root.position_title_en,
          position_title_ar: root.position_title_ar,
          status: root.status,
          reports_to: root.reports_to,
          direct_reports: includeHierarchy ? build(root.position_id, 0) : [],
        },
      ];
    }

    // Forest (top-level = reports_to_position_id is null)
    return build(null, 0);
  }
}

export default PositionsModel;
