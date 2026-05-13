// feature/tm_schedule_assignments/model/scheduleAssignmentModel.js
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../../utils/errors/index.js';
import HrOrgStructureModel from '../../../enterprise_structure/hr_org_structures/model/hrOrgStructureModel.js';
import { employeeAccessPredicate } from '../../../../utils/userContext.js';

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
 * ORG PATH:
 * ✅ ALWAYS returned for DEPARTMENT assignments
 *
 * FIXES:
 * ✅ ORA-01722 in batchGetOrgUnitDetails: compare RAW using HEXTORAW binds
 * ✅ org_structure_id filter: EXISTS subquery (pagination-safe)
 * ✅ work_schedule object disappearing: always set from cache and fallback fetch if missing
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
        try { await connection.rollback(); } catch {}
      }
      throw error;
    } finally {
      if (connection?.close) {
        try { await connection.close(); } catch {}
      }
    }
  }

  // Lower-case keys + convert Buffers to hex32
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
        WHERE ORG_UNIT_ID = HEXTORAW(:1)
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
      sql += ` AND DEPARTMENT_ID = HEXTORAW(:depHex)`;
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
   * Work Schedule Enrichment
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

  static async batchGetWorkScheduleDetails(workScheduleIds, tenantId) {
    if (!workScheduleIds || workScheduleIds.length === 0) return {};
    try {
      const uniqueIds = [...new Set(workScheduleIds.filter(id => id != null))];
      if (uniqueIds.length === 0) return {};

      const placeholders = uniqueIds.map((_, i) => `:${i + 2}`).join(',');
      const sql = `
        SELECT
          WORK_SCHEDULE_ID,
          TENANT_ID,
          SCHEDULE_CODE,
          SCHEDULE_NAME_EN,
          SCHEDULE_NAME_AR
        FROM ENT.TM_WORK_SCHEDULES
        WHERE WORK_SCHEDULE_ID IN (${placeholders})
          AND TENANT_ID = :1
      `;
      const binds = [tenantId, ...uniqueIds];
      const result = await db.executeQuery(sql, binds);

      const schedules = {};
      (result.rows || []).forEach(row => {
        const schedule = this.toSnake(row);
        schedules[schedule.work_schedule_id] = schedule;
      });
      return schedules;
    } catch (error) {
      console.error('Error batch fetching work schedules:', error);
      return {};
    }
  }

  /* =========================
   * Org Path / Org Unit / Org Structure
   * ========================= */

  static async fetchOrgPath(orgUnitHex32) {
    if (!orgUnitHex32) return [];
    try {
      const hex = this.ensureHex32(orgUnitHex32, 'org_unit_id');

      const sql = `
        SELECT
          RAWTOHEX(ou.ORG_UNIT_ID) AS ORG_UNIT_ID,
          ou.ORG_UNIT_NAME_EN,
          ou.ORG_UNIT_NAME_AR,
          ou.LEVEL_CODE,
          RAWTOHEX(ou.PARENT_ORG_UNIT_ID) AS PARENT_ORG_UNIT_ID,
          LEVEL AS HIERARCHY_LEVEL
        FROM ENT.ORG_UNITS ou
        START WITH ou.ORG_UNIT_ID = HEXTORAW(:1)
        CONNECT BY PRIOR ou.PARENT_ORG_UNIT_ID = ou.ORG_UNIT_ID
        ORDER BY LEVEL DESC
      `;

      const result = await db.executeQuery(sql, [hex]);

      return (result.rows || []).map((row) => {
        const r = this.toSnake(row);
        return {
          level_code: r.level_code,
          org_unit_id: r.org_unit_id,
          name_en: r.org_unit_name_en,
          name_ar: r.org_unit_name_ar,
          hierarchy_level: r.hierarchy_level
        };
      });
    } catch (error) {
      console.error('Error fetching org path:', error);
      return [];
    }
  }

  static async batchFetchOrgPaths(orgUnitHex32Array) {
    if (!orgUnitHex32Array || orgUnitHex32Array.length === 0) return {};

    const uniqueHex = [...new Set(
      orgUnitHex32Array
        .map(x => x ? this.normalizeHex32(x) : null)
        .filter(x => x && /^[0-9A-F]{32}$/.test(x))
    )];

    if (uniqueHex.length === 0) return {};

    const placeholders = uniqueHex.map((_, i) => `HEXTORAW(:${i + 1})`).join(', ');

    const sql = `
      SELECT
        RAWTOHEX(CONNECT_BY_ROOT ou.ORG_UNIT_ID) AS START_ID,
        RAWTOHEX(ou.ORG_UNIT_ID) AS ORG_UNIT_ID,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.LEVEL_CODE,
        LEVEL AS HIERARCHY_LEVEL
      FROM ENT.ORG_UNITS ou
      START WITH ou.ORG_UNIT_ID IN (${placeholders})
      CONNECT BY PRIOR ou.PARENT_ORG_UNIT_ID = ou.ORG_UNIT_ID
      ORDER BY RAWTOHEX(CONNECT_BY_ROOT ou.ORG_UNIT_ID), LEVEL DESC
    `;

    try {
      const result = await db.executeQuery(sql, uniqueHex);

      const grouped = {};
      (result.rows || []).forEach((row) => {
        const r = this.toSnake(row);
        if (!r.start_id) return;

        if (!grouped[r.start_id]) grouped[r.start_id] = [];
        grouped[r.start_id].push({
          level_code: r.level_code,
          org_unit_id: r.org_unit_id,
          name_en: r.org_unit_name_en,
          name_ar: r.org_unit_name_ar,
          hierarchy_level: r.hierarchy_level
        });
      });

      return grouped;
    } catch (error) {
      console.error('Error batch fetching org paths:', error);
      return {};
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
        WHERE ou.ORG_UNIT_ID = HEXTORAW(:1)
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

  // ✅ FIXED: RAW IN (...) using HEXTORAW binds (prevents ORA-01722)
  static async batchGetOrgUnitDetails(orgUnitHex32Array, tenantId) {
    if (!orgUnitHex32Array || orgUnitHex32Array.length === 0) return {};
    try {
      const uniqueHexIds = [...new Set(
        orgUnitHex32Array
          .map(id => id ? this.normalizeHex32(id) : null)
          .filter(id => id && /^[0-9A-F]{32}$/.test(id))
      )];

      if (uniqueHexIds.length === 0) return {};

      const placeholders = uniqueHexIds.map((_, i) => `HEXTORAW(:${i + 2})`).join(',');

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
        WHERE ou.ENTERPRISE_ID = :1
          AND ou.ORG_UNIT_ID IN (${placeholders})
      `;

      const binds = [tenantId, ...uniqueHexIds];
      const result = await db.executeQuery(sql, binds);

      const orgUnits = {};
      (result.rows || []).forEach(row => {
        const ou = this.toSnake(row);
        const hexId = ou.org_unit_id;
        if (!hexId) return;

        const parentId = ou.parent_org_unit_id_full ?? ou.parent_org_unit_id ?? null;
        orgUnits[hexId] = {
          org_unit_id: hexId,
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
      });

      return orgUnits;
    } catch (error) {
      console.error('Error batch fetching org units:', error);
      return {};
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

  /**
   * Build display name from EMPL.EMPLOYEES name parts (EN).
   */
  static buildEmployeeDisplayName(row) {
    if (!row) return null;
    const parts = [
      row.first_name_en,
      row.middle_name_en,
      row.last_name_en
    ].filter((p) => p != null && String(p).trim() !== '');
    const name = parts.map((p) => String(p).trim()).join(' ').trim();
    return name || null;
  }

  /**
   * Batch-load minimal employee info for schedule assignments (EMPLOYEE level).
   * Single round-trip; avoids N+1. Name from EN fields; code from EMPLOYEE_NUMBER on assignment if present else employee_id string.
   */
  static async batchGetEmployeeMiniDetails(employeeIds, tenantId) {
    if (!employeeIds?.length || tenantId == null) return {};
    const uniqueIds = [...new Set(employeeIds.filter((id) => id != null && !isNaN(Number(id))).map((id) => Number(id)))];
    if (!uniqueIds.length) return {};

    const empPlaceholders = uniqueIds.map((_, i) => `:${i + 2}`).join(',');
    const empSql = `
      SELECT e.EMPLOYEE_ID, e.FIRST_NAME_EN, e.MIDDLE_NAME_EN, e.LAST_NAME_EN
      FROM EMPL.EMPLOYEES e
      WHERE e.ENTERPRISE_ID = :1 AND e.EMPLOYEE_ID IN (${empPlaceholders})
    `;
    const empBinds = [tenantId, ...uniqueIds];

    try {
      // Two batched calls in parallel: names from EMPL.EMPLOYEES; code from latest EMPL.ASSIGNMENTS row per employee
      // ENTERPRISE_ID on ASSIGNMENTS may not exist in all schemas; filter by EMPLOYEE_ID only (ids already scoped by tenant via EMPL.EMPLOYEES)
      const numPlaceholders = uniqueIds.map((_, i) => `:${i + 1}`).join(',');
      const numSql = `
        SELECT EMPLOYEE_ID, EMPLOYEE_NUMBER FROM (
          SELECT a.EMPLOYEE_ID, a.EMPLOYEE_NUMBER,
                 ROW_NUMBER() OVER (PARTITION BY a.EMPLOYEE_ID ORDER BY a.ASSIGNMENT_ID DESC NULLS LAST) AS rn
          FROM EMPL.ASSIGNMENTS a
          WHERE a.EMPLOYEE_ID IN (${numPlaceholders})
        ) WHERE rn = 1
      `;

      const numBinds = [...uniqueIds];
      const [empResult, numResult] = await Promise.all([
        db.executeQuery(empSql, empBinds),
        db.executeQuery(numSql, numBinds).catch(() => ({ rows: [] }))
      ]);

      const numberById = {};
      for (const row of numResult.rows || []) {
        const r = this.toSnake(row);
        if (r.employee_id != null) numberById[r.employee_id] = r.employee_number;
      }

      const map = {};
      for (const row of empResult.rows || []) {
        const r = this.toSnake(row);
        const id = r.employee_id;
        if (id == null) continue;
        const num = numberById[id];
        const code = num != null && String(num).trim() !== '' ? String(num).trim() : String(id);
        map[id] = { name: this.buildEmployeeDisplayName(r), code };
      }
      return map;
    } catch (error) {
      console.error('Error batch fetching employee mini details:', error);
      return {};
    }
  }

  static async batchGetOrgStructureDetails(structureIdHexArray) {
    if (!structureIdHexArray || structureIdHexArray.length === 0) return {};
    try {
      const uniqueHex = [...new Set(
        structureIdHexArray
          .map(id => id ? this.normalizeHex32(id) : null)
          .filter(id => id && /^[0-9A-F]{32}$/.test(id))
      )];
      if (uniqueHex.length === 0) return {};

      const placeholders = uniqueHex.map((_, i) => `HEXTORAW(:${i + 1})`).join(',');
      const sql = `
        SELECT
          RAWTOHEX(s.STRUCTURE_ID) AS STRUCTURE_ID,
          s.STRUCTURE_CODE,
          s.STRUCTURE_NAME
        FROM ENT.HR_ORG_STRUCTURES s
        WHERE s.STRUCTURE_ID IN (${placeholders})
      `;
      const result = await db.executeQuery(sql, uniqueHex);
      const structures = {};
      (result.rows || []).forEach(row => {
        const r = this.toSnake(row);
        if (r.structure_id) {
          structures[r.structure_id] = {
            id: r.structure_id,
            name: r.structure_name ?? null,
            code: r.structure_code ?? null
          };
        }
      });
      return structures;
    } catch (error) {
      console.error('Error batch fetching org structures:', error);
      return {};
    }
  }

  static async getActiveOrgStructureForEnterprise(enterpriseId) {
    try {
      if (!enterpriseId) return null;
      // Thin query — avoid HrOrgStructureModel.findAll (JOINs + counts) for list enrichment latency
      const sql = `
        SELECT RAWTOHEX(s.STRUCTURE_ID) AS STRUCTURE_ID, s.STRUCTURE_CODE, s.STRUCTURE_NAME
        FROM ENT.HR_ORG_STRUCTURES s
        WHERE s.ENTERPRISE_ID = :1 AND UPPER(NVL(s.IS_ACTIVE,'Y')) = 'Y'
        ORDER BY s.LAST_UPDATED_DATE DESC NULLS LAST
        FETCH FIRST 1 ROWS ONLY
      `;
      const result = await db.executeQuery(sql, [enterpriseId]);
      const row = result.rows?.[0];
      if (!row) return null;
      const r = this.toSnake(row);
      if (!r.structure_id) return null;
      return { id: r.structure_id, name: r.structure_name ?? null, code: r.structure_code ?? null };
    } catch (error) {
      console.error('Error fetching active org structure for enterprise:', error);
      return null;
    }
  }

  /* =========================
   * Enrichment (ORG PATH always)
   * ========================= */

  static async enrichAssignment(a, tenantId, cache = {}) {
    a.org_path = [];

    // ✅ FIX: work schedule should NEVER disappear
    a.work_schedule = null;
    if (a.work_schedule_id) {
      const id = a.work_schedule_id;

      if (cache?.workSchedules) {
        a.work_schedule = cache.workSchedules[id] ?? null;

        // fallback if missing from batch cache
        if (a.work_schedule === null) {
          a.work_schedule = await this.getWorkScheduleDetails(id, tenantId);
          cache.workSchedules[id] = a.work_schedule;
        }
      } else {
        a.work_schedule = await this.getWorkScheduleDetails(id, tenantId);
      }
    }

    // department assignment
    if (String(a.assignment_level || '').toUpperCase() === 'DEPARTMENT' && a.department_id) {
      const depHex = this.normalizeHex32(a.department_id);
      a.department_id = depHex;
      a.org_unit_id = depHex;

      // org unit
      if (cache.orgUnits && cache.orgUnits[depHex] !== undefined) {
        a.org_unit = cache.orgUnits[depHex] || null;
      } else if (!cache.orgUnits) {
        a.org_unit = await this.getOrgUnitDetails(depHex, tenantId);
      }

      // org structure
      if (a.org_unit && a.org_unit.org_structure_id) {
        if (cache.orgStructures && cache.orgStructures[a.org_unit.org_structure_id] !== undefined) {
          a.org_structure = cache.orgStructures[a.org_unit.org_structure_id] || null;
        } else if (!cache.orgStructures) {
          a.org_structure = await this.getOrgStructureDetails(a.org_unit.org_structure_id);
        }
      }

      // org path (batch preferred + fallback)
      const fromBatch = cache?.orgPaths?.[depHex];
      if (Array.isArray(fromBatch) && fromBatch.length) {
        a.org_path = fromBatch;
      } else {
        a.org_path = await this.fetchOrgPath(depHex);
      }
    } else {
      if (a.department_id) a.department_id = this.normalizeHex32(a.department_id);
    }

    // EMPLOYEE-level: attach minimal employee { name, code } from batch cache (no N+1)
    a.employee = null;
    if (String(a.assignment_level || '').toUpperCase() === 'EMPLOYEE' && a.employee_id != null) {
      const eid = Number(a.employee_id);
      if (!isNaN(eid) && cache?.employees) {
        a.employee = cache.employees[eid] ?? null;
      }
    }

    // fallback active org structure (only when enrichment expects org context)
    if (!a.org_structure && tenantId && cache?.loadActiveOrgStructure !== false) {
      if (cache.activeOrgStructure !== undefined) {
        a.org_structure = cache.activeOrgStructure;
      } else {
        a.org_structure = await this.getActiveOrgStructureForEnterprise(tenantId);
        if (cache) cache.activeOrgStructure = a.org_structure;
      }
    }

    return a;
  }

  /**
   * Sync merge only — no DB. Eliminates N+1 from Promise.all(enrichAssignment) on list.
   */
  static assignEnrichmentFromCache(a, cache) {
    a.org_path = [];
    a.work_schedule = null;
    if (a.work_schedule_id && cache.workSchedules) {
      a.work_schedule = cache.workSchedules[a.work_schedule_id] ?? null;
    }

    const level = String(a.assignment_level || '').toUpperCase();
    if (level === 'DEPARTMENT' && a.department_id) {
      const depHex = this.normalizeHex32(a.department_id);
      a.department_id = depHex;
      a.org_unit_id = depHex;
      a.org_unit = cache.orgUnits?.[depHex] ?? null;
      if (a.org_unit?.org_structure_id && cache.orgStructures) {
        a.org_structure = cache.orgStructures[a.org_unit.org_structure_id] ?? null;
      } else {
        a.org_structure = null;
      }
      const fromBatch = cache.orgPaths?.[depHex];
      a.org_path = Array.isArray(fromBatch) ? fromBatch : [];
    } else {
      if (a.department_id) a.department_id = this.normalizeHex32(a.department_id);
      a.org_unit = null;
      a.org_structure = null;
    }

    a.employee = null;
    if (level === 'EMPLOYEE' && a.employee_id != null && cache.employees) {
      const eid = Number(a.employee_id);
      if (!isNaN(eid)) a.employee = cache.employees[eid] ?? null;
    }

    if (!a.org_structure && cache.loadActiveOrgStructure && cache.activeOrgStructure != null) {
      a.org_structure = cache.activeOrgStructure;
    }
    return a;
  }

  /**
   * Batch enrichment for list/detail. Options:
   * - includeOrgPath: false skips CONNECT BY org path batch (large win for list UI that doesn't need path)
   */
  static async enrichAssignmentsBatch(assignments, tenantId, options = {}) {
    if (!assignments || assignments.length === 0) return assignments;

    const includeOrgPath = options.includeOrgPath !== false;

    const workScheduleIds = [];
    const orgUnitIds = [];
    const employeeIds = [];
    const structureIds = new Set();

    for (const a of assignments) {
      if (a.work_schedule_id) workScheduleIds.push(a.work_schedule_id);

      const level = String(a.assignment_level || '').toUpperCase();
      if (level === 'DEPARTMENT' && a.department_id) {
        orgUnitIds.push(this.normalizeHex32(a.department_id));
      }
      if (level === 'EMPLOYEE' && a.employee_id != null) {
        employeeIds.push(a.employee_id);
      }
    }

    const hasDepartment = orgUnitIds.length > 0;

    // Parallel batch loads; org path is the heaviest — optional skip
    const [workSchedules, orgUnits, orgPaths, employees, activeOrgStructure] = await Promise.all([
      this.batchGetWorkScheduleDetails(workScheduleIds, tenantId),
      hasDepartment ? this.batchGetOrgUnitDetails(orgUnitIds, tenantId) : Promise.resolve({}),
      hasDepartment && includeOrgPath ? this.batchFetchOrgPaths(orgUnitIds) : Promise.resolve({}),
      employeeIds.length ? this.batchGetEmployeeMiniDetails(employeeIds, tenantId) : Promise.resolve({}),
      hasDepartment ? this.getActiveOrgStructureForEnterprise(tenantId) : Promise.resolve(null)
    ]);

    if (hasDepartment) {
      Object.values(orgUnits).forEach((ou) => {
        if (ou?.org_structure_id) structureIds.add(ou.org_structure_id);
      });
    }

    const orgStructures = hasDepartment && structureIds.size
      ? await this.batchGetOrgStructureDetails([...structureIds])
      : {};

    const cache = {
      workSchedules,
      orgUnits,
      orgStructures,
      activeOrgStructure,
      orgPaths,
      employees,
      loadActiveOrgStructure: hasDepartment
    };

    // Sync merge — no per-row await (fixes list response time)
    for (const a of assignments) {
      this.assignEnrichmentFromCache(a, cache);
    }
    return assignments;
  }

  /* =========================
   * CRUD
   * ========================= */

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
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
          departmentId: { val: departmentRaw, dir: oracledb.BIND_IN },
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

        const selRes = await connection.execute(
          `SELECT
            SCHEDULE_ASSIGNMENT_ID, TENANT_ID, ASSIGNMENT_LEVEL, DEPARTMENT_ID, EMPLOYEE_ID,
            WORK_SCHEDULE_ID, EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, STATUS, NOTES,
            CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
           FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`,
          [returnedId, data.TENANT_ID],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!selRes.rows?.length) return { schedule_assignment_id: returnedId, tenant_id: data.TENANT_ID };

        const a = this.toSnake(selRes.rows[0]);
        if (String(a.assignment_level || '').toUpperCase() === 'DEPARTMENT' && a.department_id) {
          a.department_id = this.normalizeHex32(a.department_id);
          a.org_unit_id = a.department_id;
        } else if (a.department_id) {
          a.department_id = this.normalizeHex32(a.department_id);
        }
        return a;
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) throw error;

      const ora = this.extractOraCode(error);
      if (error?.errorNum !== undefined || ora) {
        throw new DatabaseError(
          ora ? `${ora}: ${error.message || String(error)}` : (error.message || 'Oracle database error'),
          error
        );
      }
      throw new DatabaseError('Failed to create schedule assignment', error);
    }
  }

  static async findAll(filters = {}) {
    try {
      if (filters.tenantId === null || filters.tenantId === undefined) {
        throw new ValidationError('tenant_id is required');
      }
      if (filters.userId === null || filters.userId === undefined) {
        throw new ValidationError('user_id is required for data-access filtering');
      }

      const includeEnrichment = filters.includeEnrichment !== false;
      const pagination = filters.pagination;

      // FNDSEC DB-level data access. Employee rows use CAN_ACCESS_EMPLOYEE;
      // department/org rows use CAN_ACCESS_ORG_UNIT against DEPARTMENT_ID
      // (the org-unit RAW column on ENT.TM_SCHEDULE_ASSIGNMENTS).
      //
      // Named binds (object) are required here because the security predicate
      // references :user_id more than once. With oracledb positional/array
      // binds, each :N occurrence counts as a separate position and causes
      // ORA-01008.
      const fromClause = `${this.TABLE_NAME} sa`;
      const securityCondition = employeeAccessPredicate(
        'sa.TENANT_ID',
        'sa.EMPLOYEE_ID',
        'RAWTOHEX(sa.DEPARTMENT_ID)',
        ':user_id'
      );

      let dataSql = `
        SELECT
          sa.SCHEDULE_ASSIGNMENT_ID,
          sa.TENANT_ID,
          sa.ASSIGNMENT_LEVEL,
          sa.DEPARTMENT_ID,
          sa.EMPLOYEE_ID,
          sa.WORK_SCHEDULE_ID,
          sa.EFFECTIVE_START_DATE,
          sa.EFFECTIVE_END_DATE,
          sa.STATUS,
          sa.NOTES,
          sa.CREATION_DATE,
          sa.CREATED_BY,
          sa.LAST_UPDATE_DATE,
          sa.LAST_UPDATED_BY`;

      if (pagination?.page && pagination?.pageSize) {
        dataSql += `,
          COUNT(*) OVER() AS total`;
      }
      dataSql += `
        FROM ${fromClause}`;

      const conditions = [];
      const binds = {
        user_id: filters.userId,
        tenant_id: filters.tenantId
      };

      conditions.push(`sa.TENANT_ID = :tenant_id`);

      // Security filter must always apply, regardless of filters/search/page.
      conditions.push(securityCondition);

      if (filters.assignmentLevel) {
        conditions.push(`UPPER(sa.ASSIGNMENT_LEVEL) = :assignment_level`);
        binds.assignment_level = String(filters.assignmentLevel).toUpperCase();
      }

      if (filters.orgUnitId !== undefined && filters.orgUnitId !== null) {
        const depHex = this.ensureHex32(filters.orgUnitId, 'org_unit_id');
        conditions.push(`sa.DEPARTMENT_ID = HEXTORAW(:org_unit_id_hex)`);
        binds.org_unit_id_hex = depHex;
      }

      if (filters.orgStructureId !== undefined && filters.orgStructureId !== null) {
        const structHex = this.ensureHex32(filters.orgStructureId, 'org_structure_id');
        conditions.push(`
          EXISTS (
            SELECT 1
            FROM ENT.ORG_UNITS ou
            WHERE ou.ORG_UNIT_ID = sa.DEPARTMENT_ID
              AND sa.DEPARTMENT_ID IS NOT NULL
              AND ou.ORG_STRUCTURE_ID = HEXTORAW(:org_structure_id_hex)
          )
        `);
        binds.org_structure_id_hex = structHex;
      }

      if (filters.employeeId !== undefined && filters.employeeId !== null) {
        conditions.push(`sa.EMPLOYEE_ID = :employee_id`);
        binds.employee_id = filters.employeeId;
      }

      if (filters.status) {
        conditions.push(`UPPER(sa.STATUS) = :status_filter`);
        binds.status_filter = String(filters.status).toUpperCase();
      }

      if (filters.effectiveOn) {
        const d = (filters.effectiveOn instanceof Date) ? filters.effectiveOn : new Date(filters.effectiveOn);
        conditions.push(`sa.EFFECTIVE_START_DATE <= :effective_on AND (sa.EFFECTIVE_END_DATE IS NULL OR sa.EFFECTIVE_END_DATE >= :effective_on)`);
        binds.effective_on = d;
      }

      const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
      dataSql += where;
      dataSql += ` ORDER BY sa.SCHEDULE_ASSIGNMENT_ID DESC`;

      let total = 0;
      const dataBinds = { ...binds };

      if (pagination?.page && pagination?.pageSize) {
        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :row_offset ROWS FETCH NEXT :row_limit ROWS ONLY`;
        dataBinds.row_offset = offset;
        dataBinds.row_limit = pagination.pageSize;
      }

      const result = await db.executeQuery(dataSql, dataBinds);
      const rows = result.rows || [];

      const assignments = rows.map((r) => {
        const a = this.toSnake(r);
        if (String(a.assignment_level || '').toUpperCase() === 'DEPARTMENT' && a.department_id) {
          a.department_id = this.normalizeHex32(a.department_id);
          a.org_unit_id = a.department_id;
        } else if (a.department_id) {
          a.department_id = this.normalizeHex32(a.department_id);
        }
        return a;
      });

      if (pagination?.page && pagination?.pageSize) {
        if (assignments.length > 0) {
          const totalFromRow = Number(assignments[0].total);
          total = Number.isFinite(totalFromRow) ? totalFromRow : 0;
          assignments.forEach(a => { delete a.total; });
        } else {
          // Count fallback must use the same FROM/WHERE so the total
          // reflects only rows the acting user is authorized to see.
          const countSql = `SELECT COUNT(*) AS total FROM ${fromClause}${where}`;
          const countResult = await db.executeQuery(countSql, { ...binds });
          total = countResult.rows?.[0]?.TOTAL ?? countResult.rows?.[0]?.total ?? 0;
        }
      }

      let output = assignments;
      if (includeEnrichment && assignments.length > 0) {
        // includeOrgPath false skips CONNECT BY batch — much faster for list endpoints
        output = await this.enrichAssignmentsBatch(assignments, filters.tenantId, {
          includeOrgPath: filters.includeOrgPath !== false
        });
      } else if (!includeEnrichment) {
        output = assignments.map((a) => ({
          ...a,
          work_schedule: null,
          org_unit: null,
          org_structure: null,
          org_path: [],
          employee: null
        }));
      }

      return pagination?.page && pagination?.pageSize
        ? { assignments: output, total }
        : { assignments: output, total: output.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch schedule assignments: ${error.message}`, error);
    }
  }

  /**
   * @param {number} scheduleAssignmentId
   * @param {number} tenantId   - enterprise_id
   * @param {number|null} [userId] - When provided, enforces FNDSEC data access:
   *   EMPLOYEE rows use CAN_ACCESS_EMPLOYEE; DEPARTMENT rows use
   *   CAN_ACCESS_ORG_UNIT against DEPARTMENT_ID. Passing null/undefined keeps
   *   legacy behavior (used by create/update/delete flows).
   */
  static async findById(scheduleAssignmentId, tenantId, userId = null) {
    try {
      if (tenantId === null || tenantId === undefined) throw new ValidationError('tenant_id is required');

      const applySecurity = userId !== null && userId !== undefined;
      // Use named binds: the security predicate references :user_id twice.
      const securityCondition = employeeAccessPredicate(
        'sa.TENANT_ID',
        'sa.EMPLOYEE_ID',
        'RAWTOHEX(sa.DEPARTMENT_ID)',
        ':user_id'
      );
      const sql = applySecurity
        ? `
          SELECT
            sa.SCHEDULE_ASSIGNMENT_ID,
            sa.TENANT_ID,
            sa.ASSIGNMENT_LEVEL,
            sa.DEPARTMENT_ID,
            sa.EMPLOYEE_ID,
            sa.WORK_SCHEDULE_ID,
            sa.EFFECTIVE_START_DATE,
            sa.EFFECTIVE_END_DATE,
            sa.STATUS,
            sa.NOTES,
            sa.CREATION_DATE,
            sa.CREATED_BY,
            sa.LAST_UPDATE_DATE,
            sa.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} sa
          WHERE sa.SCHEDULE_ASSIGNMENT_ID = :schedule_assignment_id
            AND sa.TENANT_ID = :tenant_id
            AND ${securityCondition}
        `
        : `
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
          WHERE SCHEDULE_ASSIGNMENT_ID = :schedule_assignment_id
            AND TENANT_ID = :tenant_id
        `;

      const binds = applySecurity
        ? { user_id: userId, schedule_assignment_id: scheduleAssignmentId, tenant_id: tenantId }
        : { schedule_assignment_id: scheduleAssignmentId, tenant_id: tenantId };

      const result = await db.executeQuery(sql, binds);
      if (!result.rows?.length) return null;

      const assignment = this.toSnake(result.rows[0]);
      if (String(assignment.assignment_level || '').toUpperCase() === 'DEPARTMENT' && assignment.department_id) {
        assignment.department_id = this.normalizeHex32(assignment.department_id);
        assignment.org_unit_id = assignment.department_id;
      } else if (assignment.department_id) {
        assignment.department_id = this.normalizeHex32(assignment.department_id);
      }
      const [enriched] = await this.enrichAssignmentsBatch([assignment], tenantId);
      return enriched || assignment;
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

        const fields = [];
        const bindParams = [];
        let p = 1;

        if (data.WORK_SCHEDULE_ID !== undefined) { fields.push(`WORK_SCHEDULE_ID = :${p}`); bindParams.push(data.WORK_SCHEDULE_ID === null ? null : data.WORK_SCHEDULE_ID); p++; }
        if (data.DEPARTMENT_ID !== undefined) { fields.push(`DEPARTMENT_ID = :${p}`); bindParams.push(data.DEPARTMENT_ID === null ? null : this.hexToRawBuffer(data.DEPARTMENT_ID)); p++; }
        if (data.EMPLOYEE_ID !== undefined) { fields.push(`EMPLOYEE_ID = :${p}`); bindParams.push(data.EMPLOYEE_ID === null ? null : data.EMPLOYEE_ID); p++; }
        if (data.EFFECTIVE_START_DATE !== undefined) { fields.push(`EFFECTIVE_START_DATE = :${p}`); bindParams.push(newStartDate); p++; }
        if (data.EFFECTIVE_END_DATE !== undefined) { fields.push(`EFFECTIVE_END_DATE = :${p}`); bindParams.push(newEndDate); p++; }
        if (data.STATUS !== undefined) { fields.push(`STATUS = :${p}`); bindParams.push(data.STATUS === null ? null : String(data.STATUS).toUpperCase()); p++; }
        if (data.NOTES !== undefined) { fields.push(`NOTES = :${p}`); bindParams.push(data.NOTES); p++; }

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
        if (String(assignment.assignment_level || '').toUpperCase() === 'DEPARTMENT' && assignment.department_id) {
          assignment.department_id = this.normalizeHex32(assignment.department_id);
          assignment.org_unit_id = assignment.department_id;
        } else if (assignment.department_id) {
          assignment.department_id = this.normalizeHex32(assignment.department_id);
        }
        const [enriched] = await this.enrichAssignmentsBatch([assignment], tenantId);
        return enriched || assignment;
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
