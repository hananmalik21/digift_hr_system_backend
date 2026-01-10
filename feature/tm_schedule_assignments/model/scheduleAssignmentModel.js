// feature/tm_schedule_assignments/model/scheduleAssignmentModel.js
import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import EnterpriseModel from '../../enterprises/model/enterpriseModel.js';
import HrOrgStructureModel from '../../hr_org_structures/model/hrOrgStructureModel.js';

/**
 * Schedule Assignment Model
 * Table: ENT.TM_SCHEDULE_ASSIGNMENTS
 *
 * DB truth:
 * - DEPARTMENT_ID is RAW(16) FK -> ENT.ORG_UNITS(ORG_UNIT_ID)
 * - TENANT_ID is NUMBER
 * - WORK_SCHEDULE_ID is NUMBER
 * - EMPLOYEE_ID is NUMBER (nullable)
 *
 * Key rule to avoid ORA-00932:
 * ✅ For lookups/filters on RAW: use RAWTOHEX(column) = :hex
 * ✅ For INSERT/UPDATE into RAW: bind Buffer(16)
 */
class ScheduleAssignmentModel {
  static TABLE_NAME = 'ENT.TM_SCHEDULE_ASSIGNMENTS';

  /* =========================
   * Helpers
   * ========================= */

  static extractOraCode(error) {
    const msg = String(error?.message || '');
    const m = msg.match(/ORA-\d{5}/);
    return m ? m[0] : null;
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
        try {
          await connection.rollback();
        } catch (e) {
          // ignore
        }
      }
      throw error;
    } finally {
      if (connection?.close) {
        try {
          await connection.close();
        } catch (e) {
          // ignore
        }
      }
    }
  }

  // Lower-case keys for API + convert Buffers to hex32
  static toSnake(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (Buffer.isBuffer(obj)) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((x) => this.toSnake(x));

    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[String(k).toLowerCase()] = this.toSnake(v);
    }
    return out;
  }

  /* =========================
   * GUID / RAW helpers
   * ========================= */

  static normalizeHex32(v) {
    if (v === null || v === undefined) return '';
    if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
    return String(v).trim().replace(/-/g, '').toUpperCase();
  }

  static ensureHex32(v, fieldName = 'id') {
    const hex = this.normalizeHex32(v);
    if (!/^[0-9A-F]{32}$/.test(hex)) {
      throw new ValidationError(`${fieldName} must be a 32-character HEX GUID`);
    }
    return hex;
  }

  static hexToRawBuffer(v) {
    if (v === null || v === undefined || v === '') return null;

    if (Buffer.isBuffer(v)) {
      if (v.length === 16) return v;
      return this.hexToRawBuffer(v.toString('hex'));
    }

    const hex = this.normalizeHex32(v);
    if (!/^[0-9A-F]+$/.test(hex)) return String(v);

    let h = hex;
    if (h.length < 32) h = h.padStart(32, '0');
    if (h.length > 32) h = h.slice(0, 32);

    try {
      return Buffer.from(h, 'hex'); // 16 bytes
    } catch {
      return String(v);
    }
  }

  static parseDateOrThrow(v, fieldName) {
    const d = v instanceof Date ? v : new Date(v);
    if (!(d instanceof Date) || isNaN(d.getTime())) {
      throw new ValidationError(`${fieldName} must be a valid date`);
    }
    return d;
  }

  /* =========================
   * Validations
   * ========================= */

  static async validateOrgUnitExists(orgUnitId, tenantId) {
    try {
      const hexId = this.ensureHex32(orgUnitId, 'org_unit_id');

      const sql = `
        SELECT 1
        FROM ENT.ORG_UNITS
        WHERE RAWTOHEX(ORG_UNIT_ID) = :1
          AND ENTERPRISE_ID = :2
      `;

      const result = await db.executeQuery(sql, [hexId, tenantId]);
      if (!result.rows?.length) {
        throw new NotFoundError(`Organization unit with ID ${orgUnitId} does not exist for tenant ${tenantId}`);
      }
      return true;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to validate organization unit', error);
    }
  }

  static async validateWorkScheduleExists(workScheduleId, tenantId) {
    try {
      const sql = `
        SELECT 1
        FROM ENT.TM_WORK_SCHEDULES
        WHERE WORK_SCHEDULE_ID = :1
          AND TENANT_ID = :2
      `;
      const result = await db.executeQuery(sql, [workScheduleId, tenantId]);
      if (!result.rows?.length) {
        throw new NotFoundError(`Work schedule with ID ${workScheduleId} does not exist for tenant ${tenantId}`);
      }
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to validate work schedule', error);
    }
  }

  /* =========================
   * Overlap Check (APP-side)
   * ========================= */

  static async checkOverlap(connection, {
    tenantId,
    assignmentLevel,
    departmentId = null, // hex32
    employeeId = null,
    startDate, // Date
    endDate = null, // Date|null
    excludeId = null
  }) {
    const level = String(assignmentLevel || '').toUpperCase();

    if (tenantId === null || tenantId === undefined) throw new ValidationError('tenantId is required for overlap check');
    if (!['DEPARTMENT', 'EMPLOYEE'].includes(level)) throw new ValidationError('assignmentLevel must be DEPARTMENT or EMPLOYEE');
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) throw new ValidationError('startDate must be a valid Date');
    if (endDate !== null && (!(endDate instanceof Date) || isNaN(endDate.getTime()))) {
      throw new ValidationError('endDate must be null or a valid Date');
    }

    let sql = `
      SELECT SCHEDULE_ASSIGNMENT_ID
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :tenantId
        AND UPPER(NVL(STATUS,'ACTIVE')) = 'ACTIVE'
        AND UPPER(ASSIGNMENT_LEVEL) = UPPER(:assignmentLevel)
        AND (:excludeId IS NULL OR SCHEDULE_ASSIGNMENT_ID <> :excludeId)
    `;

    const binds = {
      tenantId,
      assignmentLevel: level,
      excludeId,
      startDate,
      endDate
    };

    if (level === 'DEPARTMENT') {
      const depHex = this.ensureHex32(departmentId, 'department_id');
      sql += ` AND RAWTOHEX(DEPARTMENT_ID) = :depHex`;
      binds.depHex = depHex;
    } else {
      if (employeeId === null || employeeId === undefined) throw new ValidationError('employeeId is required');
      sql += ` AND EMPLOYEE_ID = :employeeId`;
      binds.employeeId = employeeId;
    }

    sql += `
      AND :startDate <= NVL(EFFECTIVE_END_DATE, DATE '9999-12-31')
      AND NVL(:endDate, DATE '9999-12-31') >= EFFECTIVE_START_DATE
      FETCH FIRST 1 ROWS ONLY
    `;

    const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    return result.rows?.[0] || null;
  }

  /* =========================
   * Enrichment Helpers
   * ========================= */

  static async getWorkScheduleDetails(workScheduleId, tenantId) {
    try {
      const sql = `
        SELECT
          WORK_SCHEDULE_ID,
          TENANT_ID,
          SCHEDULE_CODE,
          SCHEDULE_NAME_EN,
          SCHEDULE_NAME_AR
        FROM ENT.TM_WORK_SCHEDULES
        WHERE WORK_SCHEDULE_ID = :1
          AND TENANT_ID = :2
      `;
      const result = await db.executeQuery(sql, [workScheduleId, tenantId]);
      if (!result.rows?.length) return null;
      return this.toSnake(result.rows[0]);
    } catch {
      return null;
    }
  }

  static async fetchOrgPath(orgUnitIdHex32) {
    if (!orgUnitIdHex32) return [];
    
    try {
      const idBuffer = this.hexToRawBuffer(orgUnitIdHex32);
      if (!idBuffer) return [];

      // Traverse up from child -> parent using Oracle hierarchical query
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

      const result = await db.executeQuery(sql, [idBuffer]);
      
      // Convert rows and ensure proper key mapping
      const path = (result.rows || []).map((row) => {
        // Handle both uppercase (from Oracle) and lowercase (already converted) keys
        const normalized = this.toSnake(row);
        return {
          level_code: normalized.level_code || row.LEVEL_CODE,
          org_unit_id: normalized.org_unit_id || row.ORG_UNIT_ID,
          name_en: normalized.org_unit_name_en || normalized.name_en || row.ORG_UNIT_NAME_EN,
          name_ar: normalized.org_unit_name_ar || normalized.name_ar || row.ORG_UNIT_NAME_AR,
        };
      });
      
      return path;
    } catch (error) {
      console.error('Error fetching org path:', error);
      return [];
    }
  }

  static async getOrgUnitDetails(orgUnitHex32, tenantId) {
    try {
      const hexId = this.ensureHex32(orgUnitHex32, 'org_unit_id');

      const sql = `
        SELECT
          RAWTOHEX(ou.ORG_UNIT_ID)        AS ORG_UNIT_ID,
          RAWTOHEX(ou.ORG_STRUCTURE_ID)   AS ORG_STRUCTURE_ID,
          ou.ENTERPRISE_ID,
          ou.LEVEL_CODE,
          ou.ORG_UNIT_CODE,
          ou.ORG_UNIT_NAME_EN,
          ou.ORG_UNIT_NAME_AR,
          RAWTOHEX(ou.PARENT_ORG_UNIT_ID) AS PARENT_ORG_UNIT_ID,
          RAWTOHEX(p.ORG_UNIT_ID)         AS PARENT_ORG_UNIT_ID_FULL,
          p.ORG_UNIT_NAME_EN              AS PARENT_ORG_UNIT_NAME_EN,
          p.ORG_UNIT_NAME_AR              AS PARENT_ORG_UNIT_NAME_AR,
          p.LEVEL_CODE                    AS PARENT_ORG_LEVEL_CODE
        FROM ENT.ORG_UNITS ou
        LEFT JOIN ENT.ORG_UNITS p
          ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
        WHERE RAWTOHEX(ou.ORG_UNIT_ID) = :1
          AND ou.ENTERPRISE_ID = :2
      `;

      const result = await db.executeQuery(sql, [hexId, tenantId]);
      if (!result.rows?.length) return null;

      const ou = this.toSnake(result.rows[0]);
      const parentId = ou.parent_org_unit_id_full ?? ou.parent_org_unit_id ?? null;

      return {
        org_unit_id: ou.org_unit_id,
        org_structure_id: ou.org_structure_id,
        enterprise_id: ou.enterprise_id,
        level_code: ou.level_code,
        org_unit_code: ou.org_unit_code,
        org_unit_name_en: ou.org_unit_name_en,
        org_unit_name_ar: ou.org_unit_name_ar,
        parent_unit: parentId
          ? { id: parentId, name: ou.parent_org_unit_name_en || ou.parent_org_unit_name_ar || null, level: ou.parent_org_level_code || null }
          : null
      };
    } catch {
      return null;
    }
  }

  static async getEnterpriseDetails(enterpriseId) {
    try {
      if (!enterpriseId) return null;
      const enterprise = await EnterpriseModel.findById(enterpriseId);
      if (!enterprise) return null;
      
      return {
        id: enterprise.enterprise_id,
        name: enterprise.enterprise_name,
        code: enterprise.enterprise_code
      };
    } catch (error) {
      console.error('Error fetching enterprise details:', error);
      return null;
    }
  }

  static async getOrgStructureDetails(structureIdHex) {
    try {
      if (!structureIdHex) return null;
      const structure = await HrOrgStructureModel.findById(structureIdHex);
      if (!structure) return null;
      
      return {
        id: structure.structure_id,
        name: structure.structure_name,
        code: structure.structure_code
      };
    } catch (error) {
      console.error('Error fetching org structure details:', error);
      return null;
    }
  }

  static async getActiveOrgStructureForEnterprise(enterpriseId) {
    try {
      if (!enterpriseId) return null;
      const result = await HrOrgStructureModel.findAll({
        enterpriseId,
        isActive: true
      });
      
      // Get the first active org structure for this enterprise
      const activeStructure = Array.isArray(result) ? result[0] : (result?.structures?.[0] || null);
      if (!activeStructure) return null;
      
      return {
        id: activeStructure.structure_id,
        name: activeStructure.structure_name,
        code: activeStructure.structure_code
      };
    } catch (error) {
      console.error('Error fetching active org structure for enterprise:', error);
      return null;
    }
  }

  static async enrichAssignment(a, tenantId) {
    // Initialize org_path to empty array by default
    a.org_path = [];
    
    // Add enterprise information
    if (tenantId) {
      a.enterprise = await this.getEnterpriseDetails(tenantId);
    }
    
    if (a.work_schedule_id) {
      a.work_schedule = await this.getWorkScheduleDetails(a.work_schedule_id, tenantId);
    }

    if (String(a.assignment_level || '').toUpperCase() === 'DEPARTMENT' && a.department_id) {
      const depHex = this.normalizeHex32(a.department_id);
      a.department_id = depHex;
      a.org_unit_id = depHex;
      a.org_unit = await this.getOrgUnitDetails(depHex, tenantId);
      
      // Add org structure information if org_unit has org_structure_id
      if (a.org_unit && a.org_unit.org_structure_id) {
        a.org_structure = await this.getOrgStructureDetails(a.org_unit.org_structure_id);
      }
      
      // Fetch org path (hierarchical path from root to department)
      try {
        const path = await this.fetchOrgPath(depHex);
        a.org_path = Array.isArray(path) ? path : [];
      } catch (error) {
        console.error('Error fetching org path for department:', depHex, error);
        a.org_path = [];
      }
    } else {
      if (a.department_id) a.department_id = this.normalizeHex32(a.department_id);
    }

    // Add org structure information if not already set (fallback to active org structure for enterprise)
    if (!a.org_structure && tenantId) {
      a.org_structure = await this.getActiveOrgStructureForEnterprise(tenantId);
    }

    return a;
  }

  /* =========================
   * CRUD
   * ========================= */

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // next id
        let scheduleAssignmentId;
        try {
          const seqResult = await connection.execute(
            `SELECT ENT.TM_SCHEDULE_ASSIGNMENTS_SEQ.NEXTVAL AS NEXT_ID FROM DUAL`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          scheduleAssignmentId = seqResult.rows[0].NEXT_ID;
        } catch {
          const maxResult = await connection.execute(
            `SELECT NVL(MAX(SCHEDULE_ASSIGNMENT_ID), 0) + 1 AS NEXT_ID FROM ${this.TABLE_NAME}`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          scheduleAssignmentId = maxResult.rows[0].NEXT_ID;
        }

        const now = new Date();
        const actor = userId || 'SYSTEM';

        const assignmentLevel = String(data.ASSIGNMENT_LEVEL || '').toUpperCase();
        const status = String(data.STATUS || 'ACTIVE').toUpperCase();

        const effectiveStartDate = this.parseDateOrThrow(data.EFFECTIVE_START_DATE, 'effective_start_date');

        const effectiveEndDate =
          (data.EFFECTIVE_END_DATE === null || data.EFFECTIVE_END_DATE === undefined || data.EFFECTIVE_END_DATE === '')
            ? null
            : this.parseDateOrThrow(data.EFFECTIVE_END_DATE, 'effective_end_date');

        if (effectiveEndDate && effectiveEndDate < effectiveStartDate) {
          throw new ValidationError('effective_end_date must be >= effective_start_date');
        }

        // overlap check (ACTIVE only)
        if (status === 'ACTIVE') {
          const overlap = await this.checkOverlap(connection, {
            tenantId: data.TENANT_ID,
            assignmentLevel,
            departmentId: assignmentLevel === 'DEPARTMENT' ? data.DEPARTMENT_ID : null,
            employeeId: assignmentLevel === 'EMPLOYEE' ? data.EMPLOYEE_ID : null,
            startDate: effectiveStartDate,
            endDate: effectiveEndDate,
            excludeId: null
          });

          if (overlap) {
            throw new DatabaseError(
              'Schedule assignment overlaps with an existing assignment. Please adjust the effective dates.',
              { errorNum: 20001, code: 'ORA-20001', message: 'Schedule overlap conflict' }
            );
          }
        }

        const insertSql = `
          INSERT INTO ${this.TABLE_NAME} (
            SCHEDULE_ASSIGNMENT_ID,
            TENANT_ID,
            ASSIGNMENT_LEVEL,
            DEPARTMENT_ID,
            EMPLOYEE_ID,
            WORK_SCHEDULE_ID,
            EFFECTIVE_START_DATE,
            EFFECTIVE_END_DATE,
            STATUS,
            NOTES,
            CREATION_DATE,
            CREATED_BY,
            LAST_UPDATE_DATE,
            LAST_UPDATED_BY
          ) VALUES (
            :scheduleAssignmentId,
            :tenantId,
            :assignmentLevel,
            :departmentId,
            :employeeId,
            :workScheduleId,
            :effectiveStartDate,
            :effectiveEndDate,
            :status,
            :notes,
            :creationDate,
            :createdBy,
            :lastUpdateDate,
            :lastUpdatedBy
          )
          RETURNING SCHEDULE_ASSIGNMENT_ID INTO :returnId
        `;

        const departmentRaw =
          (data.DEPARTMENT_ID === null || data.DEPARTMENT_ID === undefined || data.DEPARTMENT_ID === '')
            ? null
            : this.hexToRawBuffer(data.DEPARTMENT_ID);

        const binds = {
          scheduleAssignmentId: { val: scheduleAssignmentId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          assignmentLevel: { val: assignmentLevel, dir: oracledb.BIND_IN },
          departmentId: { val: departmentRaw, dir: oracledb.BIND_IN }, // RAW(16)
          employeeId: { val: data.EMPLOYEE_ID ?? null, dir: oracledb.BIND_IN },
          workScheduleId: { val: data.WORK_SCHEDULE_ID, dir: oracledb.BIND_IN },
          effectiveStartDate: { val: effectiveStartDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          effectiveEndDate: { val: effectiveEndDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          status: { val: status, dir: oracledb.BIND_IN },
          notes: { val: data.NOTES ?? null, dir: oracledb.BIND_IN },
          creationDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          createdBy: { val: actor, dir: oracledb.BIND_IN },
          lastUpdateDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: actor, dir: oracledb.BIND_IN },
          returnId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        };

        const result = await connection.execute(insertSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const returnedId = Array.isArray(result.outBinds.returnId)
          ? result.outBinds.returnId[0]
          : result.outBinds.returnId;

        return { SCHEDULE_ASSIGNMENT_ID: returnedId, TENANT_ID: data.TENANT_ID };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      const ora = this.extractOraCode(error);
      if (error?.errorNum !== undefined || ora) {
        throw new DatabaseError(ora ? `${ora}: ${error.message || String(error)}` : (error.message || 'Oracle database error'), error);
      }
      throw new DatabaseError('Failed to create schedule assignment', error);
    }
  }

  static async findAll(filters = {}) {
    try {
      if (filters.tenantId === null || filters.tenantId === undefined) {
        throw new ValidationError('tenant_id is required');
      }

      let countSql = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataSql = `
        SELECT
          SCHEDULE_ASSIGNMENT_ID,
          TENANT_ID,
          ASSIGNMENT_LEVEL,
          DEPARTMENT_ID,
          EMPLOYEE_ID,
          WORK_SCHEDULE_ID,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          STATUS,
          NOTES,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
      `;

      const conditions = [];
      const binds = [];
      let p = 1;

      conditions.push(`TENANT_ID = :${p}`); binds.push(filters.tenantId); p++;

      if (filters.assignmentLevel) {
        conditions.push(`UPPER(ASSIGNMENT_LEVEL) = :${p}`); binds.push(String(filters.assignmentLevel).toUpperCase()); p++;
      }

      if (filters.orgUnitId !== undefined && filters.orgUnitId !== null) {
        const depHex = this.ensureHex32(filters.orgUnitId, 'org_unit_id');
        conditions.push(`RAWTOHEX(DEPARTMENT_ID) = :${p}`); binds.push(depHex); p++;
      }

      if (filters.employeeId !== undefined && filters.employeeId !== null) {
        conditions.push(`EMPLOYEE_ID = :${p}`); binds.push(filters.employeeId); p++;
      }

      if (filters.status) {
        conditions.push(`UPPER(STATUS) = :${p}`); binds.push(String(filters.status).toUpperCase()); p++;
      }

      if (filters.effectiveOn) {
        const d = (filters.effectiveOn instanceof Date) ? filters.effectiveOn : new Date(filters.effectiveOn);
        conditions.push(`EFFECTIVE_START_DATE <= :${p} AND (EFFECTIVE_END_DATE IS NULL OR EFFECTIVE_END_DATE >= :${p})`);
        binds.push(d); p++;
      }

      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      countSql += where;
      dataSql += where;
      dataSql += ` ORDER BY SCHEDULE_ASSIGNMENT_ID DESC`;

      const pagination = filters.pagination;
      const dataBinds = [...binds];

      const countResult = await db.executeQuery(countSql, [...binds]);
      const total = countResult.rows?.[0]?.TOTAL || 0;

      if (pagination?.page && pagination?.pageSize) {
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :${p} ROWS FETCH NEXT :${p + 1} ROWS ONLY`;
        dataBinds.push(offset, pagination.pageSize);
      }

      const result = await db.executeQuery(dataSql, dataBinds);
      const rows = result.rows || [];

      const assignments = rows.map((r) => this.toSnake(r));
      const enriched = await Promise.all(assignments.map((a) => this.enrichAssignment(a, filters.tenantId)));

      return pagination?.page
        ? { assignments: enriched, total }
        : { assignments: enriched, total: enriched.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch schedule assignments: ${error.message}`, error);
    }
  }

  static async findById(scheduleAssignmentId, tenantId) {
    try {
      if (tenantId === null || tenantId === undefined) throw new ValidationError('tenant_id is required');

      const sql = `
        SELECT
          SCHEDULE_ASSIGNMENT_ID,
          TENANT_ID,
          ASSIGNMENT_LEVEL,
          DEPARTMENT_ID,
          EMPLOYEE_ID,
          WORK_SCHEDULE_ID,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          STATUS,
          NOTES,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        FROM ${this.TABLE_NAME}
        WHERE SCHEDULE_ASSIGNMENT_ID = :1
          AND TENANT_ID = :2
      `;

      const result = await db.executeQuery(sql, [scheduleAssignmentId, tenantId]);
      if (!result.rows?.length) return null;

      const assignment = this.toSnake(result.rows[0]);
      return await this.enrichAssignment(assignment, tenantId);
    } catch (error) {
      if (error instanceof ValidationError) throw error;

      const ora = this.extractOraCode(error);
      if (error?.errorNum !== undefined || ora) {
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }
      throw new DatabaseError('Failed to fetch schedule assignment', error);
    }
  }

  static async update(scheduleAssignmentId, tenantId, data, userId) {
    try {
      if (tenantId === null || tenantId === undefined) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        const lock = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME} WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2 FOR UPDATE`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!lock.rows?.length) throw new NotFoundError('Schedule assignment not found');

        const curRes = await connection.execute(
          `SELECT
             ASSIGNMENT_LEVEL,
             DEPARTMENT_ID,
             EMPLOYEE_ID,
             WORK_SCHEDULE_ID,
             EFFECTIVE_START_DATE,
             EFFECTIVE_END_DATE,
             STATUS
           FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const cur = curRes.rows?.[0];
        if (!cur) throw new NotFoundError('Schedule assignment not found');

        const now = new Date();
        const actor = userId || 'SYSTEM';
        const assignmentLevel = String(cur.ASSIGNMENT_LEVEL || '').toUpperCase();

        const curDeptHex = cur.DEPARTMENT_ID ? this.normalizeHex32(cur.DEPARTMENT_ID) : null;
        const departmentHex = (data.DEPARTMENT_ID !== undefined) ? data.DEPARTMENT_ID : curDeptHex;
        const employeeId = (data.EMPLOYEE_ID !== undefined) ? data.EMPLOYEE_ID : cur.EMPLOYEE_ID;

        const newStartDate = (data.EFFECTIVE_START_DATE !== undefined)
          ? this.parseDateOrThrow(data.EFFECTIVE_START_DATE, 'effective_start_date')
          : cur.EFFECTIVE_START_DATE;

        const newEndDate = (data.EFFECTIVE_END_DATE !== undefined)
          ? (data.EFFECTIVE_END_DATE === null ? null : this.parseDateOrThrow(data.EFFECTIVE_END_DATE, 'effective_end_date'))
          : cur.EFFECTIVE_END_DATE;

        if (newEndDate && newEndDate < newStartDate) {
          throw new ValidationError('effective_end_date must be >= effective_start_date');
        }

        const newStatus =
          (data.STATUS !== undefined && data.STATUS !== null)
            ? String(data.STATUS).toUpperCase()
            : String(cur.STATUS || 'ACTIVE').toUpperCase();

        // overlap check (ACTIVE only)
        if (newStatus === 'ACTIVE') {
          const overlap = await this.checkOverlap(connection, {
            tenantId,
            assignmentLevel,
            departmentId: assignmentLevel === 'DEPARTMENT' ? departmentHex : null,
            employeeId: assignmentLevel === 'EMPLOYEE' ? employeeId : null,
            startDate: newStartDate,
            endDate: newEndDate,
            excludeId: scheduleAssignmentId
          });

          if (overlap) {
            throw new DatabaseError(
              'Schedule assignment overlaps with an existing assignment. Please adjust dates.',
              { errorNum: 20001, code: 'ORA-20001', message: 'Schedule overlap conflict' }
            );
          }
        }

        // build UPDATE
        const fields = [];
        const bindParams = [];
        let p = 1;

        if (data.WORK_SCHEDULE_ID !== undefined) {
          fields.push(`WORK_SCHEDULE_ID = :${p}`);
          bindParams.push(data.WORK_SCHEDULE_ID === null ? null : data.WORK_SCHEDULE_ID);
          p++;
        }

        if (data.DEPARTMENT_ID !== undefined) {
          fields.push(`DEPARTMENT_ID = :${p}`);
          const raw = (data.DEPARTMENT_ID === null) ? null : this.hexToRawBuffer(data.DEPARTMENT_ID);
          bindParams.push(raw);
          p++;
        }

        if (data.EMPLOYEE_ID !== undefined) {
          fields.push(`EMPLOYEE_ID = :${p}`);
          bindParams.push(data.EMPLOYEE_ID === null ? null : data.EMPLOYEE_ID);
          p++;
        }

        if (data.EFFECTIVE_START_DATE !== undefined) {
          fields.push(`EFFECTIVE_START_DATE = :${p}`);
          bindParams.push(newStartDate);
          p++;
        }

        if (data.EFFECTIVE_END_DATE !== undefined) {
          fields.push(`EFFECTIVE_END_DATE = :${p}`);
          bindParams.push(newEndDate);
          p++;
        }

        if (data.STATUS !== undefined) {
          fields.push(`STATUS = :${p}`);
          bindParams.push(data.STATUS === null ? null : String(data.STATUS).toUpperCase());
          p++;
        }

        if (data.NOTES !== undefined) {
          fields.push(`NOTES = :${p}`);
          bindParams.push(data.NOTES);
          p++;
        }

        if (!fields.length) throw new ValidationError('No fields to update');

        fields.push(`LAST_UPDATED_BY = :${p}`); bindParams.push(actor); p++;
        fields.push(`LAST_UPDATE_DATE = :${p}`); bindParams.push(now); p++;

        bindParams.push(scheduleAssignmentId);
        bindParams.push(tenantId);

        const updateSql = `
          UPDATE ${this.TABLE_NAME}
          SET ${fields.join(', ')}
          WHERE SCHEDULE_ASSIGNMENT_ID = :${p} AND TENANT_ID = :${p + 1}
        `;

        await connection.execute(updateSql, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const sel = await connection.execute(
          `SELECT
             SCHEDULE_ASSIGNMENT_ID,
             TENANT_ID,
             ASSIGNMENT_LEVEL,
             DEPARTMENT_ID,
             EMPLOYEE_ID,
             WORK_SCHEDULE_ID,
             EFFECTIVE_START_DATE,
             EFFECTIVE_END_DATE,
             STATUS,
             NOTES,
             CREATION_DATE,
             CREATED_BY,
             LAST_UPDATE_DATE,
             LAST_UPDATED_BY
           FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!sel.rows?.length) throw new NotFoundError('Schedule assignment not found');

        const assignment = this.toSnake(sel.rows[0]);
        return await this.enrichAssignment(assignment, tenantId);
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      const ora = this.extractOraCode(error);
      if (error?.errorNum !== undefined || ora) {
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }
      throw new DatabaseError('Failed to update schedule assignment', error);
    }
  }

  static async delete(scheduleAssignmentId, tenantId) {
    try {
      if (tenantId === null || tenantId === undefined) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        const lock = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME} WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2 FOR UPDATE`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!lock.rows?.length) throw new NotFoundError('Schedule assignment not found');

        const del = await connection.execute(
          `DELETE FROM ${this.TABLE_NAME} WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rowsAffected = del.rowsAffected || del.rowCount || 0;
        if (!rowsAffected) throw new NotFoundError('Schedule assignment not found');

        return { success: true, schedule_assignment_id: scheduleAssignmentId };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      const ora = this.extractOraCode(error);
      if (error?.errorNum !== undefined || ora) {
        throw new DatabaseError(ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'), error);
      }
      throw new DatabaseError('Failed to delete schedule assignment', error);
    }
  }
}

export default ScheduleAssignmentModel;
