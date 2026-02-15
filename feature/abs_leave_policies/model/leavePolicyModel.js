import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../utils/errors/index.js';

/**
 * Leave Policy Model
 * Handles database operations for creating leave policies via PL/SQL package
 */
class LeavePolicyModel {
  static VIEW_NAME = 'ABS.V_ABS_LEAVE_POLICY_FULL';
  static ENTITLEMENTS_TABLE = 'ABS.ABS_LEAVE_POLICY_ENTITLEMENTS';
  static MAX_IN_LIST = 1000;

  /**
   * Convert object keys from UPPER_CASE to lowercase snake_case
   */
  static convertKeysToSnakeCase(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof Buffer) return obj.toString('hex').toUpperCase();
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => this.convertKeysToSnakeCase(item));
    
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = key.toLowerCase();
      if (value === null || value === undefined) {
        converted[newKey] = value;
      } else if (value instanceof Date) {
        converted[newKey] = value;
      } else if (value instanceof Buffer) {
        // Convert Buffer (Oracle RAW/GUID types) to hex string
        converted[newKey] = value.toString('hex').toUpperCase();
      } else if (typeof value === 'object') {
        converted[newKey] = this.convertKeysToSnakeCase(value);
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  /**
   * Convert flat row keys to snake_case (single level, no recursion). Faster for view result rows.
   */
  static convertRowToSnakeCase(row) {
    if (row === null || row === undefined) return row;
    const converted = {};
    for (const [key, value] of Object.entries(row)) {
      const newKey = key.toLowerCase();
      if (value instanceof Buffer) {
        converted[newKey] = value.toString('hex').toUpperCase();
      } else {
        converted[newKey] = value;
      }
    }
    return converted;
  }

  /**
   * Set session options on a connection (schema, disable parallel). Used for read queries.
   * @param {object} connection - Oracle connection
   */
  static async _setSession(connection) {
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`, [], { autoCommit: false });
    try {
      await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
    } catch {
      // Ignore if not supported
    }
  }

  /** Normalize optional Y/N flag for Oracle (default 'N'). */
  static normalizeYn(value, defaultVal = 'N') {
    if (value == null || String(value).trim() === '') return defaultVal;
    return String(value).trim().toUpperCase().slice(0, 1) === 'Y' ? 'Y' : 'N';
  }

  /**
   * Parse value to Date for Oracle DATE bind (avoids ORA-01861 format string).
   * Returns Date or null; oracledb binds Date correctly to Oracle DATE.
   */
  static parseDateForOracle(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /**
   * Helper method to execute queries
   */
  static async executeQuery(query, bindParams = [], options = {}) {
    const result = await db.executeQuery(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options
    });
    
    if (result.rows) {
      result.rows = this.convertKeysToSnakeCase(result.rows);
    }
    
    return result;
  }

  /**
   * Group flat policy rows by policy_id and nest grade rows
   * @param {Array} rows - Flat array of policy rows (one per grade)
   * @returns {Array} Grouped policies with nested grade_rows
   */
  static groupPoliciesByGrade(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const policyMap = new Map();

    for (const row of rows) {
      const policyId = row.policy_id;
      
      if (!policyMap.has(policyId)) {
        // Create policy object with common fields (excluding grade-specific fields)
        const policy = {
          policy_id: row.policy_id,
          policy_guid: row.policy_guid,
          tenant_id: row.tenant_id,
          leave_type_id: row.leave_type_id,
          leave_type_en: row.leave_type_en,
          leave_type_ar: row.leave_type_ar,
          policy_name: row.policy_name,
          policy_entitlement_days: row.policy_entitlement_days,
          policy_accrual_method: row.policy_accrual_method,
          policy_status: row.policy_status,
          kuwait_labor_compliant: row.kuwait_labor_compliant,
          policy_created_by: row.policy_created_by,
          policy_created_date: row.policy_created_date,
          eligibility_id: row.eligibility_id,
          min_service_years: row.min_service_years,
          max_service_years: row.max_service_years,
          employee_category_code: row.employee_category_code,
          employment_type_code: row.employment_type_code,
          contract_type_code: row.contract_type_code,
          gender_code: row.gender_code,
          religion_code: row.religion_code,
          marital_status_code: row.marital_status_code,
          probation_allowed: row.probation_allowed,
          rule_id: row.rule_id,
          min_notice_days: row.min_notice_days,
          max_consecutive_days: row.max_consecutive_days,
          requires_document: row.requires_document,
          rules_allow_carry_forward: row.rules_allow_carry_forward,
          rules_allow_encashment: row.rules_allow_encashment,
          cf_rule_id: row.cf_rule_id,
          cf_allow_carry_forward: row.cf_allow_carry_forward,
          carry_forward_limit_days: row.carry_forward_limit_days,
          grace_period_days: row.grace_period_days,
          auto_forfeit_flag: row.auto_forfeit_flag,
          forfeit_trigger_code: row.forfeit_trigger_code,
          notify_before_days: row.notify_before_days,
          encash_rule_id: row.encash_rule_id,
          encash_allow_encashment: row.encash_allow_encashment,
          encashment_limit_days: row.encashment_limit_days,
          encashment_rate_pct: row.encashment_rate_pct,
          effective_start_date: row.effective_start_date,
          effective_end_date: row.effective_end_date,
          enable_pro_rata: row.enable_pro_rata,
          count_weekends_as_leave: row.count_weekends_as_leave,
          grade_rows: []
        };
        policyMap.set(policyId, policy);
      }

      // Add grade-specific data to grade_rows array (grade_accrual_method from view GRADE_ACCRUAL_METHOD / entitlement overlay)
      const policy = policyMap.get(policyId);
      policy.grade_rows.push({
        entitlement_id: row.entitlement_id,
        grade_from: row.grade_from,
        grade_to: row.grade_to,
        grade_entitlement_days: row.grade_entitlement_days,
        grade_accrual_rate: row.grade_accrual_rate,
        grade_status: row.grade_status,
        grade_accrual_method: row.grade_accrual_method
      });
    }

    // Convert Map to Array and maintain order (by policy_id DESC)
    return Array.from(policyMap.values()).sort((a, b) => b.policy_id - a.policy_id);
  }

  /**
   * Overlay entitlement-level ACCRUAL_METHOD_CODE onto policies' grade_rows (for GET responses).
   * @param {Array} policies - Array of policy objects with grade_rows
   * @param {Object} [existingConnection] - Optional connection to reuse (avoids extra round-trip)
   */
  static async overlayEntitlementAccrualMethods(policies, existingConnection = null) {
    if (!policies || policies.length === 0) return;
    const entitlementIds = [];
    for (const p of policies) {
      if (p.grade_rows) for (const gr of p.grade_rows) if (gr.entitlement_id != null) entitlementIds.push(gr.entitlement_id);
    }
    if (entitlementIds.length === 0) return;
    const ids = entitlementIds.slice(0, this.MAX_IN_LIST);
    let connection = existingConnection;
    const ownConnection = !connection;
    try {
      if (ownConnection) {
        connection = await db.getConnection();
        await this._setSession(connection);
      }
      const placeholders = ids.map((_, i) => `:e${i + 1}`).join(', ');
      const query = `SELECT ENTITLEMENT_ID, ACCRUAL_METHOD_CODE FROM ${this.ENTITLEMENTS_TABLE} WHERE ENTITLEMENT_ID IN (${placeholders})`;
      const binds = {};
      ids.forEach((id, i) => { binds[`e${i + 1}`] = id; });
      const result = await connection.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const map = new Map();
      for (const row of result.rows || []) {
        const id = row.ENTITLEMENT_ID;
        const code = row.ACCRUAL_METHOD_CODE;
        if (id != null) map.set(id, code);
      }
      for (const p of policies) {
        if (p.grade_rows) for (const gr of p.grade_rows) {
          if (gr.entitlement_id != null && map.has(gr.entitlement_id)) gr.grade_accrual_method = map.get(gr.entitlement_id);
        }
      }
    } catch (err) {
      // If overlay fails (e.g. column missing), leave grade_accrual_method as from view
    } finally {
      if (ownConnection && connection) await connection.close().catch(() => {});
    }
  }

  /**
   * Find all leave policies from view
   * @param {Object} filters - Filters { tenantId, policyId?, leaveTypeId?, pagination? }
   * @param {Object} filters.pagination - Pagination options { page, pageSize }
   * @returns {Promise<Array|Object>} Array of policies when not paginated, or { policies, total } when paginated
   */
  static async findAll(filters = {}) {
    let connection;

    try {
      if (!filters.tenantId) {
        throw new DatabaseError('tenant_id is required');
      }

      // Build WHERE conditions using positional parameters (no connection yet)
      const conditions = [`TENANT_ID = :1`];
      const bindParams = [filters.tenantId];
      let paramIndex = 2;

      if (filters.policyId !== undefined && filters.policyId !== null) {
        conditions.push(`POLICY_ID = :${paramIndex}`);
        bindParams.push(filters.policyId);
        paramIndex++;
      }

      if (filters.leaveTypeId !== undefined && filters.leaveTypeId !== null) {
        conditions.push(`LEAVE_TYPE_ID = :${paramIndex}`);
        bindParams.push(filters.leaveTypeId);
        paramIndex++;
      }

      const whereClause = ` WHERE ${conditions.join(' AND ')}`;

      // Handle pagination
      const pagination = filters.pagination || {};
      const hasPagination = pagination.page !== undefined || pagination.pageSize !== undefined;
      
      let total = 0;
      let query;
      let countQuery;
      let finalBindParams = [...bindParams];

      if (hasPagination) {
        const page = pagination.page || 1;
        const pageSize = pagination.pageSize || 10;
        const offset = (page - 1) * pageSize;

        // Build WHERE clause with table alias for main query
        const mainQueryConditions = conditions.map(cond => cond.replace(/^(TENANT_ID|POLICY_ID|LEAVE_TYPE_ID)/, 'v.$1'));
        const mainWhereClause = ` WHERE ${mainQueryConditions.join(' AND ')}`;

        // Count distinct policies for pagination metadata
        countQuery = `SELECT /*+ FIRST_ROWS */ COUNT(DISTINCT POLICY_ID) AS total FROM ${this.VIEW_NAME}${whereClause}`;

        // Single query with WITH clause to handle pagination at policy level - optimized
        query = `
          WITH paginated_policies AS (
            SELECT /*+ FIRST_ROWS(${pageSize}) */ DISTINCT POLICY_ID
            FROM ${this.VIEW_NAME}
            ${whereClause}
            ORDER BY POLICY_ID DESC
            OFFSET :${paramIndex} ROWS FETCH NEXT :${paramIndex + 1} ROWS ONLY
          )
          SELECT /*+ FIRST_ROWS USE_NL(v p) */
            v.POLICY_ID,
            RAWTOHEX(v.POLICY_GUID) AS POLICY_GUID,
            v.TENANT_ID,
            v.LEAVE_TYPE_ID,
            v.LEAVE_TYPE_EN,
            v.LEAVE_TYPE_AR,
            v.POLICY_NAME,
            v.POLICY_ENTITLEMENT_DAYS,
            v.POLICY_ACCRUAL_METHOD,
            v.POLICY_STATUS,
            v.KUWAIT_LABOR_COMPLIANT,
            v.POLICY_CREATED_BY,
            v.POLICY_CREATED_DATE,
            v.ELIGIBILITY_ID,
            v.MIN_SERVICE_YEARS,
            v.MAX_SERVICE_YEARS,
            v.EMPLOYEE_CATEGORY_CODE,
            v.EMPLOYMENT_TYPE_CODE,
            v.CONTRACT_TYPE_CODE,
            v.GENDER_CODE,
            v.RELIGION_CODE,
            v.MARITAL_STATUS_CODE,
            v.PROBATION_ALLOWED,
            v.RULE_ID,
            v.MIN_NOTICE_DAYS,
            v.MAX_CONSECUTIVE_DAYS,
            v.REQUIRES_DOCUMENT,
            v.RULES_ALLOW_CARRY_FORWARD,
            v.RULES_ALLOW_ENCASHMENT,
            v.CF_RULE_ID,
            v.CF_ALLOW_CARRY_FORWARD,
            v.CARRY_FORWARD_LIMIT_DAYS,
            v.GRACE_PERIOD_DAYS,
            v.AUTO_FORFEIT_FLAG,
            v.FORFEIT_TRIGGER_CODE,
            v.NOTIFY_BEFORE_DAYS,
            v.ENCASH_RULE_ID,
            v.ENCASH_ALLOW_ENCASHMENT,
            v.ENCASHMENT_LIMIT_DAYS,
            v.ENCASHMENT_RATE_PCT,
            v.EFFECTIVE_START_DATE,
            v.EFFECTIVE_END_DATE,
            v.ENABLE_PRO_RATA,
            v.COUNT_WEEKENDS_AS_LEAVE,
            v.ENTITLEMENT_ID,
            v.GRADE_FROM,
            v.GRADE_TO,
            v.GRADE_ENTITLEMENT_DAYS,
            v.GRADE_ACCRUAL_RATE,
            v.GRADE_STATUS,
            v.GRADE_ACCRUAL_METHOD
          FROM ${this.VIEW_NAME} v
          INNER JOIN paginated_policies p ON v.POLICY_ID = p.POLICY_ID
          ${mainWhereClause}
          ORDER BY v.POLICY_ID DESC, v.GRADE_FROM ASC
        `;
        finalBindParams.push(offset, pageSize);
      } else {
        // No pagination - simple query - optimized
        query = `SELECT /*+ FIRST_ROWS */
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          POLICY_NAME,
          POLICY_ENTITLEMENT_DAYS,
          POLICY_ACCRUAL_METHOD,
          POLICY_STATUS,
          KUWAIT_LABOR_COMPLIANT,
          POLICY_CREATED_BY,
          POLICY_CREATED_DATE,
          ELIGIBILITY_ID,
          MIN_SERVICE_YEARS,
          MAX_SERVICE_YEARS,
          EMPLOYEE_CATEGORY_CODE,
          EMPLOYMENT_TYPE_CODE,
          CONTRACT_TYPE_CODE,
          GENDER_CODE,
          RELIGION_CODE,
          MARITAL_STATUS_CODE,
          PROBATION_ALLOWED,
          RULE_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          RULES_ALLOW_CARRY_FORWARD,
          RULES_ALLOW_ENCASHMENT,
          CF_RULE_ID,
          CF_ALLOW_CARRY_FORWARD,
          CARRY_FORWARD_LIMIT_DAYS,
          GRACE_PERIOD_DAYS,
          AUTO_FORFEIT_FLAG,
          FORFEIT_TRIGGER_CODE,
          NOTIFY_BEFORE_DAYS,
          ENCASH_RULE_ID,
          ENCASH_ALLOW_ENCASHMENT,
          ENCASHMENT_LIMIT_DAYS,
          ENCASHMENT_RATE_PCT,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ENABLE_PRO_RATA,
          COUNT_WEEKENDS_AS_LEAVE,
          ENTITLEMENT_ID,
          GRADE_FROM,
          GRADE_TO,
          GRADE_ENTITLEMENT_DAYS,
          GRADE_ACCRUAL_RATE,
          GRADE_STATUS,
          GRADE_ACCRUAL_METHOD
        FROM ${this.VIEW_NAME}
        ${whereClause}
        ORDER BY POLICY_ID DESC, GRADE_FROM ASC`;
      }

      const fetchSize = hasPagination ? Math.min((pagination.pageSize || 10) * 25, 500) : 200;
      const execOpts = { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: fetchSize };

      // When policy_id is set, at most one policy: skip count query and use single connection
      const skipCount = hasPagination && (filters.policyId !== undefined && filters.policyId !== null);

      let result;
      if (hasPagination && !skipCount) {
        const [conn1, conn2] = await Promise.all([db.getConnection(), db.getConnection()]);
        try {
          await Promise.all([this._setSession(conn1), this._setSession(conn2)]);
          const [countResult, dataResult] = await Promise.all([
            conn1.execute(countQuery, bindParams, { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 1 }),
            conn2.execute(query, finalBindParams, execOpts)
          ]);
          total = countResult.rows?.[0]?.TOTAL ?? 0;
          result = dataResult;
        } finally {
          await Promise.all([conn1.close().catch(() => {}), conn2.close().catch(() => {})]);
        }
      } else {
        connection = await db.getConnection();
        await this._setSession(connection);
        result = await connection.execute(query, finalBindParams, execOpts);
      }

      const rows = result.rows || [];
      const convertedRows = rows.map(row => this.convertRowToSnakeCase(row));
      
      // Group rows by policy_id and nest grade rows
      const policies = this.groupPoliciesByGrade(convertedRows);

      if (skipCount) {
        total = policies.length;
      }

      // Overlay entitlement-level accrual_method (reuse connection when single-connection path)
      await this.overlayEntitlementAccrualMethods(policies, connection || null);

      // Return paginated result or plain array
      if (hasPagination) {
        return { policies, total };
      }
      
      return policies;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave policies', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Find a single policy by ID
   * @param {number} policyId - Policy ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Policy object with grade_rows or null if not found
   */
  static async findById(policyId, tenantId) {
    let connection;
    
    try {
      if (!tenantId) {
        throw new DatabaseError('tenant_id is required');
      }

      connection = await db.getConnection();
      
      // Set current schema and optimize session settings
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`, [], { autoCommit: false });
      try {
        await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
      } catch (e) {
        // Ignore if already disabled or not supported
      }

      const query = `
        SELECT /*+ FIRST_ROWS */
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          POLICY_NAME,
          POLICY_ENTITLEMENT_DAYS,
          POLICY_ACCRUAL_METHOD,
          POLICY_STATUS,
          KUWAIT_LABOR_COMPLIANT,
          POLICY_CREATED_BY,
          POLICY_CREATED_DATE,
          ELIGIBILITY_ID,
          MIN_SERVICE_YEARS,
          MAX_SERVICE_YEARS,
          EMPLOYEE_CATEGORY_CODE,
          EMPLOYMENT_TYPE_CODE,
          CONTRACT_TYPE_CODE,
          GENDER_CODE,
          RELIGION_CODE,
          MARITAL_STATUS_CODE,
          PROBATION_ALLOWED,
          RULE_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          RULES_ALLOW_CARRY_FORWARD,
          RULES_ALLOW_ENCASHMENT,
          CF_RULE_ID,
          CF_ALLOW_CARRY_FORWARD,
          CARRY_FORWARD_LIMIT_DAYS,
          GRACE_PERIOD_DAYS,
          AUTO_FORFEIT_FLAG,
          FORFEIT_TRIGGER_CODE,
          NOTIFY_BEFORE_DAYS,
          ENCASH_RULE_ID,
          ENCASH_ALLOW_ENCASHMENT,
          ENCASHMENT_LIMIT_DAYS,
          ENCASHMENT_RATE_PCT,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ENABLE_PRO_RATA,
          COUNT_WEEKENDS_AS_LEAVE,
          ENTITLEMENT_ID,
          GRADE_FROM,
          GRADE_TO,
          GRADE_ENTITLEMENT_DAYS,
          GRADE_ACCRUAL_RATE,
          GRADE_STATUS,
          GRADE_ACCRUAL_METHOD
        FROM ${this.VIEW_NAME}
        WHERE POLICY_ID = :policy_id
          AND TENANT_ID = :tenant_id
        ORDER BY GRADE_FROM ASC
      `;

      const result = await connection.execute(query, {
        policy_id: policyId,
        tenant_id: tenantId
      }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 50
      });

      const rows = result.rows || [];
      const convertedRows = rows.map(row => this.convertRowToSnakeCase(row));
      
      // Group rows by policy_id and nest grade rows
      const policies = this.groupPoliciesByGrade(convertedRows);
      
      if (policies.length > 0) {
        await this.overlayEntitlementAccrualMethods(policies, connection);
        return policies[0];
      }
      return null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave policy', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Find a single policy by GUID
   * @param {string} policyGuid - Policy GUID (32 hex characters)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Policy object with grade_rows or null if not found
   */
  static async findByGuid(policyGuid, tenantId) {
    let connection;
    
    try {
      if (!tenantId) {
        throw new DatabaseError('tenant_id is required');
      }

      connection = await db.getConnection();
      
      // Set current schema and optimize session settings
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`, [], { autoCommit: false });
      try {
        await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
      } catch (e) {
        // Ignore if already disabled or not supported
      }

      const query = `
        SELECT /*+ FIRST_ROWS */
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          POLICY_NAME,
          POLICY_ENTITLEMENT_DAYS,
          POLICY_ACCRUAL_METHOD,
          POLICY_STATUS,
          KUWAIT_LABOR_COMPLIANT,
          POLICY_CREATED_BY,
          POLICY_CREATED_DATE,
          ELIGIBILITY_ID,
          MIN_SERVICE_YEARS,
          MAX_SERVICE_YEARS,
          EMPLOYEE_CATEGORY_CODE,
          EMPLOYMENT_TYPE_CODE,
          CONTRACT_TYPE_CODE,
          GENDER_CODE,
          RELIGION_CODE,
          MARITAL_STATUS_CODE,
          PROBATION_ALLOWED,
          RULE_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          RULES_ALLOW_CARRY_FORWARD,
          RULES_ALLOW_ENCASHMENT,
          CF_RULE_ID,
          CF_ALLOW_CARRY_FORWARD,
          CARRY_FORWARD_LIMIT_DAYS,
          GRACE_PERIOD_DAYS,
          AUTO_FORFEIT_FLAG,
          FORFEIT_TRIGGER_CODE,
          NOTIFY_BEFORE_DAYS,
          ENCASH_RULE_ID,
          ENCASH_ALLOW_ENCASHMENT,
          ENCASHMENT_LIMIT_DAYS,
          ENCASHMENT_RATE_PCT,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ENABLE_PRO_RATA,
          COUNT_WEEKENDS_AS_LEAVE,
          ENTITLEMENT_ID,
          GRADE_FROM,
          GRADE_TO,
          GRADE_ENTITLEMENT_DAYS,
          GRADE_ACCRUAL_RATE,
          GRADE_STATUS,
          GRADE_ACCRUAL_METHOD
        FROM ${this.VIEW_NAME}
        WHERE POLICY_GUID = HEXTORAW(:policy_guid)
          AND TENANT_ID = :tenant_id
        ORDER BY GRADE_FROM ASC
      `;

      const result = await connection.execute(query, {
        policy_guid: policyGuid,
        tenant_id: tenantId
      }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 50
      });

      const rows = result.rows || [];
      const convertedRows = rows.map(row => this.convertRowToSnakeCase(row));
      
      // Group rows by policy_id and nest grade rows
      const policies = this.groupPoliciesByGrade(convertedRows);
      
      if (policies.length > 0) {
        await this.overlayEntitlementAccrualMethods(policies, connection);
        return policies[0];
      }
      return null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch leave policy', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Validate that leave type exists for the tenant
   * @param {Object} connection - Database connection
   * @param {number} tenantId - Tenant ID
   * @param {number} leaveTypeId - Leave Type ID
   * @throws {DatabaseError} If leave type does not exist
   */
  static async validateLeaveTypeExists(connection, tenantId, leaveTypeId) {
    // Disable parallel execution to avoid ORA-12801
    try {
      await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
    } catch (e) {
      // Ignore if already disabled or not supported
    }
    
    const checkQuery = `
      SELECT COUNT(*) AS cnt
      FROM ABS_LEAVE_TYPES
      WHERE TENANT_ID = :tenant_id
      AND LEAVE_TYPE_ID = :leave_type_id
    `;
    
    const result = await connection.execute(checkQuery, {
      tenant_id: tenantId,
      leave_type_id: leaveTypeId
    }, { 
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: false
    });
    
    const count = result.rows[0]?.CNT || 0;
    if (count === 0) {
      throw new DatabaseError(
        `The leave type with ID ${leaveTypeId} does not exist for tenant ${tenantId}. Please verify that the leave_type_id is valid and exists in the system.`,
        { errorNum: 2291 }
      );
    }
  }

  /**
   * Create policy with grade rows by calling Oracle PL/SQL package
   * @param {Object} policyData - Policy data
   * @returns {Promise<Object>} Created policy object with grade_rows
   */
  static async createPolicyWithGrades(policyData) {
    let connection;
    
    try {
      connection = await db.getConnection();
      
      // Set current schema and optimize session settings
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`, [], { autoCommit: false });
      // Disable parallel query to avoid ORA-12801 and improve single-threaded performance
      try {
        await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
      } catch (e) {
        // Ignore if already disabled or not supported
      }
      
      // Validate leave type exists before creating policy
      await this.validateLeaveTypeExists(connection, policyData.tenant_id, policyData.leave_type_id);
      
      // Build p_grade_rows_json: include accrual_method_code per row (key exactly "accrual_method_code" for Oracle JSON_TABLE)
      const policyAccrual = policyData.accrual_method_code ?? null;
      const normalizedGradeRows = (policyData.grade_rows || []).map(row => ({
        grade_from: row.grade_from,
        grade_to: row.grade_to ?? null,
        entitlement_days: row.entitlement_days,
        accrual_rate: row.accrual_rate,
        status: row.status ?? 'ACTIVE',
        accrual_method_code: row.accrual_method_code != null && String(row.accrual_method_code).trim() !== ''
          ? row.accrual_method_code.trim()
          : policyAccrual
      }));
      const gradeRowsJson = JSON.stringify(normalizedGradeRows);

      const binds = {
        tenant_id: policyData.tenant_id,
        leave_type_id: policyData.leave_type_id,
        policy_name: policyData.policy_name,
        entitlement_days: policyData.entitlement_days,
        accrual_method_code: policyData.accrual_method_code,
        created_by: policyData.created_by,
        min_service_years: policyData.min_service_years ?? null,
        max_service_years: policyData.max_service_years ?? null,
        employee_category_code: policyData.employee_category_code ?? null,
        employment_type_code: policyData.employment_type_code ?? null,
        contract_type_code: policyData.contract_type_code ?? null,
        gender_code: policyData.gender_code ?? null,
        religion_code: policyData.religion_code ?? null,
        marital_status_code: policyData.marital_status_code ?? null,
        probation_allowed: policyData.probation_allowed ?? null,
        min_notice_days: policyData.min_notice_days ?? null,
        max_consecutive_days: policyData.max_consecutive_days ?? null,
        requires_document: policyData.requires_document ?? null,
        allow_carry_forward: policyData.allow_carry_forward ?? null,
        allow_encashment: policyData.allow_encashment ?? null,
        carry_forward_limit: policyData.carry_forward_limit ?? null,
        grace_period_days: policyData.grace_period_days ?? null,
        auto_forfeit_flag: policyData.auto_forfeit_flag ?? null,
        notify_before_days: policyData.notify_before_days ?? null,
        encashment_limit_days: policyData.encashment_limit_days ?? null,
        encashment_rate_pct: policyData.encashment_rate_pct ?? null,
        grade_rows_json: { type: oracledb.CLOB, dir: oracledb.BIND_IN, val: gradeRowsJson },
        effective_start_date: LeavePolicyModel.parseDateForOracle(policyData.effective_start_date),
        effective_end_date: LeavePolicyModel.parseDateForOracle(policyData.effective_end_date),
        enable_pro_rata: policyData.enable_pro_rata ?? 'N',
        count_weekends_as_leave: this.normalizeYn(policyData.count_weekends_as_leave)
      };

      const plsqlBlock = `
        BEGIN
          ABS_POLICY_PKG.CREATE_POLICY_WITH_GRADES(
            p_tenant_id              => :tenant_id,
            p_leave_type_id          => :leave_type_id,
            p_policy_name            => :policy_name,
            p_entitlement_days       => :entitlement_days,
            p_accrual_method_code    => :accrual_method_code,
            p_created_by             => :created_by,
            p_min_service_years      => :min_service_years,
            p_max_service_years      => :max_service_years,
            p_employee_category_code => :employee_category_code,
            p_employment_type_code   => :employment_type_code,
            p_contract_type_code     => :contract_type_code,
            p_gender_code            => :gender_code,
            p_religion_code          => :religion_code,
            p_marital_status_code    => :marital_status_code,
            p_probation_allowed      => :probation_allowed,
            p_min_notice_days        => :min_notice_days,
            p_max_consecutive_days   => :max_consecutive_days,
            p_requires_document      => :requires_document,
            p_allow_carry_forward    => :allow_carry_forward,
            p_allow_encashment       => :allow_encashment,
            p_carry_forward_limit    => :carry_forward_limit,
            p_grace_period_days      => :grace_period_days,
            p_auto_forfeit_flag      => :auto_forfeit_flag,
            p_notify_before_days     => :notify_before_days,
            p_encashment_limit_days  => :encashment_limit_days,
            p_encashment_rate_pct    => :encashment_rate_pct,
            p_grade_rows_json        => :grade_rows_json,
            p_effective_start_date   => :effective_start_date,
            p_effective_end_date     => :effective_end_date,
            p_enable_pro_rata        => :enable_pro_rata,
            p_count_weekends_as_leave => :count_weekends_as_leave
          );
        END;
      `;

      await connection.execute(plsqlBlock, binds, { autoCommit: false });

      await connection.commit();

      // Fetch the created policy to return it - optimized: use ROWNUM for faster retrieval
      const fetchQuery = `
        SELECT /*+ FIRST_ROWS(100) */
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          POLICY_NAME,
          POLICY_ENTITLEMENT_DAYS,
          POLICY_ACCRUAL_METHOD,
          POLICY_STATUS,
          KUWAIT_LABOR_COMPLIANT,
          POLICY_CREATED_BY,
          POLICY_CREATED_DATE,
          ELIGIBILITY_ID,
          MIN_SERVICE_YEARS,
          MAX_SERVICE_YEARS,
          EMPLOYEE_CATEGORY_CODE,
          EMPLOYMENT_TYPE_CODE,
          CONTRACT_TYPE_CODE,
          GENDER_CODE,
          RELIGION_CODE,
          MARITAL_STATUS_CODE,
          PROBATION_ALLOWED,
          RULE_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          RULES_ALLOW_CARRY_FORWARD,
          RULES_ALLOW_ENCASHMENT,
          CF_RULE_ID,
          CF_ALLOW_CARRY_FORWARD,
          CARRY_FORWARD_LIMIT_DAYS,
          GRACE_PERIOD_DAYS,
          AUTO_FORFEIT_FLAG,
          FORFEIT_TRIGGER_CODE,
          NOTIFY_BEFORE_DAYS,
          ENCASH_RULE_ID,
          ENCASH_ALLOW_ENCASHMENT,
          ENCASHMENT_LIMIT_DAYS,
          ENCASHMENT_RATE_PCT,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ENABLE_PRO_RATA,
          COUNT_WEEKENDS_AS_LEAVE,
          ENTITLEMENT_ID,
          GRADE_FROM,
          GRADE_TO,
          GRADE_ENTITLEMENT_DAYS,
          GRADE_ACCRUAL_RATE,
          GRADE_STATUS,
          GRADE_ACCRUAL_METHOD
        FROM ${this.VIEW_NAME}
        WHERE TENANT_ID = :tenant_id
          AND LEAVE_TYPE_ID = :leave_type_id
          AND ROWNUM <= 100
        ORDER BY POLICY_ID DESC, GRADE_FROM ASC
      `;

      const fetchResult = await connection.execute(fetchQuery, {
        tenant_id: policyData.tenant_id,
        leave_type_id: policyData.leave_type_id
      }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 100
      });

      const rows = fetchResult.rows || [];
      const convertedRows = rows.map(row => this.convertRowToSnakeCase(row));
      
      // Group rows by policy_id and nest grade rows
      const policies = this.groupPoliciesByGrade(convertedRows);
      
      // Return the first (most recent) policy with entitlement-level accrual_method for each grade
      if (policies.length > 0) {
        const policy = policies[0];
        // Overlay entitlement-level accrual_method_code from request (view may return policy-level for all rows)
        if (policy.grade_rows && policyData.grade_rows && Array.isArray(policyData.grade_rows)) {
          policy.grade_rows.forEach((gr, i) => {
            const inputRow = policyData.grade_rows[i];
            const entitlementMethod = inputRow && inputRow.accrual_method_code != null && String(inputRow.accrual_method_code).trim() !== ''
              ? inputRow.accrual_method_code
              : (policyData.accrual_method_code ?? gr.grade_accrual_method);
            gr.grade_accrual_method = entitlementMethod;
          });
        }
        return policy;
      }
      
      // If no policy found, return null (shouldn't happen)
      return null;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      
      // Check for duplicate policy error (ORA-00001)
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        throw new DatabaseError('A policy with the same configuration already exists. Please check the policy name and eligibility criteria.', error);
      }
      
      // Check for leave type validation errors in the error message
      if (error.message) {
        const upperMessage = error.message.toUpperCase();
        if (upperMessage.includes('LEAVE_TYPE') || upperMessage.includes('LEAVE TYPE')) {
          if (upperMessage.includes('NOT FOUND') || upperMessage.includes('DOES NOT EXIST') || upperMessage.includes('INVALID')) {
            throw new DatabaseError('The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.', error);
          }
        }
      }
      
      // Log full error details for debugging (especially for ORA-12801)
      if (error.errorNum === 12801 || error.message?.includes('ORA-12801')) {
        console.error('ORA-12801 Error Details:', {
          errorNum: error.errorNum,
          message: error.message,
          offset: error.offset,
          fullError: error
        });
      }
      
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to create policy', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }

  /**
   * Update policy with grade rows by calling Oracle PL/SQL procedure
   * @param {string} policyGuid - Policy GUID (32 hex characters) to update
   * @param {Object} policyData - Policy data including policy_status
   * @returns {Promise<Object>} Updated policy object with grade_rows
   */
  static async updatePolicyWithGrades(policyGuid, policyData) {
    let connection;
    
    try {
      connection = await db.getConnection();
      
      // Set current schema and optimize session settings
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ABS`, [], { autoCommit: false });
      // Disable parallel query to avoid ORA-12801 and improve single-threaded performance
      try {
        await connection.execute(`ALTER SESSION DISABLE PARALLEL QUERY`, [], { autoCommit: false });
      } catch (e) {
        // Ignore if already disabled or not supported
      }
      
      // First, get policy_id, policy_name, and optional date/flag columns from GUID (for fallback when client omits them)
      const guidLookupQuery = `
        SELECT /*+ FIRST_ROWS(1) */ POLICY_ID, POLICY_NAME,
               EFFECTIVE_START_DATE, EFFECTIVE_END_DATE, ENABLE_PRO_RATA
        FROM ABS_LEAVE_POLICIES
        WHERE POLICY_GUID = HEXTORAW(:policy_guid)
      `;
      
      const guidResult = await connection.execute(guidLookupQuery, {
        policy_guid: policyGuid
      }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false
      });
      
      if (!guidResult.rows || guidResult.rows.length === 0) {
        throw new DatabaseError(`Policy with GUID ${policyGuid} not found.`, { errorNum: 1403 });
      }
      
      const row = guidResult.rows[0];
      const policyId = row.POLICY_ID;
      const currentPolicyName = row.POLICY_NAME;
      const existingEffectiveStartDate = row.EFFECTIVE_START_DATE;
      const existingEffectiveEndDate = row.EFFECTIVE_END_DATE;
      const existingEnableProRata = row.ENABLE_PRO_RATA;
      
      // Validate leave type exists before updating policy
      await this.validateLeaveTypeExists(connection, policyData.tenant_id, policyData.leave_type_id);
      
      // Build p_grade_rows_json: include accrual_method_code per row (key exactly "accrual_method_code" for Oracle JSON_TABLE)
      const policyAccrualUpdate = policyData.accrual_method_code ?? null;
      const normalizedGradeRowsUpdate = (policyData.grade_rows || []).map(row => ({
        grade_from: row.grade_from,
        grade_to: row.grade_to ?? null,
        entitlement_days: row.entitlement_days,
        accrual_rate: row.accrual_rate,
        status: row.status ?? 'ACTIVE',
        accrual_method_code: row.accrual_method_code != null && String(row.accrual_method_code).trim() !== ''
          ? row.accrual_method_code.trim()
          : policyAccrualUpdate
      }));
      const gradeRowsJson = JSON.stringify(normalizedGradeRowsUpdate);

      // Prepare binds - handle null max_service_years with NUMBER type
      // If policy_name is not provided, use the current policy_name to avoid changing it
      const binds = {
        tenant_id: policyData.tenant_id,
        policy_id: policyId,
        leave_type_id: policyData.leave_type_id,
        policy_name: policyData.policy_name ?? currentPolicyName,
        entitlement_days: policyData.entitlement_days,
        accrual_method_code: policyData.accrual_method_code,
        policy_status: policyData.policy_status,
        updated_by: policyData.updated_by,
        min_service_years: policyData.min_service_years ?? null,
        max_service_years: policyData.max_service_years ?? null,
        employee_category_code: policyData.employee_category_code ?? null,
        employment_type_code: policyData.employment_type_code ?? null,
        contract_type_code: policyData.contract_type_code ?? null,
        gender_code: policyData.gender_code ?? null,
        religion_code: policyData.religion_code ?? null,
        marital_status_code: policyData.marital_status_code ?? null,
        probation_allowed: policyData.probation_allowed ?? null,
        min_notice_days: policyData.min_notice_days ?? null,
        max_consecutive_days: policyData.max_consecutive_days ?? null,
        requires_document: policyData.requires_document ?? null,
        allow_carry_forward: policyData.allow_carry_forward ?? null,
        allow_encashment: policyData.allow_encashment ?? null,
        carry_forward_limit: policyData.carry_forward_limit ?? null,
        grace_period_days: policyData.grace_period_days ?? null,
        auto_forfeit_flag: policyData.auto_forfeit_flag ?? null,
        notify_before_days: policyData.notify_before_days ?? null,
        encashment_limit_days: policyData.encashment_limit_days ?? null,
        encashment_rate_pct: policyData.encashment_rate_pct ?? null,
        grade_rows_json: { type: oracledb.CLOB, dir: oracledb.BIND_IN, val: gradeRowsJson },
        // Optional on update: when omitted, use existing values so we never send NULL (avoids ORA-01407)
        effective_start_date: policyData.effective_start_date != null && policyData.effective_start_date !== ''
          ? LeavePolicyModel.parseDateForOracle(policyData.effective_start_date)
          : existingEffectiveStartDate,
        effective_end_date: policyData.effective_end_date != null && policyData.effective_end_date !== ''
          ? LeavePolicyModel.parseDateForOracle(policyData.effective_end_date)
          : existingEffectiveEndDate,
        enable_pro_rata: policyData.enable_pro_rata != null && policyData.enable_pro_rata !== ''
          ? policyData.enable_pro_rata
          : (existingEnableProRata ?? 'N'),
        count_weekends_as_leave: this.normalizeYn(policyData.count_weekends_as_leave)
      };

      // Handle null max_service_years with NUMBER type to avoid PLS-00457/SQL type issues
      if (binds.max_service_years === null) {
        binds.max_service_years = { type: oracledb.NUMBER, dir: oracledb.BIND_IN, val: null };
      }

      // Dynamic PL/SQL block - use package name so Oracle resolves the correct procedure
      const plsqlBlock = `
        BEGIN
          ABS_POLICY_PKG.UPDATE_POLICY_WITH_GRADES(
            p_tenant_id               => :tenant_id,
            p_policy_id               => :policy_id,
            p_leave_type_id           => :leave_type_id,
            p_policy_name             => :policy_name,
            p_entitlement_days        => :entitlement_days,
            p_accrual_method_code     => :accrual_method_code,
            p_policy_status           => :policy_status,
            p_updated_by              => :updated_by,
            p_min_service_years       => :min_service_years,
            p_max_service_years       => :max_service_years,
            p_employee_category_code  => :employee_category_code,
            p_employment_type_code    => :employment_type_code,
            p_contract_type_code      => :contract_type_code,
            p_gender_code             => :gender_code,
            p_religion_code           => :religion_code,
            p_marital_status_code     => :marital_status_code,
            p_probation_allowed       => :probation_allowed,
            p_min_notice_days         => :min_notice_days,
            p_max_consecutive_days    => :max_consecutive_days,
            p_requires_document       => :requires_document,
            p_allow_carry_forward     => :allow_carry_forward,
            p_allow_encashment        => :allow_encashment,
            p_carry_forward_limit     => :carry_forward_limit,
            p_grace_period_days       => :grace_period_days,
            p_auto_forfeit_flag       => :auto_forfeit_flag,
            p_notify_before_days      => :notify_before_days,
            p_encashment_limit_days   => :encashment_limit_days,
            p_encashment_rate_pct     => :encashment_rate_pct,
            p_grade_rows_json         => :grade_rows_json,
            p_effective_start_date    => :effective_start_date,
            p_effective_end_date      => :effective_end_date,
            p_enable_pro_rata         => :enable_pro_rata,
            p_count_weekends_as_leave => :count_weekends_as_leave
          );
        END;
      `;

      await connection.execute(plsqlBlock, binds, { autoCommit: false });

      await connection.commit();

      // Fetch the updated policy to return it - optimized with hint, using GUID
      const fetchQuery = `
        SELECT /*+ FIRST_ROWS */
          POLICY_ID,
          RAWTOHEX(POLICY_GUID) AS POLICY_GUID,
          TENANT_ID,
          LEAVE_TYPE_ID,
          LEAVE_TYPE_EN,
          LEAVE_TYPE_AR,
          POLICY_NAME,
          POLICY_ENTITLEMENT_DAYS,
          POLICY_ACCRUAL_METHOD,
          POLICY_STATUS,
          KUWAIT_LABOR_COMPLIANT,
          POLICY_CREATED_BY,
          POLICY_CREATED_DATE,
          ELIGIBILITY_ID,
          MIN_SERVICE_YEARS,
          MAX_SERVICE_YEARS,
          EMPLOYEE_CATEGORY_CODE,
          EMPLOYMENT_TYPE_CODE,
          CONTRACT_TYPE_CODE,
          GENDER_CODE,
          RELIGION_CODE,
          MARITAL_STATUS_CODE,
          PROBATION_ALLOWED,
          RULE_ID,
          MIN_NOTICE_DAYS,
          MAX_CONSECUTIVE_DAYS,
          REQUIRES_DOCUMENT,
          RULES_ALLOW_CARRY_FORWARD,
          RULES_ALLOW_ENCASHMENT,
          CF_RULE_ID,
          CF_ALLOW_CARRY_FORWARD,
          CARRY_FORWARD_LIMIT_DAYS,
          GRACE_PERIOD_DAYS,
          AUTO_FORFEIT_FLAG,
          FORFEIT_TRIGGER_CODE,
          NOTIFY_BEFORE_DAYS,
          ENCASH_RULE_ID,
          ENCASH_ALLOW_ENCASHMENT,
          ENCASHMENT_LIMIT_DAYS,
          ENCASHMENT_RATE_PCT,
          EFFECTIVE_START_DATE,
          EFFECTIVE_END_DATE,
          ENABLE_PRO_RATA,
          COUNT_WEEKENDS_AS_LEAVE,
          ENTITLEMENT_ID,
          GRADE_FROM,
          GRADE_TO,
          GRADE_ENTITLEMENT_DAYS,
          GRADE_ACCRUAL_RATE,
          GRADE_STATUS,
          GRADE_ACCRUAL_METHOD
        FROM ${this.VIEW_NAME}
        WHERE POLICY_GUID = HEXTORAW(:policy_guid)
        ORDER BY GRADE_FROM ASC
      `;

      const fetchResult = await connection.execute(fetchQuery, {
        policy_guid: policyGuid
      }, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: 50
      });

      const rows = fetchResult.rows || [];
      const convertedRows = rows.map(row => this.convertRowToSnakeCase(row));
      
      // Group rows by policy_id and nest grade rows
      const policies = this.groupPoliciesByGrade(convertedRows);
      
      // Return the updated policy with entitlement-level accrual_method for each grade
      if (policies.length > 0) {
        const policy = policies[0];
        if (policy.grade_rows && policyData.grade_rows && Array.isArray(policyData.grade_rows)) {
          policy.grade_rows.forEach((gr, i) => {
            const inputRow = policyData.grade_rows[i];
            const entitlementMethod = inputRow && inputRow.accrual_method_code != null && String(inputRow.accrual_method_code).trim() !== ''
              ? inputRow.accrual_method_code
              : (policyData.accrual_method_code ?? gr.grade_accrual_method);
            gr.grade_accrual_method = entitlementMethod;
          });
        }
        return policy;
      }
      
      // If no policy found, return null (shouldn't happen)
      return null;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('Error during rollback:', rollbackErr);
        }
      }
      
      // Check for unique constraint violation on policy name (ORA-00001)
      if (error.errorNum === 1 || error.message?.includes('ORA-00001')) {
        const constraintName = error.constraint || '';
        if (constraintName.includes('POL_NAME') || constraintName.includes('POLICY_NAME') || 
            error.message?.includes('POL_NAME') || error.message?.includes('POLICY_NAME')) {
          throw new DatabaseError('A policy with this name already exists. Please use a different policy name.', error);
        }
        throw new DatabaseError('A policy with the same configuration already exists. Please check the policy name and eligibility criteria.', error);
      }
      
      // Check for leave type validation errors in the error message
      if (error.message) {
        const upperMessage = error.message.toUpperCase();
        if (upperMessage.includes('LEAVE_TYPE') || upperMessage.includes('LEAVE TYPE')) {
          if (upperMessage.includes('NOT FOUND') || upperMessage.includes('DOES NOT EXIST') || upperMessage.includes('INVALID')) {
            throw new DatabaseError('The leave type does not exist. Please verify that the leave_type_id is valid and exists in the system.', error);
          }
        }
      }
      
      // Log full error details for debugging (especially for ORA-12801)
      if (error.errorNum === 12801 || error.message?.includes('ORA-12801')) {
        console.error('ORA-12801 Error Details:', {
          errorNum: error.errorNum,
          message: error.message,
          offset: error.offset,
          fullError: error
        });
      }
      
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to update policy', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      }
    }
  }
}

export default LeavePolicyModel;
