import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError, NotFoundError } from '../../../utils/errors/index.js';
import { ensureHex32, generateSysGuid, hexToRawBuffer } from '../../../utils/guidUtils.js';

/**
 * Employee Leave Balance Model
 * Handles all database operations for ABS.ABS_EMPLOYEE_LEAVE_BALANCES table
 */
class EmployeeLeaveBalanceModel {
  static TABLE_NAME = 'ABS.ABS_EMPLOYEE_LEAVE_BALANCES';
  static EMPLOYEE_TABLE_NAME = 'EMPL.EMPLOYEES';
  static LEAVE_TYPE_TABLE_NAME = 'ABS.ABS_LEAVE_TYPES';
  static ACCRUAL_MAPPING_TABLE = 'ABS.ABS_LEAVE_TYPE_ACCRUAL';
  static ACCRUAL_PLANS_TABLE = 'ABS.ABS_ACCRUAL_PLANS';
  static TXN_TABLE = 'ABS.ABS_LEAVE_BALANCE_TXNS';
  static ACCRUAL_RUNS_TABLE = 'ABS.ABS_LEAVE_ACCRUAL_RUNS';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  static _toDate(d) {
    if (d === null || d === undefined) return null;
    return d instanceof Date ? d : new Date(d);
  }

  static _isOracleLike(err) {
    if (!err) return false;
    if (err.errorNum !== undefined) return true;
    if (typeof err.message === 'string' && /ORA-\d{5}/i.test(err.message)) return true;
    return false;
  }

  static _oracleErr(err) {
    const seen = new Set();
    let cur = err;

    while (cur && typeof cur === 'object' && !seen.has(cur)) {
      seen.add(cur);

      // node-oracledb format
      if (cur.errorNum !== undefined || cur.offset !== undefined) return cur;

      if (
        cur.oracleError &&
        (cur.oracleError.errorNum !== undefined ||
          /ORA-\d{5}/i.test(cur.oracleError.message || ''))
      ) {
        return cur.oracleError;
      }

      if (cur.originalError) cur = cur.originalError;
      else if (cur.cause) cur = cur.cause;
      else if (cur.inner) cur = cur.inner;
      else if (cur.err) cur = cur.err;
      else break;
    }

    const msg = [
      err?.message,
      err?.oracleError?.message,
      err?.originalError?.message,
      err?.cause?.message
    ]
      .filter(Boolean)
      .join(' | ');

    const m = msg.match(/ORA-(\d{5})/i);
    if (m) {
      return { errorNum: parseInt(m[1], 10), message: msg };
    }

    return err;
  }

