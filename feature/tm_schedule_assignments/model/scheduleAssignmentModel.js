import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../utils/errors/index.js';

/**
 * Schedule Assignment Model
 * Handles all database operations for ENT.TM_SCHEDULE_ASSIGNMENTS table
 */
class ScheduleAssignmentModel {
  static TABLE_NAME = 'ENT.TM_SCHEDULE_ASSIGNMENTS';

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
   * Extract Oracle error code
   */
  static extractOraCode(error) {
    const msg = String(error?.message || '');
    const m = msg.match(/ORA-\d{5}/);
    return m ? m[0] : null;
  }

  /**
   * Execute query with transaction support
   */
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

  /**
   * Validate that org_unit_id exists in ENT.ORG_UNITS
   */
  static async validateOrgUnitExists(orgUnitId, tenantId) {
    try {
      const sql = `SELECT 1 FROM ENT.ORG_UNITS 
                   WHERE ORG_UNIT_ID = :1 AND TENANT_ID = :2`;
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

  /**
   * Validate that work_schedule_id exists in ENT.TM_WORK_SCHEDULES
   */
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

  /**
   * Create a new schedule assignment
   */
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

        const effectiveStartDate = data.EFFECTIVE_START_DATE instanceof Date
          ? data.EFFECTIVE_START_DATE
          : new Date(data.EFFECTIVE_START_DATE);

        const effectiveEndDate = data.EFFECTIVE_END_DATE
          ? (data.EFFECTIVE_END_DATE instanceof Date ? data.EFFECTIVE_END_DATE : new Date(data.EFFECTIVE_END_DATE))
          : null;

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
          assignmentLevel: { val: data.ASSIGNMENT_LEVEL, dir: oracledb.BIND_IN },
          departmentId: { val: data.DEPARTMENT_ID || null, dir: oracledb.BIND_IN },
          employeeId: { val: data.EMPLOYEE_ID || null, dir: oracledb.BIND_IN },
          workScheduleId: { val: data.WORK_SCHEDULE_ID, dir: oracledb.BIND_IN },
          effectiveStartDate: { val: effectiveStartDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          effectiveEndDate: { val: effectiveEndDate, dir: oracledb.BIND_IN, type: oracledb.DATE },
          status: { val: data.STATUS || 'ACTIVE', dir: oracledb.BIND_IN },
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

      if (error?.errorNum !== undefined || String(error?.message || '').includes('ORA-')) {
        const ora = this.extractOraCode(error);
        throw new DatabaseError(
          ora ? `${ora}: ${error.message}` : (error.message || 'Oracle database error'),
          error
        );
      }

      throw new DatabaseError('Failed to create schedule assignment', error);
    }
  }

  /**
   * Find all schedule assignments with filtering and pagination
   */
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

      return pagination?.page
        ? { assignments, total }
        : { assignments, total: assignments.length };
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new DatabaseError(`Failed to fetch schedule assignments: ${error.message}`, error);
    }
  }

  /**
   * Find schedule assignment by ID
   */
  static async findById(scheduleAssignmentId, tenantId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

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
      if (!result.rows?.length) {
        return null;
      }

      return this.convertKeysToSnakeCase(result.rows[0]);
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

  /**
   * Update schedule assignment
   */
  static async update(scheduleAssignmentId, tenantId, data, userId) {
    try {
      if (!tenantId) {
        throw new ValidationError('tenant_id is required');
      }

      return await this.executeWithTransaction(async (connection) => {
        // Lock row for update
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

        const now = new Date();
        const actor = userId || 'SYSTEM';

        const updateFields = [];
        const bindParams = [];
        let p = 1;

        if (data.EFFECTIVE_END_DATE !== undefined) {
          updateFields.push(`EFFECTIVE_END_DATE = :${p}`);
          bindParams.push(
            data.EFFECTIVE_END_DATE === null
              ? null
              : (data.EFFECTIVE_END_DATE instanceof Date
                  ? data.EFFECTIVE_END_DATE
                  : new Date(data.EFFECTIVE_END_DATE))
          );
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

        if (updateFields.length === 0) {
          throw new ValidationError('No fields to update');
        }

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

        if (!selectResult.rows?.length) {
          throw new NotFoundError('Schedule assignment not found');
        }

        return this.convertKeysToSnakeCase(selectResult.rows[0]);
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
}

export default ScheduleAssignmentModel;

