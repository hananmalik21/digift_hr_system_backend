import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../utils/errors/index.js';

/**
 * Schedule Assignment Model
 * Handles all database operations for ENT.TM_SCHEDULE_ASSIGNMENTS table
 */
class ScheduleAssignmentModel {
  static TABLE_NAME = 'ENT.TM_SCHEDULE_ASSIGNMENTS';

  /* =========================
   * Helpers
   * ========================= */

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
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      throw error;
    } finally {
      if (connection?.close) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /* =========================
   * Validations
   * ========================= */

  static async validateOrgUnitExists(orgUnitId, tenantId) {
    try {
      const sql = `SELECT 1 FROM ENT.ORG_UNITS
                   WHERE ORG_UNIT_ID = :1 AND ENTERPRISE_ID = :2`;
      const result = await db.executeQuery(sql, [orgUnitId, tenantId]);
      if (!result.rows?.length) {
        throw new NotFoundError(`Organization unit with ID ${orgUnitId} does not exist for tenant ${tenantId}`);
      }
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to validate organization unit', error);
    }
  }

  static async validateWorkScheduleExists(workScheduleId, tenantId) {
    try {
      const sql = `SELECT 1 FROM ENT.TM_WORK_SCHEDULES
                   WHERE WORK_SCHEDULE_ID = :1 AND TENANT_ID = :2`;
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

  /**
   * Checks if an ACTIVE assignment overlaps with another ACTIVE assignment
   * for the same target (department or employee).
   *
   * Returns the first overlapping row or null.
   */
  static async checkOverlap(connection, {
    tenantId,
    assignmentLevel,       // 'DEPARTMENT' | 'EMPLOYEE'
    departmentId = null,
    employeeId = null,
    startDate,
    endDate = null,
    excludeId = null
  }) {
    const level = String(assignmentLevel || '').toUpperCase();
    if (!tenantId) throw new ValidationError('tenantId is required for overlap check');
    if (!['DEPARTMENT', 'EMPLOYEE'].includes(level)) {
      throw new ValidationError('assignmentLevel must be DEPARTMENT or EMPLOYEE for overlap check');
    }
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new ValidationError('startDate must be a valid Date for overlap check');
    }
    if (endDate !== null && (!(endDate instanceof Date) || isNaN(endDate.getTime()))) {
      throw new ValidationError('endDate must be null or a valid Date for overlap check');
    }

    // Enforce correct target keys
    if (level === 'DEPARTMENT') {
      if (!departmentId && departmentId !== 0) throw new ValidationError('departmentId is required for DEPARTMENT overlap check');
      employeeId = null;
    } else {
      if (!employeeId && employeeId !== 0) throw new ValidationError('employeeId is required for EMPLOYEE overlap check');
      departmentId = null;
    }

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
        STATUS
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :tenantId
        AND UPPER(NVL(STATUS,'ACTIVE')) = 'ACTIVE'
        AND UPPER(ASSIGNMENT_LEVEL) = UPPER(:assignmentLevel)
        AND (:excludeId IS NULL OR SCHEDULE_ASSIGNMENT_ID <> :excludeId)
        AND (
          (UPPER(:assignmentLevel) = 'DEPARTMENT' AND DEPARTMENT_ID = :departmentId)
          OR
          (UPPER(:assignmentLevel) = 'EMPLOYEE' AND EMPLOYEE_ID = :employeeId)
        )
        -- overlap: new_start <= existing_end AND new_end >= existing_start
        AND :startDate <= NVL(EFFECTIVE_END_DATE, DATE '9999-12-31')
        AND NVL(:endDate, DATE '9999-12-31') >= EFFECTIVE_START_DATE
      FETCH FIRST 1 ROWS ONLY
    `;

    const binds = {
      tenantId,
      assignmentLevel: level,
      departmentId,
      employeeId,
      excludeId,
      startDate,
      endDate
    };

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    return result.rows?.[0] || null;
  }

  /* =========================
   * Enrichment Helpers
   * ========================= */

  static async getWorkScheduleDetails(workScheduleId, tenantId) {
    try {
      const sql = `SELECT
        ws.WORK_SCHEDULE_ID,
        ws.TENANT_ID,
        ws.SCHEDULE_CODE,
        ws.SCHEDULE_NAME_EN,
        ws.SCHEDULE_NAME_AR
      FROM ENT.TM_WORK_SCHEDULES ws
      WHERE ws.WORK_SCHEDULE_ID = :1 AND ws.TENANT_ID = :2`;

      const result = await db.executeQuery(sql, [workScheduleId, tenantId]);
      if (!result.rows?.length) return null;
      return this.convertKeysToSnakeCase(result.rows[0]);
    } catch (error) {
      console.error('Error fetching work schedule details:', error);
      return null;
    }
  }

  static async getOrgUnitDetails(orgUnitId, tenantId) {
    try {
      const sql = `SELECT
        ou.ORG_UNIT_ID,
        ou.ORG_STRUCTURE_ID,
        ou.ENTERPRISE_ID,
        ou.LEVEL_CODE,
        ou.ORG_UNIT_CODE,
        ou.ORG_UNIT_NAME_EN,
        ou.ORG_UNIT_NAME_AR,
        ou.PARENT_ORG_UNIT_ID,
        p.ORG_UNIT_ID AS PARENT_ORG_UNIT_ID_FULL,
        p.ORG_UNIT_NAME_EN AS PARENT_ORG_UNIT_NAME_EN,
        p.ORG_UNIT_NAME_AR AS PARENT_ORG_UNIT_NAME_AR,
        p.LEVEL_CODE AS PARENT_ORG_LEVEL_CODE
      FROM ENT.ORG_UNITS ou
      LEFT JOIN ENT.ORG_UNITS p ON p.ORG_UNIT_ID = ou.PARENT_ORG_UNIT_ID
      WHERE ou.ORG_UNIT_ID = :1 AND ou.ENTERPRISE_ID = :2`;

      const result = await db.executeQuery(sql, [orgUnitId, tenantId]);
      if (!result.rows?.length) return null;

      const orgUnit = this.convertKeysToSnakeCase(result.rows[0]);
      const parentId = orgUnit.parent_org_unit_id_full ?? orgUnit.parent_org_unit_id ?? null;

      return {
        org_unit_id: orgUnit.org_unit_id,
        org_structure_id: orgUnit.org_structure_id,
        enterprise_id: orgUnit.enterprise_id,
        level_code: orgUnit.level_code,
        org_unit_code: orgUnit.org_unit_code,
        org_unit_name_en: orgUnit.org_unit_name_en,
        org_unit_name_ar: orgUnit.org_unit_name_ar,
        parent_unit: parentId
          ? {
              id: parentId,
              name: orgUnit.parent_org_unit_name_en || orgUnit.parent_org_unit_name_ar || null,
              level: orgUnit.parent_org_level_code || null
            }
          : null
      };
    } catch (error) {
      console.error('Error fetching org unit details:', error);
      return null;
    }
  }

  static async enrichAssignment(assignment, tenantId) {
    if (assignment.work_schedule_id) {
      assignment.work_schedule = await this.getWorkScheduleDetails(
        assignment.work_schedule_id,
        tenantId
      );
    }

    if (assignment.assignment_level === 'DEPARTMENT' && assignment.department_id) {
      assignment.org_unit = await this.getOrgUnitDetails(
        assignment.department_id,
        tenantId
      );
    }

    return assignment;
  }

  /* =========================
   * CRUD
   * ========================= */

  static async create(data, userId) {
    try {
      return await this.executeWithTransaction(async (connection) => {
        // Get next ID from sequence or max+1
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
        const createdBy = userId || 'SYSTEM';

        const assignmentLevel = String(data.ASSIGNMENT_LEVEL || '').toUpperCase();
        const status = String(data.STATUS || 'ACTIVE').toUpperCase();

        const effectiveStartDate = data.EFFECTIVE_START_DATE instanceof Date
          ? data.EFFECTIVE_START_DATE
          : new Date(data.EFFECTIVE_START_DATE);

        const effectiveEndDate = data.EFFECTIVE_END_DATE
          ? (data.EFFECTIVE_END_DATE instanceof Date ? data.EFFECTIVE_END_DATE : new Date(data.EFFECTIVE_END_DATE))
          : null;

        // ✅ APP-side overlap check (only if ACTIVE)
        if (status === 'ACTIVE') {
          const overlap = await this.checkOverlap(connection, {
            tenantId: data.TENANT_ID,
            assignmentLevel,
            departmentId: data.DEPARTMENT_ID || null,
            employeeId: data.EMPLOYEE_ID || null,
            startDate: effectiveStartDate,
            endDate: effectiveEndDate,
            excludeId: null
          });

          if (overlap) {
            // Create a proper conflict error
            const conflictError = {
              errorNum: 20001,
              message: 'Schedule assignment overlaps with an existing assignment',
              code: 'ORA-20001'
            };
            throw new DatabaseError(
              'Schedule assignment overlaps with an existing assignment. Please adjust the effective dates.',
              conflictError
            );
          }
        }

        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
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
          :scheduleAssignmentId, :tenantId, :assignmentLevel, :departmentId, :employeeId,
          :workScheduleId, :effectiveStartDate, :effectiveEndDate, :status, :notes,
          :creationDate, :createdBy, :lastUpdateDate, :lastUpdatedBy
        ) RETURNING SCHEDULE_ASSIGNMENT_ID INTO :returnId`;

        const binds = {
          scheduleAssignmentId: { val: scheduleAssignmentId, dir: oracledb.BIND_IN },
          tenantId: { val: data.TENANT_ID, dir: oracledb.BIND_IN },
          assignmentLevel: { val: assignmentLevel, dir: oracledb.BIND_IN },
          departmentId: { val: data.DEPARTMENT_ID || null, dir: oracledb.BIND_IN },
          employeeId: { val: data.EMPLOYEE_ID || null, dir: oracledb.BIND_IN },
          workScheduleId: { val: data.WORK_SCHEDULE_ID, dir: oracledb.BIND_IN },
          effectiveStartDate: { val: effectiveStartDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          effectiveEndDate: { val: effectiveEndDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          status: { val: status, dir: oracledb.BIND_IN },
          notes: { val: data.NOTES || null, dir: oracledb.BIND_IN },
          creationDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          createdBy: { val: createdBy, dir: oracledb.BIND_IN },
          lastUpdateDate: { val: now, dir: oracledb.BIND_IN, type: oracledb.DATE },
          lastUpdatedBy: { val: createdBy, dir: oracledb.BIND_IN },
          returnId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        };

        const result = await connection.execute(insertSql, binds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        const returnedId = Array.isArray(result.outBinds.returnId)
          ? result.outBinds.returnId[0]
          : result.outBinds.returnId;

        return {
          SCHEDULE_ASSIGNMENT_ID: returnedId,
          TENANT_ID: data.TENANT_ID
        };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) {
        throw error;
      }

      // Log the error for debugging
      console.error('Error in create schedule assignment:', {
        error,
        errorType: typeof error,
        errorNum: error?.errorNum,
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });

      // Check if it's an Oracle error
      const isOracleError = error?.errorNum !== undefined || 
                           error?.code?.includes('ORA-') ||
                           String(error?.message || '').includes('ORA-') ||
                           String(error?.message || '').includes('unique constraint') ||
                           String(error?.message || '').includes('already exists');

      if (isOracleError) {
        // Ensure we have a proper Oracle error object
        const oracleError = {
          errorNum: error.errorNum || (String(error?.message || '').includes('ORA-00001') ? 1 : undefined),
          message: error.message || String(error),
          code: error.code || (String(error?.message || '').match(/ORA-\d{5}/)?.[0])
        };
        
        const ora = this.extractOraCode(error);
        throw new DatabaseError(
          ora ? `${ora}: ${error.message || String(error)}` : (error.message || 'Oracle database error'),
          oracleError
        );
      }

      // For other errors, wrap them properly
      throw new DatabaseError('Failed to create schedule assignment', error);
    }
  }

  static async findAll(filters = {}) {
    try {
      if (!filters.tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      let countSql = `SELECT COUNT(*) AS total FROM ${this.TABLE_NAME}`;
      let dataSql = `SELECT
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
      FROM ${this.TABLE_NAME}`;

      const conditions = [];
      const binds = [];
      let p = 1;

      conditions.push(`TENANT_ID = :${p}`);
      binds.push(filters.tenantId);
      p++;

      if (filters.assignmentLevel) {
        conditions.push(`ASSIGNMENT_LEVEL = :${p}`);
        binds.push(filters.assignmentLevel);
        p++;
      }

      if (filters.orgUnitId !== undefined && filters.orgUnitId !== null) {
        conditions.push(`DEPARTMENT_ID = :${p}`);
        binds.push(filters.orgUnitId);
        p++;
      }

      if (filters.employeeId !== undefined && filters.employeeId !== null) {
        conditions.push(`EMPLOYEE_ID = :${p}`);
        binds.push(filters.employeeId);
        p++;
      }

      if (filters.status) {
        conditions.push(`STATUS = :${p}`);
        binds.push(filters.status);
        p++;
      }

      if (filters.effectiveOn) {
        const effectiveDate = filters.effectiveOn instanceof Date
          ? filters.effectiveOn
          : new Date(filters.effectiveOn);
        conditions.push(`EFFECTIVE_START_DATE <= :${p} AND (EFFECTIVE_END_DATE IS NULL OR EFFECTIVE_END_DATE >= :${p})`);
        binds.push(effectiveDate);
        p++;
      }

      const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      countSql += where;
      dataSql += where;
      dataSql += ` ORDER BY SCHEDULE_ASSIGNMENT_ID DESC`;

      const pagination = filters.pagination;
      let total = 0;

      const dataBinds = [...binds];
      if (pagination?.page && pagination?.pageSize) {
        const countResult = await db.executeQuery(countSql, [...binds]);
        total = countResult.rows?.[0]?.TOTAL || 0;

        const offset = (pagination.page - 1) * pagination.pageSize;
        dataSql += ` OFFSET :${p} ROWS FETCH NEXT :${p + 1} ROWS ONLY`;
        dataBinds.push(offset, pagination.pageSize);
      } else {
        const countResult = await db.executeQuery(countSql, [...binds]);
        total = countResult.rows?.[0]?.TOTAL || 0;
      }

      const result = await db.executeQuery(dataSql, dataBinds);
      const assignments = this.convertKeysToSnakeCase(result.rows || []);

      const enrichedAssignments = await Promise.all(
        assignments.map(a => this.enrichAssignment(a, filters.tenantId))
      );

      return pagination?.page
        ? { assignments: enrichedAssignments, total }
        : { assignments: enrichedAssignments, total: enrichedAssignments.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch schedule assignments: ${error.message}`, error);
    }
  }

  static async findById(scheduleAssignmentId, tenantId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      const sql = `SELECT
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
      WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`;

      const result = await db.executeQuery(sql, [scheduleAssignmentId, tenantId]);
      if (!result.rows?.length) return null;

      const assignment = this.convertKeysToSnakeCase(result.rows[0]);
      return await this.enrichAssignment(assignment, tenantId);
    } catch (error) {
      if (error instanceof ValidationError) throw error;

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(
          ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'),
          error
        );
      }

      throw new DatabaseError('Failed to fetch schedule assignment', error);
    }
  }

  static async update(scheduleAssignmentId, tenantId, data, userId) {
    try {
      if (!tenantId) throw new ValidationError('tenant_id is required');

      return await this.executeWithTransaction(async (connection) => {
        // Lock row
        const lockResult = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2
           FOR UPDATE`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!lockResult.rows?.length) throw new NotFoundError('Schedule assignment not found');

        // Fetch current row (for PATCH merge)
        const currentRowRes = await connection.execute(
          `SELECT
             TENANT_ID,
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

        const cur = currentRowRes.rows?.[0];
        if (!cur) throw new NotFoundError('Schedule assignment not found');

        const now = new Date();
        const actor = userId || 'SYSTEM';

        const assignmentLevel = String(cur.ASSIGNMENT_LEVEL || '').toUpperCase();

        const newDepartmentId =
          (data.DEPARTMENT_ID !== undefined) ? data.DEPARTMENT_ID : cur.DEPARTMENT_ID;

        const newEmployeeId =
          (data.EMPLOYEE_ID !== undefined) ? data.EMPLOYEE_ID : cur.EMPLOYEE_ID;

        const newEndDate =
          (data.EFFECTIVE_END_DATE !== undefined)
            ? (data.EFFECTIVE_END_DATE === null
                ? null
                : (data.EFFECTIVE_END_DATE instanceof Date
                    ? data.EFFECTIVE_END_DATE
                    : new Date(data.EFFECTIVE_END_DATE)))
            : cur.EFFECTIVE_END_DATE;

        const newStatus =
          (data.STATUS !== undefined && data.STATUS !== null)
            ? String(data.STATUS).toUpperCase()
            : String(cur.STATUS || 'ACTIVE').toUpperCase();

        const startDate = cur.EFFECTIVE_START_DATE;

        // ✅ overlap pre-check (only if resulting status is ACTIVE)
        if (newStatus === 'ACTIVE') {
          const overlap = await this.checkOverlap(connection, {
            tenantId,
            assignmentLevel,
            departmentId: assignmentLevel === 'DEPARTMENT' ? newDepartmentId : null,
            employeeId: assignmentLevel === 'EMPLOYEE' ? newEmployeeId : null,
            startDate,
            endDate: newEndDate,
            excludeId: scheduleAssignmentId
          });

          if (overlap) {
            throw new DatabaseError('SCHEDULE_OVERLAP_CONFLICT', { overlap });
          }
        }

        // Build update
        const updateFields = [];
        const bindParams = [];
        let p = 1;

        if (data.DEPARTMENT_ID !== undefined) {
          updateFields.push(`DEPARTMENT_ID = :${p}`);
          bindParams.push(data.DEPARTMENT_ID === null ? null : data.DEPARTMENT_ID);
          p++;
        }

        if (data.EMPLOYEE_ID !== undefined) {
          updateFields.push(`EMPLOYEE_ID = :${p}`);
          bindParams.push(data.EMPLOYEE_ID === null ? null : data.EMPLOYEE_ID);
          p++;
        }

        if (data.EFFECTIVE_END_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_END_DATE = :${p}`);
          bindParams.push(newEndDate);
          p++;
        }

        if (data.STATUS !== undefined) {
          updateFields.push(`STATUS = :${p}`);
          bindParams.push(data.STATUS);
          p++;
        }

        if (data.NOTES !== undefined) {
          updateFields.push(`NOTES = :${p}`);
          bindParams.push(data.NOTES);
          p++;
        }

        if (updateFields.length === 0) throw new ValidationError('No fields to update');

        updateFields.push(`LAST_UPDATED_BY = :${p}`);
        bindParams.push(actor);
        p++;

        updateFields.push(`LAST_UPDATE_DATE = :${p}`);
        bindParams.push(now);
        p++;

        bindParams.push(scheduleAssignmentId);
        bindParams.push(tenantId);

        const updateSql = `UPDATE ${this.TABLE_NAME}
                           SET ${updateFields.join(', ')}
                           WHERE SCHEDULE_ASSIGNMENT_ID = :${p} AND TENANT_ID = :${p + 1}`;

        await connection.execute(updateSql, bindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        // Fetch updated record
        const selectResult = await connection.execute(
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

        if (!selectResult.rows?.length) throw new NotFoundError('Schedule assignment not found');

        const assignment = this.convertKeysToSnakeCase(selectResult.rows[0]);
        return await this.enrichAssignment(assignment, tenantId);
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) {
        throw error;
      }

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(
          ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'),
          error
        );
      }

      throw new DatabaseError('Failed to update schedule assignment', error);
    }
  }

  /**
   * Delete schedule assignment (hard delete)
   */
  static async delete(scheduleAssignmentId, tenantId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      return await this.executeWithTransaction(async (connection) => {
        // Lock row for delete
        const lockResult = await connection.execute(
          `SELECT 1 FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2
           FOR UPDATE`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!lockResult.rows?.length) {
          throw new NotFoundError('Schedule assignment not found');
        }

        // Delete the assignment
        const deleteResult = await connection.execute(
          `DELETE FROM ${this.TABLE_NAME}
           WHERE SCHEDULE_ASSIGNMENT_ID = :1 AND TENANT_ID = :2`,
          [scheduleAssignmentId, tenantId],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rowsAffected = deleteResult.rowsAffected || deleteResult.rowCount || 0;
        if (rowsAffected === 0) {
          throw new NotFoundError('Schedule assignment not found');
        }

        return { success: true, schedule_assignment_id: scheduleAssignmentId };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof DatabaseError) {
        throw error;
      }

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(
          ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'),
          error
        );
      }

      throw new DatabaseError('Failed to delete schedule assignment', error);
    }
  }
}

export default ScheduleAssignmentModel;