  /**
   * ✅ FIXED: Wrap DB errors but preserve original Oracle details (cause/originalError/oracleError)
   */
  static _wrapDb(err, fallbackUserMsg = 'A database error occurred. Please try again later.') {
    const oracleErr = this._oracleErr(err);

    // Already DatabaseError: just ensure properties exist
    if (err instanceof DatabaseError) {
      if (!err.oracleError && this._isOracleLike(oracleErr)) err.oracleError = oracleErr;
      if (!err.originalError) err.originalError = err.cause || oracleErr || err;
      if (!err.cause) err.cause = oracleErr || err; // ✅ important
      return err;
    }

    const userMsg = this._isOracleLike(oracleErr)
      ? (DatabaseError.getUserFriendlyMessage?.(oracleErr) || fallbackUserMsg)
      : fallbackUserMsg;

    const dbErr = new DatabaseError(userMsg, err);

    // ✅ critical: preserve raw error chain
    dbErr.originalError = err;
    dbErr.cause = oracleErr || err; // ✅ important
    if (this._isOracleLike(oracleErr)) dbErr.oracleError = oracleErr;

    return dbErr;
  }

  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) converted[newKey] = value;
      else if (value instanceof Date) converted[newKey] = value;
      else if (value instanceof Buffer) converted[newKey] = value.toString('hex').toUpperCase();
      else if (typeof value === 'object') converted[newKey] = this.convertKeysToSnakeCase(value);
      else converted[newKey] = value;
    }
    return converted;
  }

  static _assertPositionalBinds(sql, binds) {
    if (!Array.isArray(binds)) return;

    const matches = [...String(sql).matchAll(/:(\d+)/g)];
    if (!matches.length) return;

    const nums = matches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
    const maxN = nums.length ? Math.max(...nums) : 0;

    if (binds.length < maxN) {
      const e = new Error(`BIND_MISMATCH: SQL expects :1..:${maxN} but got binds.length=${binds.length}`);
      e.code = 'BIND_MISMATCH';
      e.meta = { expected: maxN, actual: binds.length };
      throw e;
    }
  }

  static async executeQuery(query, bindParams = [], options = {}) {
    try {
      this._assertPositionalBinds(query, bindParams);

      const result = await db.executeQuery(query, bindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        ...options
      });

      if (result.rows) result.rows = this.convertKeysToSnakeCase(result.rows);
      return result;
    } catch (err) {
      throw this._wrapDb(err, 'Failed to execute query');
    }
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
        } catch (_rollbackErr) {
          // Ignore rollback errors; original error is rethrown
        }
      }
      throw error;
    } finally {
      if (connection && connection.close) {
        try {
          await connection.close();
        } catch (_closeErr) {
          // Ignore close errors
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Lookups / Validation                                                */
  /* ------------------------------------------------------------------ */

  static async resolveEmployeeIdByGuid(tenantId, employeeGuid) {
    try {
      const employeeGuidHex = ensureHex32(employeeGuid, 'employeeGuid');

      const query = `SELECT EMPLOYEE_ID
        FROM ${this.EMPLOYEE_TABLE_NAME}
        WHERE ENTERPRISE_ID = :1
          AND RAWTOHEX(EMPLOYEE_GUID) = :2`;

      const result = await this.executeQuery(query, [tenantId, employeeGuidHex]);
      return (result.rows && result.rows.length > 0) ? result.rows[0].employee_id : null;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to resolve employee ID by GUID');
    }
  }

  static async validateLeaveType(connection, tenantId, leaveTypeId) {
    try {
      const sql = `
        SELECT LEAVE_TYPE_ID, TENANT_ID, STATUS
        FROM ${this.LEAVE_TYPE_TABLE_NAME}
        WHERE TENANT_ID = :1
          AND LEAVE_TYPE_ID = :2
          AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'
      `;
      const r = await connection.execute(sql, [tenantId, leaveTypeId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return r.rows?.[0] ? this.convertKeysToSnakeCase(r.rows[0]) : null;
    } catch (error) {
      throw this._wrapDb(error, 'Failed to validate leave type');
    }
  }

  static async getAccrualMapping(connection, tenantId, leaveTypeId, periodStart, periodEnd) {
    try {
      const query = `SELECT
        LEAVE_TYPE_ACCRUAL_ID,
        TENANT_ID,
        LEAVE_TYPE_ID,
        ACCRUAL_PLAN_ID,
        EFFECTIVE_START_DATE,
        EFFECTIVE_END_DATE
      FROM ${this.ACCRUAL_MAPPING_TABLE}
      WHERE TENANT_ID = :1
        AND LEAVE_TYPE_ID = :2
        AND EFFECTIVE_START_DATE <= :3
        AND (EFFECTIVE_END_DATE IS NULL OR EFFECTIVE_END_DATE >= :4)
      ORDER BY EFFECTIVE_START_DATE DESC`;

      const binds = [
        tenantId,
        leaveTypeId,
        this._toDate(periodEnd),
        this._toDate(periodStart)
      ];

      const sql = `SELECT * FROM (${query}) WHERE ROWNUM <= 1`;
      this._assertPositionalBinds(sql, binds);

      const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return (result.rows && result.rows.length > 0) ? this.convertKeysToSnakeCase(result.rows[0]) : null;
    } catch (error) {
      throw this._wrapDb(error, 'Failed to fetch accrual mapping');
    }
  }

  static async getAccrualPlan(connection, tenantId, accrualPlanId) {
    try {
      const query = `SELECT
        ACCRUAL_PLAN_ID,
        TENANT_ID,
        ACCRUAL_RATE_DAYS,
        ACCRUAL_METHOD,
        MAX_BALANCE_DAYS
      FROM ${this.ACCRUAL_PLANS_TABLE}
      WHERE TENANT_ID = :1
        AND ACCRUAL_PLAN_ID = :2`;

      const result = await connection.execute(query, [tenantId, accrualPlanId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      return (result.rows && result.rows.length > 0) ? this.convertKeysToSnakeCase(result.rows[0]) : null;
    } catch (error) {
      throw this._wrapDb(error, 'Failed to fetch accrual plan');
    }
  }

  /* ------------------------------------------------------------------ */
  /* CRUD                                                                */
  /* ------------------------------------------------------------------ */

  static async findAll(tenantId, filters = {}) {
    try {
      let query = `SELECT
        RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
        b.TENANT_ID,
        b.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        b.LEAVE_TYPE_ID,
        b.OPENING_BALANCE_DAYS,
        b.ACCRUED_DAYS,
        b.TAKEN_DAYS,
        b.ADJUSTED_DAYS,
        b.AVAILABLE_DAYS,
        b.LAST_ACCRUAL_DATE,
        b.PERIOD_START_DATE,
        b.PERIOD_END_DATE,
        b.STATUS,
        b.CREATION_DATE,
        b.CREATED_BY,
        b.LAST_UPDATE_DATE,
        b.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} b
      INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
        ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND b.TENANT_ID = e.ENTERPRISE_ID
      WHERE b.TENANT_ID = :1`;

      const bindParams = [tenantId];
      let paramIndex = 2;

      if (filters.employeeId !== undefined && filters.employeeId !== null) {
        const employeeId = parseInt(filters.employeeId);
        if (isNaN(employeeId) || employeeId < 1) throw new ValidationError('employeeId must be a valid positive number');
        query += ` AND b.EMPLOYEE_ID = :${paramIndex}`;
        bindParams.push(employeeId);
        paramIndex++;
      }

      if (filters.leaveTypeId !== undefined && filters.leaveTypeId !== null) {
        const leaveTypeId = parseInt(filters.leaveTypeId);
        if (isNaN(leaveTypeId) || leaveTypeId < 1) throw new ValidationError('leaveTypeId must be a valid positive number');
        query += ` AND b.LEAVE_TYPE_ID = :${paramIndex}`;
        bindParams.push(leaveTypeId);
        paramIndex++;
      }

      if (filters.status !== undefined && filters.status !== null) {
        query += ` AND b.STATUS = :${paramIndex}`;
        bindParams.push(String(filters.status).toUpperCase());
        paramIndex++;
      }

      query += ` ORDER BY b.EMPLOYEE_ID, b.LEAVE_TYPE_ID`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to fetch leave balances');
    }
  }

  static async getBalancesByEmployeeId(tenantId, employeeId, optionalLeaveTypeId = null) {
    try {
      let query = `SELECT
        RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
        b.TENANT_ID,
        b.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        b.LEAVE_TYPE_ID,
        b.OPENING_BALANCE_DAYS,
        b.ACCRUED_DAYS,
        b.TAKEN_DAYS,
        b.ADJUSTED_DAYS,
        b.AVAILABLE_DAYS,
        b.LAST_ACCRUAL_DATE,
        b.PERIOD_START_DATE,
        b.PERIOD_END_DATE,
        b.STATUS,
        b.CREATION_DATE,
        b.CREATED_BY,
        b.LAST_UPDATE_DATE,
        b.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} b
      INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
        ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND b.TENANT_ID = e.ENTERPRISE_ID
      WHERE b.TENANT_ID = :1
        AND b.EMPLOYEE_ID = :2`;

      const bindParams = [tenantId, employeeId];

      if (optionalLeaveTypeId !== null && optionalLeaveTypeId !== undefined) {
        const leaveTypeId = parseInt(optionalLeaveTypeId);
        if (isNaN(leaveTypeId) || leaveTypeId < 1) throw new ValidationError('leave_type_id must be a valid positive number');
        query += ` AND b.LEAVE_TYPE_ID = :3`;
        bindParams.push(leaveTypeId);
      }

      query += ` ORDER BY b.LEAVE_TYPE_ID`;

      const result = await this.executeQuery(query, bindParams);
      return result.rows || [];
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to fetch leave balances by employee ID');
    }
  }

  static async getBalanceByEmployeeAndLeaveType(tenantId, employeeId, leaveTypeId) {
    try {
      const query = `SELECT
        RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
        b.TENANT_ID,
        b.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        b.LEAVE_TYPE_ID,
        b.OPENING_BALANCE_DAYS,
        b.ACCRUED_DAYS,
        b.TAKEN_DAYS,
        b.ADJUSTED_DAYS,
        b.AVAILABLE_DAYS,
        b.LAST_ACCRUAL_DATE,
        b.PERIOD_START_DATE,
        b.PERIOD_END_DATE,
        b.STATUS,
        b.CREATION_DATE,
        b.CREATED_BY,
        b.LAST_UPDATE_DATE,
        b.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} b
      INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
        ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND b.TENANT_ID = e.ENTERPRISE_ID
      WHERE b.TENANT_ID = :1
        AND b.EMPLOYEE_ID = :2
        AND b.LEAVE_TYPE_ID = :3`;

      const result = await this.executeQuery(query, [tenantId, employeeId, leaveTypeId]);
      return (result.rows && result.rows.length > 0) ? result.rows[0] : null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to fetch leave balance by employee and leave type');
    }
  }

  static async getBalanceByBalanceGuid(tenantId, balanceGuid) {
    try {
      const normalizedGuid = ensureHex32(balanceGuid, 'balanceGuid');
      const query = `SELECT
        RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
        b.TENANT_ID,
        b.EMPLOYEE_ID,
        RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
        e.FIRST_NAME_EN,
        e.MIDDLE_NAME_EN,
        e.LAST_NAME_EN,
        e.FIRST_NAME_AR,
        e.MIDDLE_NAME_AR,
        e.LAST_NAME_AR,
        e.FAMILY_NAME_AR,
        e.EMAIL,
        b.LEAVE_TYPE_ID,
        b.OPENING_BALANCE_DAYS,
        b.ACCRUED_DAYS,
        b.TAKEN_DAYS,
        b.ADJUSTED_DAYS,
        b.AVAILABLE_DAYS,
        b.LAST_ACCRUAL_DATE,
        b.PERIOD_START_DATE,
        b.PERIOD_END_DATE,
        b.STATUS,
        b.CREATION_DATE,
        b.CREATED_BY,
        b.LAST_UPDATE_DATE,
        b.LAST_UPDATED_BY
      FROM ${this.TABLE_NAME} b
      INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
        ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
       AND b.TENANT_ID = e.ENTERPRISE_ID
      WHERE b.TENANT_ID = :1
        AND RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) = :2`;
      const result = await this.executeQuery(query, [tenantId, normalizedGuid]);
      return (result.rows && result.rows.length > 0) ? result.rows[0] : null;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to fetch leave balance by balance GUID');
    }
  }

  static async create(tenantId, data, userId = 'SYSTEM') {
    try {
      const employeeId = parseInt(data.EMPLOYEE_ID, 10);
      const leaveTypeId = parseInt(data.LEAVE_TYPE_ID, 10);
      if (!Number.isFinite(employeeId) || employeeId < 1) throw new ValidationError('EMPLOYEE_ID must be a valid positive number');
      if (!Number.isFinite(leaveTypeId) || leaveTypeId < 1) throw new ValidationError('LEAVE_TYPE_ID must be a valid positive number');

      const opening = data.OPENING_BALANCE_DAYS != null ? (parseFloat(data.OPENING_BALANCE_DAYS) || 0) : 0;
      const accrued = data.ACCRUED_DAYS != null ? (parseFloat(data.ACCRUED_DAYS) || 0) : 0;
      const taken = data.TAKEN_DAYS != null ? (parseFloat(data.TAKEN_DAYS) || 0) : 0;
      const adjusted = data.ADJUSTED_DAYS != null ? (parseFloat(data.ADJUSTED_DAYS) || 0) : 0;
      const available = data.AVAILABLE_DAYS != null ? (parseFloat(data.AVAILABLE_DAYS) || 0) : 0;
      const status = (data.STATUS && String(data.STATUS).toUpperCase()) || 'ACTIVE';
      const lastAccrual = data.LAST_ACCRUAL_DATE != null ? this._toDate(data.LAST_ACCRUAL_DATE) : null;
      const periodStart = data.PERIOD_START_DATE != null ? this._toDate(data.PERIOD_START_DATE) : null;
      const periodEnd = data.PERIOD_END_DATE != null ? this._toDate(data.PERIOD_END_DATE) : null;
      const userVal = userId || 'SYSTEM';

      await this.executeWithTransaction(async (connection) => {
        const { buffer: guidBuffer } = await generateSysGuid(connection);
        const now = new Date();
        const insertSql = `INSERT INTO ${this.TABLE_NAME} (
          EMPLOYEE_LEAVE_BALANCE_GUID, TENANT_ID, EMPLOYEE_ID, LEAVE_TYPE_ID,
          OPENING_BALANCE_DAYS, ACCRUED_DAYS, TAKEN_DAYS, ADJUSTED_DAYS, AVAILABLE_DAYS,
          LAST_ACCRUAL_DATE, PERIOD_START_DATE, PERIOD_END_DATE, STATUS,
          CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
        ) VALUES (
          :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11, :12, :13, :14, :15, :16, :17
        )`;
        const binds = [
          guidBuffer, tenantId, employeeId, leaveTypeId,
          opening, accrued, taken, adjusted, available,
          lastAccrual, periodStart, periodEnd, status,
          now, userVal, now, userVal
        ];
        this._assertPositionalBinds(insertSql, binds);
        await connection.execute(insertSql, binds, { autoCommit: false });
      });

      const balance = await this.getBalanceByEmployeeAndLeaveType(tenantId, employeeId, leaveTypeId);
      if (!balance) throw new DatabaseError('Leave balance was created but could not be retrieved');
      return balance;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to create leave balance');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Transactions                                                        */
  /* ------------------------------------------------------------------ */

  static async getBalanceTransactions(tenantId, employeeId, leaveTypeId, limit = 10) {
    try {
      const n = parseInt(limit, 10);
      const rowLimit = (!Number.isFinite(n) || n <= 0) ? 10 : Math.min(n, 100);

      const sql = `
        SELECT *
        FROM (
          SELECT
            RAWTOHEX(TXN_GUID) AS TXN_GUID,
            TXN_ID,
            TENANT_ID,
            EMPLOYEE_ID,
            LEAVE_TYPE_ID,
            TXN_TYPE,
            TXN_DATE,
            AMOUNT_DAYS,
            REFERENCE_TYPE,
            REFERENCE_ID,
            COMMENTS,
            CREATION_DATE,
            CREATED_BY,
            LAST_UPDATE_DATE,
            LAST_UPDATED_BY
          FROM ${this.TXN_TABLE}
          WHERE TENANT_ID = :1
            AND EMPLOYEE_ID = :2
            AND LEAVE_TYPE_ID = :3
          ORDER BY TXN_DATE DESC, TXN_ID DESC
        )
        WHERE ROWNUM <= :4
      `;

      const r = await this.executeQuery(sql, [tenantId, employeeId, leaveTypeId, rowLimit]);
      return r.rows || [];
    } catch (err) {
      throw this._wrapDb(err, 'Failed to fetch transaction history');
    }
  }

  static async insertTxn(connection, {
    tenantId,
    employeeId,
    leaveTypeId,
    txnType,
    txnDate,
    amountDays,
    referenceType = null,
    referenceId = null,
    comments = null,
    userId = 'SYSTEM'
  }) {
    try {
      const { buffer: guidBuffer } = await generateSysGuid(connection);
      const now = new Date();

      // Insert without RETURNING clause, then fetch TXN_ID (more reliable)
      const txnDateValue = this._toDate(txnDate) || new Date();
      const txnTypeValue = String(txnType || '').toUpperCase();
      const amountDaysValue = Number(amountDays) || 0;
      const userIdValue = userId || 'SYSTEM';

      const insertSql = `
        INSERT INTO ${this.TXN_TABLE} (
          TXN_GUID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          TXN_TYPE,
          TXN_DATE,
          AMOUNT_DAYS,
          REFERENCE_TYPE,
          REFERENCE_ID,
          COMMENTS,
          CREATION_DATE,
          CREATED_BY,
          LAST_UPDATE_DATE,
          LAST_UPDATED_BY
        ) VALUES (
          :txn_guid,
          :tenant_id,
          :employee_id,
          :leave_type_id,
          :txn_type,
          :txn_date,
          :amount_days,
          :reference_type,
          :reference_id,
          :comments,
          :creation_date,
          :created_by,
          :last_update_date,
          :last_updated_by
        )
      `;

      let result;
      try {
        result = await connection.execute(insertSql, {
          txn_guid: guidBuffer,
          tenant_id: tenantId,
          employee_id: employeeId,
          leave_type_id: leaveTypeId,
          txn_type: txnTypeValue,
          txn_date: txnDateValue,
          amount_days: amountDaysValue,
          reference_type: referenceType,
          reference_id: referenceId,
          comments: comments,
          creation_date: now,
          created_by: userIdValue,
          last_update_date: now,
          last_updated_by: userIdValue
        }, { autoCommit: false });
      } catch (executeError) {
        throw executeError;
      }

      // Check if INSERT succeeded
      if (!result.rowsAffected || result.rowsAffected < 1) {
        throw new DatabaseError(
          `Transaction INSERT affected 0 rows for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}`
        );
      }

      // Fetch the TXN_ID using the unique combination of fields
      // Use CREATION_DATE with a small time window to find the just-inserted row
      const creationDateMinus1s = new Date(now.getTime() - 1000);
      const creationDatePlus1s = new Date(now.getTime() + 1000);

      const fetchSql = `
        SELECT TXN_ID
        FROM ${this.TXN_TABLE}
        WHERE TENANT_ID = :tenant_id
          AND EMPLOYEE_ID = :employee_id
          AND LEAVE_TYPE_ID = :leave_type_id
          AND TXN_TYPE = :txn_type
          AND TXN_DATE = :txn_date
          AND AMOUNT_DAYS = :amount_days
          AND REFERENCE_TYPE = :reference_type
          AND CREATION_DATE >= :creation_date_minus_1s
          AND CREATION_DATE <= :creation_date_plus_1s
          AND CREATED_BY = :created_by
        ORDER BY TXN_ID DESC
        FETCH FIRST 1 ROW ONLY
      `;

      const fetchResult = await connection.execute(fetchSql, {
        tenant_id: tenantId,
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        txn_type: txnTypeValue,
        txn_date: txnDateValue,
        amount_days: amountDaysValue,
        reference_type: referenceType,
        creation_date_minus_1s: creationDateMinus1s,
        creation_date_plus_1s: creationDatePlus1s,
        created_by: userIdValue
      }, { outFormat: oracledb.OUT_FORMAT_OBJECT });

      if (!fetchResult.rows || fetchResult.rows.length === 0) {
        throw new DatabaseError(
          `Transaction INSERT succeeded but could not fetch TXN_ID for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}`
        );
      }

      const txnId = fetchResult.rows[0].TXN_ID;
      if (!txnId || txnId === null || txnId === undefined) {
        throw new DatabaseError(
          `Transaction INSERT succeeded but TXN_ID is null for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}`
        );
      }

      return txnId;
    } catch (err) {
      if (err instanceof DatabaseError) {
        if (!err.oracleError && (err.errorNum !== undefined || err.message?.includes('ORA-'))) {
          err.oracleError = { 
            errorNum: err.errorNum, 
            message: err.message,
            ...(err.originalError && { originalError: err.originalError })
          };
        }
        throw err;
      }
      throw this._wrapDb(err, 'Failed to insert balance transaction');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Accrual Engine                                                      */
  /* ------------------------------------------------------------------ */

  static async getEligibleBalances(connection, tenantId, leaveTypeId, periodEnd, forceRecalculate = false) {
    try {
      const pEnd = this._toDate(periodEnd);

      let eligibleQuery;
      let eligibleParams;

      if (forceRecalculate) {
        eligibleQuery = `SELECT
          RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
          b.TENANT_ID,
          b.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.FIRST_NAME_EN,
          e.MIDDLE_NAME_EN,
          e.LAST_NAME_EN,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.FAMILY_NAME_AR,
          e.EMAIL,
          b.LEAVE_TYPE_ID,
          b.OPENING_BALANCE_DAYS,
          b.ACCRUED_DAYS,
          b.TAKEN_DAYS,
          b.ADJUSTED_DAYS,
          b.AVAILABLE_DAYS,
          b.LAST_ACCRUAL_DATE,
          b.PERIOD_START_DATE,
          b.PERIOD_END_DATE,
          b.STATUS
        FROM ${this.TABLE_NAME} b
        INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
          ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
         AND b.TENANT_ID = e.ENTERPRISE_ID
        WHERE b.TENANT_ID = :1
          AND b.LEAVE_TYPE_ID = :2
          AND b.STATUS = 'ACTIVE'`;
        eligibleParams = [tenantId, leaveTypeId];
      } else {
        eligibleQuery = `SELECT
          RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
          b.TENANT_ID,
          b.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.FIRST_NAME_EN,
          e.MIDDLE_NAME_EN,
          e.LAST_NAME_EN,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.FAMILY_NAME_AR,
          e.EMAIL,
          b.LEAVE_TYPE_ID,
          b.OPENING_BALANCE_DAYS,
          b.ACCRUED_DAYS,
          b.TAKEN_DAYS,
          b.ADJUSTED_DAYS,
          b.AVAILABLE_DAYS,
          b.LAST_ACCRUAL_DATE,
          b.PERIOD_START_DATE,
          b.PERIOD_END_DATE,
          b.STATUS
        FROM ${this.TABLE_NAME} b
        INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
          ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
         AND b.TENANT_ID = e.ENTERPRISE_ID
        WHERE b.TENANT_ID = :1
          AND b.LEAVE_TYPE_ID = :2
          AND b.STATUS = 'ACTIVE'
          AND (b.LAST_ACCRUAL_DATE IS NULL OR b.LAST_ACCRUAL_DATE < :3)`;
        eligibleParams = [tenantId, leaveTypeId, pEnd];
      }

      const eligibleResult = await connection.execute(eligibleQuery, eligibleParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      let alreadyProcessedResult = { rows: [] };
      if (!forceRecalculate) {
        const alreadyProcessedQuery = `SELECT
          RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
          b.TENANT_ID,
          b.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.FIRST_NAME_EN,
          e.MIDDLE_NAME_EN,
          e.LAST_NAME_EN,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.FAMILY_NAME_AR,
          e.EMAIL,
          b.LEAVE_TYPE_ID,
          b.OPENING_BALANCE_DAYS,
          b.ACCRUED_DAYS,
          b.TAKEN_DAYS,
          b.ADJUSTED_DAYS,
          b.AVAILABLE_DAYS,
          b.LAST_ACCRUAL_DATE,
          b.PERIOD_START_DATE,
          b.PERIOD_END_DATE,
          b.STATUS
        FROM ${this.TABLE_NAME} b
        INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
          ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
         AND b.TENANT_ID = e.ENTERPRISE_ID
        WHERE b.TENANT_ID = :1
          AND b.LEAVE_TYPE_ID = :2
          AND b.STATUS = 'ACTIVE'
          AND b.LAST_ACCRUAL_DATE IS NOT NULL
          AND b.LAST_ACCRUAL_DATE >= :3`;

        alreadyProcessedResult = await connection.execute(
          alreadyProcessedQuery,
          [tenantId, leaveTypeId, pEnd],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
      }

      const eligible = eligibleResult.rows ? this.convertKeysToSnakeCase(eligibleResult.rows) : [];
      const alreadyProcessed = alreadyProcessedResult.rows ? this.convertKeysToSnakeCase(alreadyProcessedResult.rows) : [];
      const alreadyProcessedWithReasons = alreadyProcessed.map(b => ({ ...b, skip_reason: 'Already accrued for period' }));

      return { eligible, alreadyProcessed: alreadyProcessedWithReasons };
    } catch (error) {
      throw this._wrapDb(error, 'Failed to fetch eligible balances');
    }
  }

  static async updateBalanceWithAccrual(connection, tenantId, employeeId, leaveTypeId, accrualDays, periodStart, periodEnd, maxBalanceDays, userId) {
    try {
      const now = new Date();
      const pStart = this._toDate(periodStart);
      const pEnd = this._toDate(periodEnd);

      const addDays = Number(accrualDays) || 0;
      const cap = (maxBalanceDays === null || maxBalanceDays === undefined) ? null : (Number(maxBalanceDays) || 0);

      const sql = cap !== null ? `
        UPDATE ${this.TABLE_NAME}
        SET
          ACCRUED_DAYS = NVL(ACCRUED_DAYS, 0) + :accrual_days,
          AVAILABLE_DAYS = LEAST(
            NVL(OPENING_BALANCE_DAYS, 0)
            + (NVL(ACCRUED_DAYS, 0) + :accrual_days)
            + NVL(ADJUSTED_DAYS, 0)
            - NVL(TAKEN_DAYS, 0),
            :max_balance_days
          ),
          LAST_ACCRUAL_DATE = :period_end,
          PERIOD_START_DATE = :period_start,
          PERIOD_END_DATE = :period_end,
          LAST_UPDATE_DATE = :now_ts,
          LAST_UPDATED_BY = :user_id
        WHERE TENANT_ID = :tenant_id
          AND EMPLOYEE_ID = :employee_id
          AND LEAVE_TYPE_ID = :leave_type_id
      ` : `
        UPDATE ${this.TABLE_NAME}
        SET
          ACCRUED_DAYS = NVL(ACCRUED_DAYS, 0) + :accrual_days,
          AVAILABLE_DAYS =
            NVL(OPENING_BALANCE_DAYS, 0)
            + (NVL(ACCRUED_DAYS, 0) + :accrual_days)
            + NVL(ADJUSTED_DAYS, 0)
            - NVL(TAKEN_DAYS, 0),
          LAST_ACCRUAL_DATE = :period_end,
          PERIOD_START_DATE = :period_start,
          PERIOD_END_DATE = :period_end,
          LAST_UPDATE_DATE = :now_ts,
          LAST_UPDATED_BY = :user_id
        WHERE TENANT_ID = :tenant_id
          AND EMPLOYEE_ID = :employee_id
          AND LEAVE_TYPE_ID = :leave_type_id
      `;

      const binds = {
        accrual_days: addDays,
        ...(cap !== null ? { max_balance_days: cap } : {}),
        period_start: pStart,
        period_end: pEnd,
        now_ts: now,
        user_id: userId || 'SYSTEM',
        tenant_id: tenantId,
        employee_id: employeeId,
        leave_type_id: leaveTypeId
      };

      const r = await connection.execute(sql, binds, { autoCommit: false });

      if (!r.rowsAffected || r.rowsAffected < 1) {
        // Check if balance exists
        const checkSql = `SELECT COUNT(*) AS CNT FROM ${this.TABLE_NAME} 
          WHERE TENANT_ID = :tenant_id AND EMPLOYEE_ID = :employee_id AND LEAVE_TYPE_ID = :leave_type_id`;
        const checkResult = await connection.execute(checkSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const exists = checkResult.rows?.[0]?.CNT > 0;
        
        throw new DatabaseError(
          exists 
            ? `Balance exists but UPDATE affected 0 rows for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}. Possible constraint violation.`
            : `No balance row found for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}. Balance must be created first.`
        );
      }

      // Fetch updated balance using the same connection to ensure we see the updated data
      // Try with JOIN first, fallback to simple query if JOIN fails
      let fetchResult;
      try {
        const fetchSql = `
          SELECT
            RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
            b.TENANT_ID,
            b.EMPLOYEE_ID,
            RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
            e.FIRST_NAME_EN,
            e.MIDDLE_NAME_EN,
            e.LAST_NAME_EN,
            e.FIRST_NAME_AR,
            e.MIDDLE_NAME_AR,
            e.LAST_NAME_AR,
            e.FAMILY_NAME_AR,
            e.EMAIL,
            b.LEAVE_TYPE_ID,
            b.OPENING_BALANCE_DAYS,
            b.ACCRUED_DAYS,
            b.TAKEN_DAYS,
            b.ADJUSTED_DAYS,
            b.AVAILABLE_DAYS,
            b.LAST_ACCRUAL_DATE,
            b.PERIOD_START_DATE,
            b.PERIOD_END_DATE,
            b.STATUS,
            b.CREATION_DATE,
            b.CREATED_BY,
            b.LAST_UPDATE_DATE,
            b.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} b
          INNER JOIN ${this.EMPLOYEE_TABLE_NAME} e
            ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
           AND b.TENANT_ID = e.ENTERPRISE_ID
          WHERE b.TENANT_ID = :tenant_id
            AND b.EMPLOYEE_ID = :employee_id
            AND b.LEAVE_TYPE_ID = :leave_type_id
        `;
        
        fetchResult = await connection.execute(
          fetchSql,
          { tenant_id: tenantId, employee_id: employeeId, leave_type_id: leaveTypeId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
      } catch (joinError) {
        // If JOIN fails, try without JOIN (employee_guid and employee info will be null)
        const fetchSqlSimple = `
          SELECT
            RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
            b.TENANT_ID,
            b.EMPLOYEE_ID,
            NULL AS EMPLOYEE_GUID,
            NULL AS FIRST_NAME_EN,
            NULL AS MIDDLE_NAME_EN,
            NULL AS LAST_NAME_EN,
            NULL AS FIRST_NAME_AR,
            NULL AS MIDDLE_NAME_AR,
            NULL AS LAST_NAME_AR,
            NULL AS FAMILY_NAME_AR,
            NULL AS EMAIL,
            b.LEAVE_TYPE_ID,
            b.OPENING_BALANCE_DAYS,
            b.ACCRUED_DAYS,
            b.TAKEN_DAYS,
            b.ADJUSTED_DAYS,
            b.AVAILABLE_DAYS,
            b.LAST_ACCRUAL_DATE,
            b.PERIOD_START_DATE,
            b.PERIOD_END_DATE,
            b.STATUS,
            b.CREATION_DATE,
            b.CREATED_BY,
            b.LAST_UPDATE_DATE,
            b.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} b
          WHERE b.TENANT_ID = :tenant_id
            AND b.EMPLOYEE_ID = :employee_id
            AND b.LEAVE_TYPE_ID = :leave_type_id
        `;
        
        fetchResult = await connection.execute(
          fetchSqlSimple,
          { tenant_id: tenantId, employee_id: employeeId, leave_type_id: leaveTypeId },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
      }

      if (!fetchResult.rows || fetchResult.rows.length === 0) {
        throw new DatabaseError(
          `Balance update succeeded but could not retrieve updated balance for tenant=${tenantId}, employee=${employeeId}, leaveType=${leaveTypeId}`
        );
      }
      
      return this.convertKeysToSnakeCase(fetchResult.rows[0]);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to update balance with accrual');
    }
  }

  static async insertAccrualTransaction(connection, tenantId, employeeId, leaveTypeId, txnDate, accrualDays, userId) {
    try {
      let txnId;
      try {
        txnId = await this.insertTxn(connection, {
          tenantId,
          employeeId,
          leaveTypeId,
          txnType: 'ACCRUAL',
          txnDate: this._toDate(txnDate),
          amountDays: Number(accrualDays) || 0,
          referenceType: 'ACCRUAL_RUN',
          referenceId: null,
          comments: 'Monthly accrual',
          userId
        });
      } catch (insertError) {
        throw insertError;
      }

      if (!txnId) {
        throw new DatabaseError('Transaction ID not returned from INSERT');
      }

      const selectSql = `
        SELECT
          RAWTOHEX(TXN_GUID) AS TXN_GUID,
          TXN_ID,
          TENANT_ID,
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          TXN_TYPE,
          TXN_DATE,
          AMOUNT_DAYS AS DAYS,
          REFERENCE_TYPE,
          REFERENCE_ID,
          COMMENTS AS NOTES,
          CREATION_DATE,
          CREATED_BY
        FROM ${this.TXN_TABLE}
        WHERE TXN_ID = :1
      `;
      const r = await connection.execute(selectSql, [txnId], { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return r.rows?.[0] ? this.convertKeysToSnakeCase(r.rows[0]) : null;
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (!error.oracleError && (error.errorNum !== undefined || error.message?.includes('ORA-'))) {
          error.oracleError = { 
            errorNum: error.errorNum, 
            message: error.message,
            ...(error.originalError && { originalError: error.originalError })
          };
        }
        throw error;
      }
      throw this._wrapDb(error, 'Failed to insert accrual transaction');
    }
  }

  static async logAccrualRun(connection, tenantId, leaveTypeId, periodStart, periodEnd, processedCount, skippedCount, userId) {
    try {
      const outRunId = { type: oracledb.NUMBER, dir: oracledb.BIND_OUT };

      const sql = `
        INSERT INTO ${this.ACCRUAL_RUNS_TABLE} (
          TENANT_ID, LEAVE_TYPE_ID, PERIOD_START_DATE, PERIOD_END_DATE,
          PROCESSED_COUNT, SKIPPED_COUNT,
          RUN_BY, RUN_DATE
        ) VALUES (
          :tenant_id, :leave_type_id, :period_start, :period_end,
          :processed_count, :skipped_count,
          :run_by, SYSTIMESTAMP
        )
        RETURNING RUN_ID INTO :run_id_out
      `;

      const binds = {
        tenant_id: tenantId,
        leave_type_id: leaveTypeId,
        period_start: this._toDate(periodStart),
        period_end: this._toDate(periodEnd),
        processed_count: processedCount,
        skipped_count: skippedCount,
        run_by: userId || 'SYSTEM',
        run_id_out: outRunId
      };

      await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      return { logged: true, run_id: outRunId.value };
    } catch (error) {
      const oracleErr = this._oracleErr(error);
      if (oracleErr?.errorNum === 942 || oracleErr?.message?.includes('ORA-00942')) {
        return { logged: false, run_id: null };
      }
      throw this._wrapDb(error, 'Failed to log accrual run');
    }
  }

  static async processAccrualForPeriod(tenantId, periodStart, periodEnd, leaveTypeId, userId, options = {}) {
    const { forceRecalculate = false, dryRun = false, includeDebug = false } = options;

    const pStart = this._toDate(periodStart);
    const pEnd = this._toDate(periodEnd);

    try {
      return await this.executeWithTransaction(async (connection) => {
        const leaveType = await this.validateLeaveType(connection, tenantId, leaveTypeId);
        if (!leaveType) {
          const notFoundError = new ValidationError(`Leave type ${leaveTypeId} not found or inactive`);
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const accrualMapping = await this.getAccrualMapping(connection, tenantId, leaveTypeId, pStart, pEnd);
        if (!accrualMapping) {
          const ve = new ValidationError('No active accrual plan mapped to this leave type for the given period');
          ve.statusCode = 422;
          throw ve;
        }

        const accrualPlan = await this.getAccrualPlan(connection, tenantId, accrualMapping.accrual_plan_id);
        if (!accrualPlan) {
          throw new NotFoundError(`Accrual plan ${accrualMapping.accrual_plan_id} not found for this tenant`);
        }

        const accrualMethod = String(accrualPlan.accrual_method || '').toUpperCase();
        if (accrualMethod !== 'MONTHLY') {
          const ve = new ValidationError(`Unsupported accrual_method: ${accrualMethod}. Only MONTHLY is supported.`);
          ve.statusCode = 422;
          throw ve;
        }

        const accrualDays = Number(accrualPlan.accrual_rate_days) || 0;
        const maxBalanceDays = (accrualPlan.max_balance_days === undefined) ? null : accrualPlan.max_balance_days;

        const { eligible: eligibleBalances, alreadyProcessed: alreadyProcessedBalances } =
          await this.getEligibleBalances(connection, tenantId, leaveTypeId, pEnd, forceRecalculate);

        const alreadyProcessedCount = alreadyProcessedBalances.length;

        let newlyProcessedCount = 0;
        let errorSkippedCount = 0;

        const processedBalances = [];
        const insertedTransactions = [];
        const skippedBalances = [...alreadyProcessedBalances];

        for (const balance of eligibleBalances) {
          try {
            const checkTxnSql = `
              SELECT COUNT(*) AS TXN_COUNT
              FROM ${this.TXN_TABLE}
              WHERE TENANT_ID = :1
                AND EMPLOYEE_ID = :2
                AND LEAVE_TYPE_ID = :3
                AND TXN_TYPE = 'ACCRUAL'
                AND TRUNC(TXN_DATE) = TRUNC(:4)
                AND REFERENCE_TYPE = 'ACCRUAL_RUN'
            `;
            const txnCheck = await connection.execute(
              checkTxnSql,
              [tenantId, balance.employee_id, leaveTypeId, pEnd],
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            const existingTxnCount = txnCheck.rows?.[0]?.TXN_COUNT || 0;

            if (existingTxnCount > 0) {
              skippedBalances.push({ ...balance, skip_reason: 'Accrual transaction already exists for this period' });
              continue;
            }

            if (dryRun) {
              const simulatedAvailable =
                (balance.opening_balance_days || 0) +
                ((balance.accrued_days || 0) + accrualDays) +
                (balance.adjusted_days || 0) -
                (balance.taken_days || 0);

              processedBalances.push({
                ...balance,
                accrued_days: (balance.accrued_days || 0) + accrualDays,
                available_days:
                  maxBalanceDays != null
                    ? Math.min(simulatedAvailable, Number(maxBalanceDays))
                    : simulatedAvailable,
                last_accrual_date: pEnd,
                period_start_date: pStart,
                period_end_date: pEnd
              });

              insertedTransactions.push({
                employee_id: balance.employee_id,
                leave_type_id: leaveTypeId,
                txn_type: 'ACCRUAL',
                txn_date: pEnd,
                days: accrualDays,
                reference_type: 'ACCRUAL_RUN',
                notes: 'Monthly accrual (DRY RUN)'
              });

              newlyProcessedCount++;
              continue;
            }

            // Update balance first
            const updatedBalance = await this.updateBalanceWithAccrual(
              connection,
              tenantId,
              balance.employee_id,
              leaveTypeId,
              accrualDays,
              pStart,
              pEnd,
              maxBalanceDays,
              userId
            );

            // Verify the balance was actually updated before inserting transaction
            if (!updatedBalance) {
              throw new DatabaseError(
                `Balance update returned null for tenant=${tenantId}, employee=${balance.employee_id}, leaveType=${leaveTypeId}`
              );
            }
            
            // Verify the balance shows the accrual was applied
            const expectedAccrued = (balance.accrued_days || 0) + accrualDays;
            if (updatedBalance.accrued_days === undefined || updatedBalance.accrued_days === null) {
              throw new DatabaseError(
                `Balance update returned invalid accrued_days for tenant=${tenantId}, employee=${balance.employee_id}, leaveType=${leaveTypeId}. Expected: ${expectedAccrued}, Got: ${updatedBalance.accrued_days}`
              );
            }
            
            // Verify last_accrual_date was updated
            if (!updatedBalance.last_accrual_date) {
              throw new DatabaseError(
                `Balance update did not set last_accrual_date for tenant=${tenantId}, employee=${balance.employee_id}, leaveType=${leaveTypeId}`
              );
            }

            // Insert transaction only if balance update succeeded and we have valid balance data
            const transaction = await this.insertAccrualTransaction(
              connection,
              tenantId,
              balance.employee_id,
              leaveTypeId,
              pEnd,
              accrualDays,
              userId
            );

            if (!transaction || !transaction.txn_id) {
              throw new DatabaseError(
                `Transaction insert failed or returned invalid data for tenant=${tenantId}, employee=${balance.employee_id}, leaveType=${leaveTypeId}`
              );
            }

            processedBalances.push(updatedBalance);
            insertedTransactions.push(transaction);
            newlyProcessedCount++;
          } catch (balanceError) {
            const oracleErr = this._oracleErr(balanceError);
            let oracleNum = oracleErr?.errorNum;

            const deepestMsg =
              oracleErr?.message ||
              balanceError?.oracleError?.message ||
              balanceError?.originalError?.message ||
              balanceError?.cause?.message ||
              balanceError?.message ||
              'Unknown error';

            if ((oracleNum === undefined || oracleNum === null) && deepestMsg) {
              const m = String(deepestMsg).match(/ORA-(\d{5})/i);
              if (m) oracleNum = parseInt(m[1], 10);
            }

            const oracleCode =
              (oracleNum !== undefined && oracleNum !== null && !Number.isNaN(oracleNum))
                ? `ORA-${String(oracleNum).padStart(5, '0')}`
                : null;

            const debugInfo = {
              _has_oracleErr: !!oracleErr,
              _oracleErr_type: oracleErr?.constructor?.name,
              _balanceError_type: balanceError?.constructor?.name
            };

            skippedBalances.push({
              ...balance,
              skip_reason: deepestMsg,
              oracle_error_num: (oracleNum !== undefined && oracleNum !== null && !Number.isNaN(oracleNum)) ? oracleNum : null,
              oracle_error: oracleCode,
              ...(includeDebug ? { debug: debugInfo } : {})
            });

            errorSkippedCount++;
          }
        }

        // ✅ Best reporting for UI
        const processed_count = newlyProcessedCount + alreadyProcessedCount;
        const skipped_count = errorSkippedCount; // errors only

        let auditLog = null;
        if (!dryRun) {
          try {
            // You may want to log idempotent as processed too -> pass processed_count
            auditLog = await this.logAccrualRun(
              connection,
              tenantId,
              leaveTypeId,
              pStart,
              pEnd,
              processed_count,
              skipped_count,
              userId
            );
          } catch {
            auditLog = { logged: false, run_id: null };
          }
        }

        let message;
        if (newlyProcessedCount > 0 && errorSkippedCount === 0) {
          message = `Accrual processed successfully for ${newlyProcessedCount} employee(s).`;
        } else if (newlyProcessedCount > 0 && errorSkippedCount > 0) {
          message = `Accrual run completed. ${newlyProcessedCount} processed, ${errorSkippedCount} failed.`;
        } else if (alreadyProcessedCount > 0 && errorSkippedCount === 0) {
          message = `Accrual run completed. ${alreadyProcessedCount} balance(s) were already accrued for this period (idempotent).`;
        } else if (errorSkippedCount > 0) {
          message = `No accruals processed. ${errorSkippedCount} balance(s) failed due to database error(s).`;
        } else {
          message = 'No eligible balances found for accrual processing.';
        }

        const errorBalances = skippedBalances.filter(b => b.skip_reason !== 'Already accrued for period');
        const alreadyProcessedInSample = skippedBalances.filter(b => b.skip_reason === 'Already accrued for period');

        const skippedSample = [
          ...errorBalances.slice(0, 3),
          ...alreadyProcessedInSample.slice(0, 5 - errorBalances.slice(0, 3).length)
        ].slice(0, 5);

        // Fetch recent transactions from database (not just from current run)
        // This ensures we show transactions even if they were created in a previous run
        let recentTxnsFromDb = [];
        try {
          const recentTxnSql = `
            SELECT
              RAWTOHEX(TXN_GUID) AS TXN_GUID,
              TXN_ID,
              TENANT_ID,
              EMPLOYEE_ID,
              LEAVE_TYPE_ID,
              TXN_TYPE,
              TXN_DATE,
              AMOUNT_DAYS AS DAYS,
              REFERENCE_TYPE,
              REFERENCE_ID,
              COMMENTS AS NOTES,
              CREATION_DATE,
              CREATED_BY
            FROM ${this.TXN_TABLE}
            WHERE TENANT_ID = :1
              AND LEAVE_TYPE_ID = :2
              AND TXN_TYPE = 'ACCRUAL'
              AND REFERENCE_TYPE = 'ACCRUAL_RUN'
              AND TRUNC(TXN_DATE) = TRUNC(:3)
            ORDER BY TXN_ID DESC
            FETCH FIRST 2 ROWS ONLY
          `;
          const recentTxnResult = await connection.execute(
            recentTxnSql,
            [tenantId, leaveTypeId, pEnd],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          recentTxnsFromDb = recentTxnResult.rows || [];
        } catch (txnFetchError) {
          // Fallback to insertedTransactions if DB fetch fails
          recentTxnsFromDb = insertedTransactions.slice(-2);
        }

        // Combine inserted transactions with DB transactions, removing duplicates
        const allRecentTxns = [...insertedTransactions];
        for (const dbTxn of recentTxnsFromDb) {
          const exists = allRecentTxns.some(
            t => t.txn_id === dbTxn.TXN_ID || 
                 (t.employee_id === dbTxn.EMPLOYEE_ID && 
                  t.leave_type_id === dbTxn.LEAVE_TYPE_ID && 
                  t.txn_date?.getTime() === dbTxn.TXN_DATE?.getTime())
          );
          if (!exists) {
            allRecentTxns.push(this.convertKeysToSnakeCase(dbTxn));
          }
        }

        // Sort by TXN_ID DESC and take last 2
        const sortedTxns = allRecentTxns
          .sort((a, b) => (b.txn_id || 0) - (a.txn_id || 0))
          .slice(0, 2);

        const result = {
          processed_count,
          newly_processed_count: newlyProcessedCount,
          already_processed_count: alreadyProcessedCount,
          skipped_count,
          error_skipped_count: errorSkippedCount,
          balances_sample: processedBalances.slice(0, 5),
          recent_txns: sortedTxns,
          skipped_balances_sample: skippedSample,
          message,
          accrual_plan_id: accrualMapping.accrual_plan_id,
          accrual_method: accrualMethod,
          accrual_rate_days: accrualDays
        };

        if (includeDebug) {
          result.debug = {
            accrual_mapping: accrualMapping,
            accrual_plan: accrualPlan,
            eligible_count: eligibleBalances.length,
            already_processed_count: alreadyProcessedCount,
            newly_processed_count: newlyProcessedCount,
            error_skipped_count: errorSkippedCount,
            force_recalculate: forceRecalculate,
            dry_run: dryRun
          };
        }

        if (auditLog?.logged) result.audit_run_id = auditLog.run_id;

        return result;
      });
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw this._wrapDb(error, 'Failed to process accrual');
    }
  }
  /* ------------------------------------------------------------------ */
/* PL/SQL opening balance                                              */
/* ------------------------------------------------------------------ */

static async initOpeningBalance(tenantId, employeeId, leaveTypeId, openingDays, effectiveDate, userId) {
  try {
    // basic validation
    const tId = parseInt(tenantId, 10);
    const eId = parseInt(employeeId, 10);
    const ltId = parseInt(leaveTypeId, 10);
    const op = Number(openingDays) || 0;

    if (!Number.isFinite(tId) || tId <= 0) throw new ValidationError('tenantId must be a valid positive number');
    if (!Number.isFinite(eId) || eId <= 0) throw new ValidationError('employeeId must be a valid positive number');
    if (!Number.isFinite(ltId) || ltId <= 0) throw new ValidationError('leaveTypeId must be a valid positive number');

    const eff = this._toDate(effectiveDate);
    if (!eff || Number.isNaN(eff.getTime())) throw new ValidationError('effectiveDate must be a valid date');

    return await this.executeWithTransaction(async (connection) => {
      const binds = [tId, eId, ltId, op, eff, userId || 'SYSTEM'];

      // Try explicit schema call first
      const plsqlWithSchema = `
        BEGIN
          "ABS".ABS_LEAVE_ENTITLEMENT_PKG.init_opening_balance(
            p_tenant_id      => :1,
            p_employee_id    => :2,
            p_leave_type_id  => :3,
            p_opening_days   => :4,
            p_effective_date => :5,
            p_user           => :6
          );
        END;
      `;

      try {
        await connection.execute(plsqlWithSchema, binds, { autoCommit: false });
      } catch (err) {
        // If schema resolution fails (common in some tools/setups), fallback to CURRENT_SCHEMA
        const msg = String(err?.message || '');
        const isScopeOrDeclErr =
          msg.includes('PLS-00225') ||
          msg.includes('out of scope') ||
          msg.includes('PLS-00201') ||
          msg.includes('must be declared') ||
          msg.includes('ORA-06550');

        if (!isScopeOrDeclErr) throw err;

        await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`);

        const plsqlFallback = `
          BEGIN
            ABS_LEAVE_ENTITLEMENT_PKG.init_opening_balance(
              p_tenant_id      => :1,
              p_employee_id    => :2,
              p_leave_type_id  => :3,
              p_opening_days   => :4,
              p_effective_date => :5,
              p_user           => :6
            );
          END;
        `;

        await connection.execute(plsqlFallback, binds, { autoCommit: false });
      }

      // Return latest balance row
      const balance = await this.getBalanceByEmployeeAndLeaveType(tId, eId, ltId);
      if (!balance) {
        throw new DatabaseError('Opening balance was created but could not be retrieved');
      }
      return balance;
    });
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error instanceof DatabaseError) throw error;
    throw this._wrapDb(error, 'Failed to initialize opening balance');
  }
  }

  /**
   * Rebuild balance from transactions (admin repair tool)
   * @param {Object} params - Rebuild parameters
   * @param {number} params.tenantId - Tenant ID
   * @param {number} params.employeeId - Employee ID (optional if employeeGuid provided)
   * @param {string} params.employeeGuid - Employee GUID hex32 (optional if employeeId provided)
   * @param {number} params.leaveTypeId - Leave type ID (optional if leaveTypeGuid provided)
   * @param {string} params.leaveTypeGuid - Leave type GUID hex32 (optional if leaveTypeId provided)
   * @param {string} params.rebuildMode - 'FULL' or 'SINCE_DATE' (default: 'FULL')
   * @param {Date|string} params.sinceDate - Required if rebuildMode is 'SINCE_DATE'
   * @param {boolean} params.dryRun - If true, don't update balance (default: false)
   * @param {string} params.userId - User ID for audit
   * @returns {Object} Rebuild result with calculated values
   */
  static async rebuildBalanceFromTxns(params) {
    const {
      tenantId,
      employeeId: providedEmployeeId,
      employeeGuid: providedEmployeeGuid,
      leaveTypeId: providedLeaveTypeId,
      leaveTypeGuid: providedLeaveTypeGuid,
      rebuildMode = 'FULL',
      sinceDate,
      dryRun = false,
      userId = 'SYSTEM'
    } = params;

    if (!tenantId) {
      throw new ValidationError('Tenant ID is required');
    }

    if (!providedEmployeeId && !providedEmployeeGuid) {
      throw new ValidationError('Either employee_id or employee_guid is required');
    }

    if (!providedLeaveTypeId && !providedLeaveTypeGuid) {
      throw new ValidationError('Either leave_type_id or leave_type_guid is required');
    }

    if (rebuildMode === 'SINCE_DATE' && !sinceDate) {
      throw new ValidationError('since_date is required when rebuild_mode is SINCE_DATE');
    }

    return await this.executeWithTransaction(async (connection) => {
      const startTime = Date.now();

      // Resolve employee_id
      let employeeId = providedEmployeeId;
      if (!employeeId && providedEmployeeGuid) {
        const hexGuid = ensureHex32(providedEmployeeGuid, 'employee_guid');
        
        const empQuery = `SELECT EMPLOYEE_ID 
          FROM ${this.EMPLOYEE_TABLE_NAME}
          WHERE ENTERPRISE_ID = :1
            AND RAWTOHEX(EMPLOYEE_GUID) = :2`;
        
        const empResult = await connection.execute(empQuery, [tenantId, hexGuid], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!empResult.rows || empResult.rows.length === 0) {
          throw new ValidationError('Employee not found for the provided employee_guid');
        }
        employeeId = empResult.rows[0].EMPLOYEE_ID;
      }

      // Resolve leave_type_id
      let leaveTypeId = providedLeaveTypeId;
      if (!leaveTypeId && providedLeaveTypeGuid) {
        const hexGuid = ensureHex32(providedLeaveTypeGuid, 'leave_type_guid');
        
        const ltQuery = `SELECT LEAVE_TYPE_ID 
          FROM ${this.LEAVE_TYPE_TABLE_NAME}
          WHERE TENANT_ID = :1
            AND RAWTOHEX(LEAVE_TYPE_GUID) = :2`;
        
        const ltResult = await connection.execute(ltQuery, [tenantId, hexGuid], {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (!ltResult.rows || ltResult.rows.length === 0) {
          throw new ValidationError('Leave type not found for the provided leave_type_guid');
        }
        leaveTypeId = ltResult.rows[0].LEAVE_TYPE_ID;
      }

      // Check if balance exists
      const balanceQuery = `SELECT 
        RAWTOHEX(EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
        OPENING_BALANCE_DAYS,
        ACCRUED_DAYS,
        TAKEN_DAYS,
        ADJUSTED_DAYS,
        AVAILABLE_DAYS,
        STATUS
      FROM ${this.TABLE_NAME}
      WHERE TENANT_ID = :1
        AND EMPLOYEE_ID = :2
        AND LEAVE_TYPE_ID = :3
        AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

      const balanceResult = await connection.execute(balanceQuery, [tenantId, employeeId, leaveTypeId], {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });

      // Check if balance exists, create if not found (for bulk operations)
      let balance = null;
      let openingBalanceDays = 0;
      
      if (!balanceResult.rows || balanceResult.rows.length === 0) {
        // For single rebuild, require balance to exist
        // For bulk, we'll create it if needed
        throw new ValidationError('Balance not found for this employee and leave type. Cannot rebuild non-existent balance.');
      }

      balance = balanceResult.rows[0];
      openingBalanceDays = parseFloat(balance.OPENING_BALANCE_DAYS) || 0;

      // Build transaction query based on rebuild_mode
      // Try AMOUNT_DAYS first, fallback to DAYS if column doesn't exist
      let txnQuery = `SELECT 
        TXN_TYPE,
        AMOUNT_DAYS
      FROM ${this.TXN_TABLE}
      WHERE TENANT_ID = :1
        AND EMPLOYEE_ID = :2
        AND LEAVE_TYPE_ID = :3`;

      const txnBindParams = [tenantId, employeeId, leaveTypeId];

      if (rebuildMode === 'SINCE_DATE') {
        const sinceDateObj = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
        txnQuery += ` AND (TXN_DATE >= :4 OR (TXN_DATE IS NULL AND CREATION_DATE >= :4))`;
        txnBindParams.push(sinceDateObj);
      }

      txnQuery += ` ORDER BY TXN_DATE ASC, CREATION_DATE ASC`;

      let txnResult;
      try {
        txnResult = await connection.execute(txnQuery, txnBindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } catch (queryError) {
        // If AMOUNT_DAYS column doesn't exist, try DAYS
        if (queryError.errorNum === 904 || (queryError.message && queryError.message.includes('ORA-00904') && queryError.message.includes('AMOUNT_DAYS'))) {
          txnQuery = `SELECT 
            TXN_TYPE,
            DAYS AS AMOUNT_DAYS
          FROM ${this.TXN_TABLE}
          WHERE TENANT_ID = :1
            AND EMPLOYEE_ID = :2
            AND LEAVE_TYPE_ID = :3`;

          if (rebuildMode === 'SINCE_DATE') {
            txnQuery += ` AND (TXN_DATE >= :4 OR (TXN_DATE IS NULL AND CREATION_DATE >= :4))`;
          }

          txnQuery += ` ORDER BY TXN_DATE ASC, CREATION_DATE ASC`;

          txnResult = await connection.execute(txnQuery, txnBindParams, {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
        } else {
          throw queryError;
        }
      }

      // Calculate ledger totals
      let totalAccrualDays = 0;
      let totalUsageNormalized = 0;
      let totalReversal = 0;
      let totalAdjustment = 0;

      if (txnResult.rows && txnResult.rows.length > 0) {
        for (const txn of txnResult.rows) {
          const txnType = String(txn.TXN_TYPE || '').toUpperCase();
          const amountDays = parseFloat(txn.AMOUNT_DAYS) || 0;

          switch (txnType) {
            case 'ACCRUAL':
              totalAccrualDays += amountDays;
              break;
            case 'TAKEN':
              // TAKEN is stored as negative, normalize to positive for taken_days
              totalUsageNormalized += Math.abs(amountDays);
              break;
            case 'REVERSAL':
              // REVERSAL is typically positive, reduces taken_days
              totalReversal += amountDays;
              break;
            case 'ADJUSTMENT':
              totalAdjustment += amountDays;
              break;
            case 'CARRY_FORWARD':
              // Treat as adjustment
              totalAdjustment += amountDays;
              break;
            case 'FORFEIT':
              // Treat as negative adjustment
              totalAdjustment += amountDays;
              break;
          }
        }
      }

      // Calculate rebuilt values
      const accruedDays = totalAccrualDays;
      const takenDays = Math.max(0, totalUsageNormalized - totalReversal); // Reversals reduce taken_days
      const adjustedDays = totalAdjustment;
      const availableDays = openingBalanceDays + accruedDays + adjustedDays - takenDays;

      // Update balance unless dry_run
      if (!dryRun) {
        const updateQuery = `UPDATE ${this.TABLE_NAME}
          SET ACCRUED_DAYS = :1,
              TAKEN_DAYS = :2,
              ADJUSTED_DAYS = :3,
              AVAILABLE_DAYS = :4,
              LAST_UPDATE_DATE = SYSTIMESTAMP,
              LAST_UPDATED_BY = :5
          WHERE TENANT_ID = :6
            AND EMPLOYEE_ID = :7
            AND LEAVE_TYPE_ID = :8
            AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

        await connection.execute(updateQuery, [
          accruedDays,
          takenDays,
          adjustedDays,
          availableDays,
          userId,
          tenantId,
          employeeId,
          leaveTypeId
        ], { autoCommit: false });

        // Optional: Insert audit transaction
        // TODO: Consider inserting a txn_type='ADJUSTMENT' with amount_days=0 and comments='REBUILD_BALANCE'
        // For now, we skip this to avoid cluttering the transaction table
      }

      const executionTime = Date.now() - startTime;

      return {
        tenant_id: tenantId,
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        opening_balance_days: openingBalanceDays,
        rebuilt: {
          accrued_days: accruedDays,
          taken_days: takenDays,
          adjusted_days: adjustedDays,
          available_days: availableDays
        },
        ledger_totals: {
          accrual: totalAccrualDays,
          usage_normalized: totalUsageNormalized,
          reversal: totalReversal,
          adjustment: totalAdjustment
        },
        rebuild_mode: rebuildMode,
        dry_run: dryRun,
        execution_time: `${executionTime}ms`
      };
    });
  }

  /**
   * Internal rebuild method that accepts a connection (for bulk operations)
   * @private
   */
  static async _rebuildBalanceInternal(connection, params) {
    const {
      tenantId,
      employeeId,
      leaveTypeId,
      rebuildMode = 'FULL',
      sinceDate,
      dryRun = false,
      userId = 'SYSTEM'
    } = params;

    // Get balance with lock
    const balanceQuery = `SELECT 
      OPENING_BALANCE_DAYS,
      ACCRUED_DAYS,
      TAKEN_DAYS,
      ADJUSTED_DAYS,
      AVAILABLE_DAYS
    FROM ${this.TABLE_NAME}
    WHERE TENANT_ID = :1
      AND EMPLOYEE_ID = :2
      AND LEAVE_TYPE_ID = :3
      AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'
    ${dryRun ? '' : 'FOR UPDATE'}`;

    const balanceResult = await connection.execute(balanceQuery, [tenantId, employeeId, leaveTypeId], {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });

    if (!balanceResult.rows || balanceResult.rows.length === 0) {
      throw new ValidationError('Balance not found');
    }

    const balance = balanceResult.rows[0];
    const openingBalanceDays = parseFloat(balance.OPENING_BALANCE_DAYS) || 0;

    // Build transaction query
    let txnQuery = `SELECT 
      TXN_TYPE,
      AMOUNT_DAYS
    FROM ${this.TXN_TABLE}
    WHERE TENANT_ID = :1
      AND EMPLOYEE_ID = :2
      AND LEAVE_TYPE_ID = :3`;

    const txnBindParams = [tenantId, employeeId, leaveTypeId];

    if (rebuildMode === 'SINCE_DATE') {
      const sinceDateObj = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
      txnQuery += ` AND (TXN_DATE >= :4 OR (TXN_DATE IS NULL AND CREATION_DATE >= :4))`;
      txnBindParams.push(sinceDateObj);
    }

    txnQuery += ` ORDER BY TXN_DATE ASC, CREATION_DATE ASC`;

    let txnResult;
    try {
      txnResult = await connection.execute(txnQuery, txnBindParams, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
    } catch (queryError) {
      if (queryError.errorNum === 904 || (queryError.message && queryError.message.includes('ORA-00904') && queryError.message.includes('AMOUNT_DAYS'))) {
        txnQuery = `SELECT 
          TXN_TYPE,
          DAYS AS AMOUNT_DAYS
        FROM ${this.TXN_TABLE}
        WHERE TENANT_ID = :1
          AND EMPLOYEE_ID = :2
          AND LEAVE_TYPE_ID = :3`;

        if (rebuildMode === 'SINCE_DATE') {
          txnQuery += ` AND (TXN_DATE >= :4 OR (TXN_DATE IS NULL AND CREATION_DATE >= :4))`;
        }

        txnQuery += ` ORDER BY TXN_DATE ASC, CREATION_DATE ASC`;

        txnResult = await connection.execute(txnQuery, txnBindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });
      } else {
        throw queryError;
      }
    }

    // Calculate ledger totals
    let totalAccrualDays = 0;
    let totalUsageNormalized = 0;
    let totalReversal = 0;
    let totalAdjustment = 0;

    if (txnResult.rows && txnResult.rows.length > 0) {
      for (const txn of txnResult.rows) {
        const txnType = String(txn.TXN_TYPE || '').toUpperCase();
        const amountDays = parseFloat(txn.AMOUNT_DAYS) || 0;

        switch (txnType) {
          case 'ACCRUAL':
            totalAccrualDays += amountDays;
            break;
          case 'TAKEN':
            totalUsageNormalized += Math.abs(amountDays);
            break;
          case 'REVERSAL':
            totalReversal += amountDays;
            break;
          case 'ADJUSTMENT':
            totalAdjustment += amountDays;
            break;
          case 'CARRY_FORWARD':
            totalAdjustment += amountDays;
            break;
          case 'FORFEIT':
            totalAdjustment += amountDays;
            break;
        }
      }
    }

    // Calculate rebuilt values
    const accruedDays = totalAccrualDays;
    const takenDays = Math.max(0, totalUsageNormalized - totalReversal);
    const adjustedDays = totalAdjustment;
    const availableDays = openingBalanceDays + accruedDays + adjustedDays - takenDays;

    // Update balance unless dry_run
    if (!dryRun) {
      const updateQuery = `UPDATE ${this.TABLE_NAME}
        SET ACCRUED_DAYS = :1,
            TAKEN_DAYS = :2,
            ADJUSTED_DAYS = :3,
            AVAILABLE_DAYS = :4,
            LAST_UPDATE_DATE = SYSTIMESTAMP,
            LAST_UPDATED_BY = :5
        WHERE TENANT_ID = :6
          AND EMPLOYEE_ID = :7
          AND LEAVE_TYPE_ID = :8
          AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

      await connection.execute(updateQuery, [
        accruedDays,
        takenDays,
        adjustedDays,
        availableDays,
        userId,
        tenantId,
        employeeId,
        leaveTypeId
      ], { autoCommit: false });
    }

    return {
      opening_balance_days: openingBalanceDays,
      rebuilt: {
        accrued_days: accruedDays,
        taken_days: takenDays,
        adjusted_days: adjustedDays,
        available_days: availableDays
      },
      ledger_totals: {
        accrual: totalAccrualDays,
        usage_normalized: totalUsageNormalized,
        reversal: totalReversal,
        adjustment: totalAdjustment
      }
    };
  }

  /**
   * Bulk rebuild balances from transactions (admin repair tool)
   * @param {Object} params - Bulk rebuild parameters
   * @param {number} params.tenantId - Tenant ID
   * @param {Array<number>} params.employeeIds - Employee IDs (optional if employeeGuids provided)
   * @param {Array<string>} params.employeeGuids - Employee GUIDs hex32 (optional if employeeIds provided)
   * @param {number} params.leaveTypeId - Leave type ID (optional, if omitted rebuilds all leave types)
   * @param {string} params.rebuildMode - 'FULL' or 'SINCE_DATE' (default: 'FULL')
   * @param {Date|string} params.sinceDate - Required if rebuildMode is 'SINCE_DATE'
   * @param {boolean} params.dryRun - If true, don't update balances (default: false)
   * @param {string} params.userId - User ID for audit
   * @param {number} params.pageSize - Batch size for processing (default: 200)
   * @param {number} params.maxTargets - Max targets to process (safety cap, default: 2000)
   * @param {string} params.includeItems - 'NONE', 'SAMPLE', or 'ALL' (default: 'SAMPLE')
   * @param {number} params.sampleSize - Sample size for SAMPLE mode (default: 20)
   * @returns {Object} Aggregated rebuild results
   */
  static async rebuildBalancesBulk(params) {
    const {
      tenantId,
      employeeIds: providedEmployeeIds = [],
      employeeGuids: providedEmployeeGuids = [],
      leaveTypeId: providedLeaveTypeId,
      rebuildMode = 'FULL',
      sinceDate,
      dryRun = false,
      userId = 'SYSTEM',
      pageSize = 200,
      maxTargets = 2000,
      includeItems = 'SAMPLE',
      sampleSize = 20
    } = params;

    if (!tenantId) {
      throw new ValidationError('Tenant ID is required');
    }

    if (rebuildMode === 'SINCE_DATE' && !sinceDate) {
      throw new ValidationError('since_date is required when rebuild_mode is SINCE_DATE');
    }

    // Validate includeItems
    if (includeItems !== 'NONE' && includeItems !== 'SAMPLE' && includeItems !== 'ALL') {
      throw new ValidationError('include_items must be NONE, SAMPLE, or ALL');
    }

    // Force SAMPLE if max_targets > 500 and includeItems is ALL
    const effectiveIncludeItems = (includeItems === 'ALL' && maxTargets > 500) ? 'SAMPLE' : includeItems;

    const startTime = Date.now();
    let processedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    let totalTargetsScanned = 0;

    // Samples for response
    const updatedSample = [];
    const skippedSample = [];
    const errorsSample = [];
    const employeeGuidMap = new Map(); // Cache for employee GUID lookups

    return await this.executeWithTransaction(async (connection) => {
      let targetList = [];

      // If specific employees provided, resolve them first
      if ((providedEmployeeIds && providedEmployeeIds.length > 0) || 
          (providedEmployeeGuids && providedEmployeeGuids.length > 0)) {
        // Mode 1: Rebuild specific employees
        let resolvedEmployeeIds = [...(providedEmployeeIds || [])];
        
        if (providedEmployeeGuids && providedEmployeeGuids.length > 0) {
          const hexGuids = providedEmployeeGuids.map(guid => ensureHex32(guid, 'employee_guid'));
          const guidPlaceholders = hexGuids.map((_, i) => `:${i + 2}`).join(',');
          const empQuery = `SELECT EMPLOYEE_ID, RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID
            FROM ${this.EMPLOYEE_TABLE_NAME}
            WHERE ENTERPRISE_ID = :1
              AND RAWTOHEX(EMPLOYEE_GUID) IN (${guidPlaceholders})`;
          
          const empResult = await connection.execute(empQuery, [tenantId, ...hexGuids], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });

          if (!empResult.rows || empResult.rows.length === 0) {
            throw new ValidationError('No employees found for the provided employee_guids');
          }

          resolvedEmployeeIds = [...new Set([...resolvedEmployeeIds, ...empResult.rows.map(r => r.EMPLOYEE_ID)])];
          
          // Cache GUIDs
          for (const row of empResult.rows) {
            employeeGuidMap.set(row.EMPLOYEE_ID, row.EMPLOYEE_GUID);
          }
        }

        // Get leave types for these employees
        let leaveTypeIds = [];
        if (providedLeaveTypeId) {
          leaveTypeIds = [providedLeaveTypeId];
        } else {
          // Get all leave types that have balances for these employees
          if (resolvedEmployeeIds.length > 0) {
            const empPlaceholders = resolvedEmployeeIds.map((_, i) => `:${i + 2}`).join(',');
            const ltQuery = `SELECT DISTINCT LEAVE_TYPE_ID
              FROM ${this.TABLE_NAME}
              WHERE TENANT_ID = :1 AND EMPLOYEE_ID IN (${empPlaceholders})`;
            const ltResult = await connection.execute(ltQuery, [tenantId, ...resolvedEmployeeIds], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            if (ltResult.rows && ltResult.rows.length > 0) {
              leaveTypeIds = ltResult.rows.map(r => r.LEAVE_TYPE_ID);
            }
          }
        }

        // Build target list
        for (const empId of resolvedEmployeeIds) {
          for (const ltId of leaveTypeIds) {
            targetList.push({ employee_id: empId, leave_type_id: ltId });
          }
        }
      } else {
        // Mode 2: Rebuild ALL employees based on balances table
        let targetQuery = '';
        let targetBindParams = [];

        if (providedLeaveTypeId) {
          targetQuery = `SELECT DISTINCT EMPLOYEE_ID, LEAVE_TYPE_ID
            FROM ${this.TABLE_NAME}
            WHERE TENANT_ID = :1
              AND LEAVE_TYPE_ID = :2
              AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'
            ORDER BY EMPLOYEE_ID, LEAVE_TYPE_ID`;
          targetBindParams = [tenantId, providedLeaveTypeId];
        } else {
          targetQuery = `SELECT DISTINCT EMPLOYEE_ID, LEAVE_TYPE_ID
            FROM ${this.TABLE_NAME}
            WHERE TENANT_ID = :1
              AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'
            ORDER BY EMPLOYEE_ID, LEAVE_TYPE_ID`;
          targetBindParams = [tenantId];
        }

        // Get all targets (we'll batch process them)
        const targetResult = await connection.execute(targetQuery, targetBindParams, {
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        if (targetResult.rows && targetResult.rows.length > 0) {
          targetList = targetResult.rows.map(row => ({
            employee_id: row.EMPLOYEE_ID,
            leave_type_id: row.LEAVE_TYPE_ID
          }));
        }
      }

      if (targetList.length === 0) {
        const emptyResult = {
          tenant_id: tenantId,
          leave_type_id: providedLeaveTypeId || null,
          meta: {
            rebuild_mode: rebuildMode,
            dry_run: dryRun,
            execution_time: `${Date.now() - startTime}ms`,
            processed_count: 0,
            skipped_count: 0,
            errors_count: 0,
            total_targets_scanned: 0,
            page_size: pageSize,
            max_targets: maxTargets,
            include_items: effectiveIncludeItems,
            sample_size: sampleSize
          }
        };
        
        // Only include sample arrays if not NONE
        if (effectiveIncludeItems !== 'NONE') {
          emptyResult.updated_sample = [];
          emptyResult.skipped_sample = [];
          emptyResult.errors_sample = [];
        }
        
        return emptyResult;
      }

      // Batch process targets
      const maxToProcess = Math.min(targetList.length, maxTargets);
      let offset = 0;

      while (offset < maxToProcess && (processedCount + skippedCount + errorsCount) < maxTargets) {
        const batch = targetList.slice(offset, offset + pageSize);
        
        // Batch fetch employee GUIDs for this batch
        if (effectiveIncludeItems !== 'NONE' && batch.length > 0) {
          const batchEmpIds = [...new Set(batch.map(t => t.employee_id))];
          const empPlaceholders = batchEmpIds.map((_, i) => `:${i + 2}`).join(',');
          const guidQuery = `SELECT EMPLOYEE_ID, RAWTOHEX(EMPLOYEE_GUID) AS EMPLOYEE_GUID
            FROM ${this.EMPLOYEE_TABLE_NAME}
            WHERE ENTERPRISE_ID = :1
              AND EMPLOYEE_ID IN (${empPlaceholders})`;
          const guidResult = await connection.execute(guidQuery, [tenantId, ...batchEmpIds], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          if (guidResult.rows) {
            for (const row of guidResult.rows) {
              employeeGuidMap.set(row.EMPLOYEE_ID, row.EMPLOYEE_GUID);
            }
          }
        }

        // Process batch
        for (const target of batch) {
          if ((processedCount + skippedCount + errorsCount) >= maxTargets) {
            break;
          }

          totalTargetsScanned++;
          const { employee_id: employeeId, leave_type_id: leaveTypeId } = target;
          const employeeGuid = employeeGuidMap.get(employeeId) || null;

          try {
            // Check if transactions exist
            const txnCheckQuery = `SELECT COUNT(*) AS CNT FROM ${this.TXN_TABLE}
              WHERE TENANT_ID = :1 AND EMPLOYEE_ID = :2 AND LEAVE_TYPE_ID = :3`;
            const txnCheck = await connection.execute(txnCheckQuery, [tenantId, employeeId, leaveTypeId], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });
            const hasTxns = txnCheck.rows?.[0]?.CNT > 0;

            // Check if balance exists
            const balanceCheckQuery = `SELECT OPENING_BALANCE_DAYS
              FROM ${this.TABLE_NAME}
              WHERE TENANT_ID = :1
                AND EMPLOYEE_ID = :2
                AND LEAVE_TYPE_ID = :3
                AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'`;

            const balanceCheck = await connection.execute(balanceCheckQuery, [tenantId, employeeId, leaveTypeId], {
              outFormat: oracledb.OUT_FORMAT_OBJECT
            });

            if (!balanceCheck.rows || balanceCheck.rows.length === 0) {
              if (!hasTxns) {
                // Skip: no balance/txns
                skippedCount++;
                if (effectiveIncludeItems !== 'NONE') {
                  const shouldInclude = effectiveIncludeItems === 'ALL' || skippedSample.length < sampleSize;
                  if (shouldInclude) {
                    skippedSample.push({
                      employee_id: employeeId,
                      employee_guid: employeeGuid,
                      leave_type_id: leaveTypeId,
                      status: 'SKIPPED',
                      message: 'No balance/txns found'
                    });
                  }
                }
                continue;
              }
              // Create balance if txns exist
              const { buffer: guidBuffer } = await generateSysGuid(connection);
              const createBalanceQuery = `INSERT INTO ${this.TABLE_NAME} (
                EMPLOYEE_LEAVE_BALANCE_GUID,
                TENANT_ID, EMPLOYEE_ID, LEAVE_TYPE_ID,
                OPENING_BALANCE_DAYS, ACCRUED_DAYS, TAKEN_DAYS, ADJUSTED_DAYS, AVAILABLE_DAYS,
                STATUS, CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
              ) VALUES (
                :1, :2, :3, :4, 0, 0, 0, 0, 0, 'ACTIVE', SYSTIMESTAMP, :5, SYSTIMESTAMP, :5
              )`;
              await connection.execute(createBalanceQuery, [guidBuffer, tenantId, employeeId, leaveTypeId, userId], {
                autoCommit: false
              });
            }

            // Rebuild balance
            const rebuildResult = await this._rebuildBalanceInternal(connection, {
              tenantId,
              employeeId,
              leaveTypeId,
              rebuildMode,
              sinceDate,
              dryRun,
              userId
            });

            processedCount++;
            
            // Add to sample/result if needed
            if (effectiveIncludeItems !== 'NONE') {
              // For ALL: include all items; For SAMPLE: only up to sample_size
              const shouldInclude = effectiveIncludeItems === 'ALL' || updatedSample.length < sampleSize;
              if (shouldInclude) {
                const item = {
                  employee_id: employeeId,
                  employee_guid: employeeGuid,
                  leave_type_id: leaveTypeId,
                  status: dryRun ? 'CALCULATED' : 'UPDATED',
                  opening_balance_days: rebuildResult.opening_balance_days,
                  rebuilt: rebuildResult.rebuilt,
                  ledger_totals: rebuildResult.ledger_totals
                };
                updatedSample.push(item);
              }
            }

          } catch (error) {
            errorsCount++;
            
            // Add to error sample if needed
            if (effectiveIncludeItems !== 'NONE') {
              const shouldInclude = effectiveIncludeItems === 'ALL' || errorsSample.length < sampleSize;
              if (shouldInclude) {
                errorsSample.push({
                  employee_id: employeeId,
                  employee_guid: employeeGuid,
                  leave_type_id: leaveTypeId,
                  status: 'ERROR',
                  message: error.message || 'Unknown error during rebuild'
                });
              }
            }
            // Continue processing
          }
        }

        offset += pageSize;
        if (offset >= maxToProcess) break;
      }

      const executionTime = Date.now() - startTime;

      const result = {
        tenant_id: tenantId,
        leave_type_id: providedLeaveTypeId || null,
        meta: {
          rebuild_mode: rebuildMode,
          dry_run: dryRun,
          execution_time: `${executionTime}ms`,
          processed_count: processedCount,
          skipped_count: skippedCount,
          errors_count: errorsCount,
          total_targets_scanned: totalTargetsScanned,
          page_size: pageSize,
          max_targets: maxTargets,
          include_items: effectiveIncludeItems,
          sample_size: sampleSize
        }
      };

      // Only include sample arrays if include_items is not NONE
      if (effectiveIncludeItems !== 'NONE') {
        result.updated_sample = updatedSample;
        result.skipped_sample = skippedSample;
        result.errors_sample = errorsSample;
      }

      return result;
    });
  }

  /**
   * Update leave balance and record adjustments in transactions table
   * @param {Object} params - Update parameters
   * @param {number} params.tenantId - Tenant ID
   * @param {string} params.balanceGuidHex - Balance GUID (hex32)
   * @param {Object} params.updates - Fields to update (opening_balance_days, accrued_days, taken_days, adjusted_days, available_days, status)
   * @param {string} params.userId - User ID for audit
   * @param {string} params.comments - Optional comments for adjustment transaction
   * @returns {Object} Updated balance with transaction info
   */
  static async updateBalance(params) {
    const {
      tenantId,
      balanceGuidHex,
      updates = {},
      userId = 'SYSTEM',
      comments = null
    } = params;

    if (!tenantId) {
      throw new ValidationError('Tenant ID is required');
    }

    if (!balanceGuidHex) {
      throw new ValidationError('Balance GUID is required');
    }

    const normalizedGuid = ensureHex32(balanceGuidHex, 'balance_guid');

    return await this.executeWithTransaction(async (connection) => {
      // Fetch current balance
      const currentBalanceQuery = `
        SELECT 
          EMPLOYEE_ID,
          LEAVE_TYPE_ID,
          OPENING_BALANCE_DAYS,
          ACCRUED_DAYS,
          TAKEN_DAYS,
          ADJUSTED_DAYS,
          AVAILABLE_DAYS,
          STATUS
        FROM ${this.TABLE_NAME}
        WHERE TENANT_ID = :1
          AND RAWTOHEX(EMPLOYEE_LEAVE_BALANCE_GUID) = :2
          AND NVL(STATUS, 'ACTIVE') = 'ACTIVE'
        FOR UPDATE
      `;

      const currentResult = await connection.execute(
        currentBalanceQuery,
        [tenantId, normalizedGuid],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!currentResult.rows || currentResult.rows.length === 0) {
        throw new ValidationError('Leave balance not found');
      }

      const current = currentResult.rows[0];
      const employeeId = current.EMPLOYEE_ID;
      const leaveTypeId = current.LEAVE_TYPE_ID;

      // Calculate differences
      const differences = {};
      const updateFields = [];
      const updateBindParams = [];
      let paramIndex = 1;

      const fieldsToCheck = [
        'opening_balance_days',
        'accrued_days',
        'taken_days',
        'adjusted_days',
        'available_days'
      ];

      for (const field of fieldsToCheck) {
        if (updates[field] !== undefined && updates[field] !== null) {
          const newValue = parseFloat(updates[field]) || 0;
          const currentValue = parseFloat(current[field.toUpperCase()]) || 0;
          const diff = newValue - currentValue;

          if (Math.abs(diff) > 0.0001) { // Only track non-zero differences
            differences[field] = diff;
            updateFields.push(`${field.toUpperCase()} = :${paramIndex}`);
            updateBindParams.push(newValue);
            paramIndex++;
          }
        }
      }

      // Handle status update
      if (updates.status !== undefined) {
        updateFields.push(`STATUS = :${paramIndex}`);
        updateBindParams.push(updates.status);
        paramIndex++;
      }

      // If no changes, return current balance
      if (updateFields.length === 0) {
        const fetchQuery = `
          SELECT 
            RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
            b.TENANT_ID,
            b.EMPLOYEE_ID,
            RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
            e.FIRST_NAME_EN,
            e.MIDDLE_NAME_EN,
            e.LAST_NAME_EN,
            e.FIRST_NAME_AR,
            e.MIDDLE_NAME_AR,
            e.LAST_NAME_AR,
            e.FAMILY_NAME_AR,
            e.EMAIL,
            b.LEAVE_TYPE_ID,
            b.OPENING_BALANCE_DAYS,
            b.ACCRUED_DAYS,
            b.TAKEN_DAYS,
            b.ADJUSTED_DAYS,
            b.AVAILABLE_DAYS,
            b.LAST_ACCRUAL_DATE,
            b.PERIOD_START_DATE,
            b.PERIOD_END_DATE,
            b.STATUS,
            b.CREATION_DATE,
            b.CREATED_BY,
            b.LAST_UPDATE_DATE,
            b.LAST_UPDATED_BY
          FROM ${this.TABLE_NAME} b
          LEFT JOIN ${this.EMPLOYEE_TABLE_NAME} e
            ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
           AND b.TENANT_ID = e.ENTERPRISE_ID
          WHERE b.TENANT_ID = :1
            AND RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) = :2
        `;
        const fetchResult = await connection.execute(
          fetchQuery,
          [tenantId, normalizedGuid],
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return {
          balance: this.convertKeysToSnakeCase(fetchResult.rows[0]),
          transactions: []
        };
      }

      // Build UPDATE query
      updateFields.push(`LAST_UPDATE_DATE = SYSTIMESTAMP`);
      updateFields.push(`LAST_UPDATED_BY = :${paramIndex}`);
      updateBindParams.push(userId);
      paramIndex++;

      updateBindParams.push(tenantId);
      updateBindParams.push(normalizedGuid);

      const updateQuery = `
        UPDATE ${this.TABLE_NAME}
        SET ${updateFields.join(', ')}
        WHERE TENANT_ID = :${paramIndex}
          AND RAWTOHEX(EMPLOYEE_LEAVE_BALANCE_GUID) = :${paramIndex + 1}
      `;

      const updateResult = await connection.execute(
        updateQuery,
        updateBindParams,
        { autoCommit: false }
      );

      if (!updateResult.rowsAffected || updateResult.rowsAffected === 0) {
        throw new DatabaseError('Balance update affected 0 rows');
      }

      // Insert adjustment transactions for each changed field
      const insertedTransactions = [];
      const txnDate = new Date();

      for (const [field, diff] of Object.entries(differences)) {
        try {
          const txnComments = comments || `Balance adjustment: ${field} changed by ${diff > 0 ? '+' : ''}${diff.toFixed(2)} days`;
          
          const txnId = await this.insertTxn(connection, {
            tenantId,
            employeeId,
            leaveTypeId,
            txnType: 'ADJUSTMENT',
            txnDate,
            amountDays: diff,
            referenceType: 'BALANCE_UPDATE',
            referenceId: normalizedGuid,
            comments: txnComments,
            userId
          });

          // Fetch the inserted transaction (with fallback for AMOUNT_DAYS/DAYS column)
          let txnFetchQuery = `
            SELECT
              RAWTOHEX(TXN_GUID) AS TXN_GUID,
              TXN_ID,
              TENANT_ID,
              EMPLOYEE_ID,
              LEAVE_TYPE_ID,
              TXN_TYPE,
              TXN_DATE,
              AMOUNT_DAYS,
              REFERENCE_TYPE,
              REFERENCE_ID,
              COMMENTS,
              CREATION_DATE,
              CREATED_BY
            FROM ${this.TXN_TABLE}
            WHERE TXN_ID = :1
          `;
          
          let txnResult;
          try {
            txnResult = await connection.execute(
              txnFetchQuery,
              [txnId],
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
          } catch (fetchError) {
            // Fallback if AMOUNT_DAYS column doesn't exist
            if (fetchError.errorNum === 904 || (fetchError.message && fetchError.message.includes('ORA-00904') && fetchError.message.includes('AMOUNT_DAYS'))) {
              txnFetchQuery = `
                SELECT
                  RAWTOHEX(TXN_GUID) AS TXN_GUID,
                  TXN_ID,
                  TENANT_ID,
                  EMPLOYEE_ID,
                  LEAVE_TYPE_ID,
                  TXN_TYPE,
                  TXN_DATE,
                  DAYS AS AMOUNT_DAYS,
                  REFERENCE_TYPE,
                  REFERENCE_ID,
                  COMMENTS,
                  CREATION_DATE,
                  CREATED_BY
                FROM ${this.TXN_TABLE}
                WHERE TXN_ID = :1
              `;
              txnResult = await connection.execute(
                txnFetchQuery,
                [txnId],
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
              );
            } else {
              throw fetchError;
            }
          }

          if (txnResult.rows && txnResult.rows.length > 0) {
            insertedTransactions.push(this.convertKeysToSnakeCase(txnResult.rows[0]));
          }
        } catch (_txnError) {
          // Don't fail the update if transaction insert fails
        }
      }

      // Fetch updated balance
      const fetchQuery = `
        SELECT 
          RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) AS EMPLOYEE_LEAVE_BALANCE_GUID,
          b.TENANT_ID,
          b.EMPLOYEE_ID,
          RAWTOHEX(e.EMPLOYEE_GUID) AS EMPLOYEE_GUID,
          e.FIRST_NAME_EN,
          e.MIDDLE_NAME_EN,
          e.LAST_NAME_EN,
          e.FIRST_NAME_AR,
          e.MIDDLE_NAME_AR,
          e.LAST_NAME_AR,
          e.FAMILY_NAME_AR,
          e.EMAIL,
          b.LEAVE_TYPE_ID,
          b.OPENING_BALANCE_DAYS,
          b.ACCRUED_DAYS,
          b.TAKEN_DAYS,
          b.ADJUSTED_DAYS,
          b.AVAILABLE_DAYS,
          b.LAST_ACCRUAL_DATE,
          b.PERIOD_START_DATE,
          b.PERIOD_END_DATE,
          b.STATUS,
          b.CREATION_DATE,
          b.CREATED_BY,
          b.LAST_UPDATE_DATE,
          b.LAST_UPDATED_BY
        FROM ${this.TABLE_NAME} b
        LEFT JOIN ${this.EMPLOYEE_TABLE_NAME} e
          ON b.EMPLOYEE_ID = e.EMPLOYEE_ID
         AND b.TENANT_ID = e.ENTERPRISE_ID
        WHERE b.TENANT_ID = :1
          AND RAWTOHEX(b.EMPLOYEE_LEAVE_BALANCE_GUID) = :2
      `;
      const fetchResult = await connection.execute(
        fetchQuery,
        [tenantId, normalizedGuid],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!fetchResult.rows || fetchResult.rows.length === 0) {
        throw new DatabaseError('Balance update succeeded but could not retrieve updated balance');
      }

      return {
        balance: this.convertKeysToSnakeCase(fetchResult.rows[0]),
        transactions: insertedTransactions
      };
    });
  }

}

export default EmployeeLeaveBalanceModel;
