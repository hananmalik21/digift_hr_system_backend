import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError } from '../../../../utils/errors/index.js';

/**
 * Project Management Model
 * Oracle DB calls using TM.TM_PROJECT_PKG procedures.
 * All parameters use bind variables only (no string concatenation).
 */
class ProjectModel {
  static SCHEMA = 'TM';

  static DEFAULT_PAGE = 1;
  static DEFAULT_PAGE_SIZE = 10;
  static MAX_PAGE_SIZE = 100;

  /** When true, skip ALL_TAB_COLUMNS round-trip on upsert for faster response (length errors still from Oracle). */
  static SKIP_COLUMN_LENGTH_CHECK = true;

  /** Optional number from payload or null */
  static optNum(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Optional string from payload or null */
  static optStr(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  }

  /** Normalize Y/N flag; default N */
  static normalizeYn(value, defaultVal = 'N') {
    if (value == null || String(value).trim() === '') return defaultVal;
    return String(value).trim().toUpperCase().slice(0, 1) === 'Y' ? 'Y' : 'N';
  }

  /**
   * Convert hex string (32 chars, with or without dashes) to Buffer(16) for RAW(16) bind.
   * @returns {Buffer|null} 16-byte buffer or null if input empty/invalid
   */
  static hexStringToBuffer(hexStr) {
    if (hexStr == null || typeof hexStr !== 'string') return null;
    const hex = String(hexStr).replace(/-/g, '').trim();
    if (hex.length === 0) return null;
    if (hex.length !== 32 || !/^[0-9A-Fa-f]{32}$/.test(hex)) {
      throw new DatabaseError('GUID must be a 32-character hex string (dashes optional).', null, 'Invalid project_guid or task_guid format.');
    }
    return Buffer.from(hex, 'hex');
  }

  /** Convert Buffer(16) to hex string for API response. */
  static bufferToHexString(buf) {
    if (buf == null) return null;
    if (Buffer.isBuffer(buf)) return buf.toString('hex').toUpperCase();
    return null;
  }

  /**
   * Fetch max lengths for TM_PROJECTS and TM_PROJECT_TASKS columns (for ORA-06502 length validation).
   * Returns { PROJECT_CODE, PROJECT_NAME, STATUS, TASK_CODE, TASK_NAME, TASK_STATUS } in bytes.
   */
  static async getProjectColumnLengths(connection) {
    const sql = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_LENGTH
      FROM ALL_TAB_COLUMNS
      WHERE OWNER = :schema_name
        AND ((TABLE_NAME = 'TM_PROJECTS' AND COLUMN_NAME IN ('PROJECT_CODE', 'PROJECT_NAME', 'STATUS'))
         OR (TABLE_NAME = 'TM_PROJECT_TASKS' AND COLUMN_NAME IN ('TASK_CODE', 'TASK_NAME', 'STATUS')))
    `;
    const result = await connection.execute(sql, { schema_name: this.SCHEMA }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const map = {};
    for (const row of result.rows || []) {
      const key = row.TABLE_NAME === 'TM_PROJECT_TASKS' && row.COLUMN_NAME === 'STATUS' ? 'TASK_STATUS' : row.COLUMN_NAME;
      map[key] = row.DATA_LENGTH;
    }
    return map;
  }

  /** Validate payload string lengths against column max; throw if any exceed. */
  static validatePayloadLengths(payload, tasksArray, columnLengths) {
    if (!columnLengths || Object.keys(columnLengths).length === 0) return;
    const errors = [];
    const projectCode = this.optStr(payload.project_code ?? payload.projectCode);
    const projectName = this.optStr(payload.project_name ?? payload.projectName);
    const status = this.optStr(payload.status) ?? 'ACTIVE';
    const len = (s) => (s ? Buffer.byteLength(s, 'utf8') : 0);
    if (columnLengths.PROJECT_CODE != null && projectCode != null && len(projectCode) > columnLengths.PROJECT_CODE) {
      errors.push(`project_code exceeds max length (${columnLengths.PROJECT_CODE} bytes)`);
    }
    if (columnLengths.PROJECT_NAME != null && projectName != null && len(projectName) > columnLengths.PROJECT_NAME) {
      errors.push(`project_name exceeds max length (${columnLengths.PROJECT_NAME} bytes)`);
    }
    if (columnLengths.STATUS != null && status != null && len(status) > columnLengths.STATUS) {
      errors.push(`status exceeds max length (${columnLengths.STATUS} bytes)`);
    }
    const taskCodeLen = columnLengths.TASK_CODE;
    const taskNameLen = columnLengths.TASK_NAME;
    const taskStatusLen = columnLengths.TASK_STATUS;
    if (Array.isArray(tasksArray)) {
      tasksArray.forEach((t, i) => {
        const tc = t.taskCode ?? t.task_code;
        const tn = t.taskName ?? t.task_name;
        const ts = t.status;
        if (taskCodeLen != null && tc != null && len(String(tc)) > taskCodeLen) {
          errors.push(`tasks[${i}].taskCode exceeds max length (${taskCodeLen} bytes)`);
        }
        if (taskNameLen != null && tn != null && len(String(tn)) > taskNameLen) {
          errors.push(`tasks[${i}].taskName exceeds max length (${taskNameLen} bytes)`);
        }
        if (taskStatusLen != null && ts != null && len(String(ts)) > taskStatusLen) {
          errors.push(`tasks[${i}].status exceeds max length (${taskStatusLen} bytes)`);
        }
      });
    }
    if (errors.length > 0) {
      throw new DatabaseError(errors.join('; '), null, errors.join('; '));
    }
  }

  /**
   * Validate enterprise_id and optionally user_id.
   * @param {Object} [options] - { requireUserId: true } to require user_id (default true for update/remove)
   * @throws DatabaseError if invalid
   */
  static validateEnterpriseAndUser(enterpriseId, userId, options = {}) {
    const { requireUserId = true } = options;
    if (enterpriseId == null || enterpriseId === '' || !Number.isFinite(Number(enterpriseId)) || Number(enterpriseId) <= 0) {
      throw new DatabaseError('enterprise_id is required and must be a valid positive number.', null, 'enterprise_id is required and must be a valid positive number.');
    }
    if (requireUserId) {
      if (userId == null || userId === '') {
        throw new DatabaseError('user_id is required.', null, 'user_id is required.');
      }
      const uid = this.optStr(userId);
      if (!uid) {
        throw new DatabaseError('user_id is required.', null, 'user_id is required.');
      }
    }
  }

  /**
   * Return user_id as number for PL/SQL NUMBER parameters. Throws if not numeric.
   */
  static ensureNumericUserId(userId) {
    const n = this.optNum(userId) ?? Number(userId);
    if (n == null || !Number.isFinite(n)) {
      throw new DatabaseError('user_id must be a numeric value (e.g. user id number).', null, 'user_id must be a numeric value (e.g. user id number).');
    }
    return n;
  }

  /** Return user id as number for p_user_id bind, or null if missing/not numeric (no throw). */
  static parseOptionalUserId(v) {
    if (v == null || v === '') return null;
    const n = this.optNum(v) ?? Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** Return enterprise_id as number. */
  static ensureNumericEnterpriseId(enterpriseId) {
    const n = this.optNum(enterpriseId) ?? Number(enterpriseId);
    if (n == null || !Number.isFinite(n) || n <= 0) {
      throw new DatabaseError('enterprise_id must be a valid positive number.', null, 'enterprise_id must be a valid positive number.');
    }
    return n;
  }

  /** Throw NotFoundError if project does not exist. */
  static async ensureProjectExists(connection, projectId, enterpriseId) {
    const sql = `
      SELECT 1 FROM TM.TM_PROJECTS
      WHERE PROJECT_ID = :p_project_id AND ENTERPRISE_ID = :p_enterprise_id
    `;
    const result = await connection.execute(sql, { p_project_id: projectId, p_enterprise_id: enterpriseId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('Project not found.');
    }
  }

  /** Throw NotFoundError if task does not exist in project. */
  static async ensureTaskExists(connection, projectId, taskId, taskGuidBuffer) {
    const sql = `
      SELECT 1 FROM TM.TM_PROJECT_TASKS
      WHERE PROJECT_ID = :p_project_id
        AND ((:p_task_id IS NOT NULL AND TASK_ID = :p_task_id) OR (:p_task_guid IS NOT NULL AND TASK_GUID = :p_task_guid))
    `;
    const result = await connection.execute(sql, {
      p_project_id: projectId,
      p_task_id: taskId,
      p_task_guid: taskGuidBuffer
    }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if (!result.rows || result.rows.length === 0) {
      throw new NotFoundError('Task not found.');
    }
  }

  /** Throw NotFoundError if none of the requested tasks exist in the project. */
  static async ensureTasksExist(connection, projectId, tasksArray) {
    if (!Array.isArray(tasksArray) || tasksArray.length === 0) return;
    const sql = `SELECT TASK_ID, TASK_GUID FROM TM.TM_PROJECT_TASKS WHERE PROJECT_ID = :p_project_id`;
    const result = await connection.execute(sql, { p_project_id: projectId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = result.rows || [];
    const existingIds = new Set(rows.map(r => r.TASK_ID));
    const existingGuids = new Set(rows.map(r => r.TASK_GUID != null && Buffer.isBuffer(r.TASK_GUID) ? r.TASK_GUID.toString('hex').toUpperCase() : null).filter(Boolean));
    const normalized = (s) => String(s).replace(/-/g, '').toUpperCase();
    for (const t of tasksArray) {
      const id = t.taskId ?? t.task_id;
      const g = t.taskGuid ?? t.task_guid;
      if (id != null && existingIds.has(Number(id))) return;
      if (g != null && existingGuids.has(normalized(g))) return;
    }
    throw new NotFoundError('Task(s) not found.');
  }

  /**
   * Ensure tasks payload is a JSON array string (can be '[]').
   * @param {string|object[]} tasks - JSON string or array (will be stringified)
   * @returns {string} JSON array string
   */
  static ensureTasksJson(tasks) {
    if (tasks == null) return '[]';
    if (typeof tasks === 'string') {
      const t = tasks.trim();
      if (t === '') return '[]';
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed) ? JSON.stringify(parsed) : '[]';
      } catch (_) {
        return '[]';
      }
    }
    if (Array.isArray(tasks)) return JSON.stringify(tasks);
    return '[]';
  }

  /** Parse tasks JSON string to array once; returns [] on invalid. */
  static parseTasksArray(tasksJson) {
    if (tasksJson == null || typeof tasksJson !== 'string') return [];
    try {
      const a = JSON.parse(tasksJson);
      return Array.isArray(a) ? a : [];
    } catch (_) {
      return [];
    }
  }

  /**
   * Convert a row from V_TM_PROJECTS_WITH_TASKS to API shape (snake_case, project_guid as hex string).
   * Excludes RN and TOTAL_COUNT. tasks_json is parsed to an array for the response.
   */
  static mapProjectRow(row) {
    if (row == null) return null;
    const out = {};
    const keyMap = {
      PROJECT_ID: 'project_id',
      PROJECT_GUID: 'project_guid',
      ENTERPRISE_ID: 'enterprise_id',
      PROJECT_CODE: 'project_code',
      PROJECT_NAME: 'project_name',
      PROJECT_STATUS: 'project_status',
      CREATED_BY: 'created_by',
      CREATION_DATE: 'creation_date',
      LAST_UPDATED_BY: 'last_updated_by',
      LAST_UPDATE_DATE: 'last_update_date',
      TASKS_JSON: 'tasks_json'
    };
    for (const [oraKey, apiKey] of Object.entries(keyMap)) {
      if (!(oraKey in row)) continue;
      let val = row[oraKey];
      if (oraKey === 'PROJECT_GUID' && Buffer.isBuffer(val)) {
        val = val.toString('hex').toUpperCase();
      }
      if (oraKey === 'TASKS_JSON' && typeof val === 'string') {
        try {
          val = JSON.parse(val);
          if (!Array.isArray(val)) val = [];
        } catch (_) {
          val = [];
        }
      }
      out[apiKey] = val;
    }
    if (out.tasks_json != null && !('tasks' in out)) out.tasks = out.tasks_json;
    return out;
  }

  /**
   * Parse hasActiveTasks to NUMBER: 1 (true), 0 (false), null (ignore).
   */
  static parseHasActiveTasks(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    const s = String(value).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return 1;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return 0;
    return null;
  }

  /**
   * Build filter binds for GET projects (shared by count and data queries).
   */
  static getProjectsFilterBinds(filters) {
    const enterpriseId = this.optNum(filters.enterprise_id ?? filters.enterpriseId);
    if (enterpriseId == null || !Number.isFinite(enterpriseId) || enterpriseId <= 0) {
      throw new DatabaseError('enterprise_id is required and must be a valid positive number.', null, 'enterprise_id is required and must be a valid positive number.');
    }
    const projectGuidStr = this.optStr(filters.project_guid ?? filters.projectGuid);
    return {
      enterprise_id: enterpriseId,
      project_id: this.optNum(filters.project_id ?? filters.projectId),
      project_guid: projectGuidStr ? this.hexStringToBuffer(projectGuidStr) : null,
      status: this.optStr(filters.status),
      project_code: this.optStr(filters.project_code ?? filters.projectCode),
      search: this.optStr(filters.search),
      has_active_tasks: this.parseHasActiveTasks(filters.has_active_tasks ?? filters.hasActiveTasks)
    };
  }

  /**
   * Fetch a single project by project_id and enterprise_id from V_TM_PROJECTS_WITH_TASKS.
   * Uses existing connection. Returns mapped project object or null.
   */
  static async fetchProjectById(connection, enterpriseId, projectId) {
    const sql = `
      SELECT v.*
      FROM TM.V_TM_PROJECTS_WITH_TASKS v
      WHERE v.enterprise_id = :enterprise_id AND v.project_id = :project_id
    `;
    const result = await connection.execute(sql, { enterprise_id: enterpriseId, project_id: projectId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0];
    return row ? this.mapProjectRow(row) : null;
  }

  /**
   * Fetch the most recently created project by enterprise_id and project_code (e.g. after insert when procedure does not return project_id).
   * Uses existing connection. Returns mapped project object or null.
   */
  static async fetchProjectByEnterpriseAndCode(connection, enterpriseId, projectCode) {
    if (projectCode == null || String(projectCode).trim() === '') return null;
    const sql = `
      SELECT v.*
      FROM TM.V_TM_PROJECTS_WITH_TASKS v
      WHERE v.enterprise_id = :enterprise_id AND v.project_code = :project_code
      ORDER BY v.project_id DESC
      FETCH FIRST 1 ROWS ONLY
    `;
    const result = await connection.execute(sql, { enterprise_id: enterpriseId, project_code: String(projectCode).trim() }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0];
    return row ? this.mapProjectRow(row) : null;
  }

  /** Shared WHERE clause for V_TM_PROJECTS_WITH_TASKS list (bind variables only). */
  static getProjectsWhereClause() {
    return `
      v.enterprise_id = :enterprise_id
      AND (:project_id IS NULL OR v.project_id = :project_id)
      AND (:project_guid IS NULL OR v.project_guid = :project_guid)
      AND (:status IS NULL OR v.project_status = :status)
      AND (:project_code IS NULL OR v.project_code = :project_code)
      AND (:search IS NULL OR LOWER(v.project_name) LIKE LOWER('%' || :search || '%'))
      AND (:has_active_tasks IS NULL
           OR (:has_active_tasks = 1 AND v.active_tasks > 0)
           OR (:has_active_tasks = 0 AND v.active_tasks = 0))
    `;
  }

  /**
   * GET PROJECTS from TM.V_TM_PROJECTS_WITH_TASKS with filters and pagination.
   * Single query (COUNT(*) OVER () + ROW_NUMBER()) for one round-trip and better response time.
   * Returns { data, meta: { page, pageSize, totalRecords, totalPages } }.
   */
  static async getProjects(filters) {
    const filterBinds = this.getProjectsFilterBinds(filters);
    const page = Math.max(this.DEFAULT_PAGE, parseInt(filters.page, 10) || this.DEFAULT_PAGE);
    const pageSize = Math.max(1, Math.min(this.MAX_PAGE_SIZE, parseInt(filters.pageSize, 10) || this.DEFAULT_PAGE_SIZE));

    const whereClause = this.getProjectsWhereClause();
    const sql = `
      SELECT *
      FROM (
        SELECT v.*,
               COUNT(*) OVER () AS total_count,
               ROW_NUMBER() OVER (ORDER BY v.project_id DESC) AS rn
        FROM TM.V_TM_PROJECTS_WITH_TASKS v
        WHERE ${whereClause}
      )
      WHERE rn BETWEEN ((:page - 1) * :page_size) + 1 AND (:page * :page_size)
    `;
    const binds = { ...filterBinds, page, page_size: pageSize };

    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = result.rows || [];
      const totalRecords = rows[0]?.TOTAL_COUNT != null ? Number(rows[0].TOTAL_COUNT) : 0;
      const data = rows.map(r => this.mapProjectRow(r)).filter(Boolean);
      const totalPages = pageSize > 0 ? Math.ceil(totalRecords / pageSize) : 0;

      return {
        data,
        meta: { page, pageSize, totalRecords, totalPages }
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to fetch projects.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * 1) INSERT / UPDATE PROJECT + TASKS
   * Calls TM.TM_PROJECT_PKG.UPSERT_PROJECT_WITH_TASKS_JSON.
   * Insert: p_project_id => NULL, p_project_guid => NULL, p_created_by => from body, p_updated_by => NULL.
   * Update: p_project_guid => RAW(16) bind, p_updated_by => from body, p_created_by => NULL.
   * p_tasks_json = JSON stringify of tasks array.
   */
  static async upsertProjectWithTasks(payload, options = {}) {
    const projectIdIn = this.optNum(payload.project_id ?? payload.projectId);
    const projectGuidStr = this.optStr(payload.project_guid ?? payload.projectGuid);
    const isInsert = projectIdIn == null && !projectGuidStr;

    this.validateEnterpriseAndUser(payload.enterprise_id, payload.user_id ?? payload.userId, { requireUserId: false });

    const tasksJson = this.ensureTasksJson(payload.tasks ?? payload.tasks_json);
    const replaceTasks = this.normalizeYn(payload.replace_tasks ?? payload.replaceTasks, 'N');

    const enterpriseIdNum = this.ensureNumericEnterpriseId(payload.enterprise_id);
    const createdByStr = this.optStr(payload.created_by ?? payload.createdBy);
    const updatedByStr = this.optStr(payload.last_updated_by ?? payload.lastUpdatedBy ?? payload.updated_by ?? payload.updatedBy);

    const projectGuidBuffer = projectGuidStr ? this.hexStringToBuffer(projectGuidStr) : null;

    const binds = {
      p_project_id: {
        type: oracledb.NUMBER,
        dir: oracledb.BIND_INOUT,
        val: projectIdIn
      },
      p_project_guid: {
        type: oracledb.BUFFER,
        dir: oracledb.BIND_INOUT,
        maxSize: 16,
        val: projectGuidBuffer
      },
      p_enterprise_id: enterpriseIdNum,
      p_project_code: this.optStr(payload.project_code ?? payload.projectCode),
      p_project_name: this.optStr(payload.project_name ?? payload.projectName),
      p_status: this.optStr(payload.status) ?? 'ACTIVE',
      p_created_by: isInsert ? (createdByStr ?? null) : null,
      p_updated_by: !isInsert ? (updatedByStr ?? null) : null,
      p_tasks_json: { type: oracledb.CLOB, dir: oracledb.BIND_IN, val: tasksJson },
      p_replace_tasks: replaceTasks.trim().toUpperCase().slice(0, 1)
    };

    const plsqlBlock = `
      BEGIN
        TM.TM_PROJECT_PKG.UPSERT_PROJECT_WITH_TASKS_JSON(
          p_project_id     => :p_project_id,
          p_project_guid   => :p_project_guid,
          p_enterprise_id  => :p_enterprise_id,
          p_project_code   => :p_project_code,
          p_project_name   => :p_project_name,
          p_status         => :p_status,
          p_created_by     => :p_created_by,
          p_updated_by     => :p_updated_by,
          p_tasks_json     => :p_tasks_json,
          p_replace_tasks  => :p_replace_tasks
        );
      END;
    `;

    const tasksArray = this.parseTasksArray(tasksJson);

    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      if (!this.SKIP_COLUMN_LENGTH_CHECK) {
        let columnLengths = null;
        try {
          columnLengths = await this.getProjectColumnLengths(connection);
        } catch (_) {}
        this.validatePayloadLengths(payload, tasksArray, columnLengths || {});
      }

      await connection.execute(plsqlBlock, binds, { autoCommit: false });

      await connection.commit();

      let outProjectId = binds.p_project_id.val != null && Number.isFinite(binds.p_project_id.val) ? binds.p_project_id.val : projectIdIn;
      let outProjectGuid = this.bufferToHexString(binds.p_project_guid.val) ?? projectGuidStr;
      let obj = null;
      if (outProjectId != null) {
        obj = await this.fetchProjectById(connection, enterpriseIdNum, outProjectId);
      } else {
        const projectCode = this.optStr(payload.project_code ?? payload.projectCode);
        obj = await this.fetchProjectByEnterpriseAndCode(connection, enterpriseIdNum, projectCode);
        if (obj != null) {
          outProjectId = obj.project_id;
          outProjectGuid = obj.project_guid ?? outProjectGuid;
        }
      }

      return {
        project_id: outProjectId ?? obj?.project_id ?? null,
        project_guid: outProjectGuid ?? obj?.project_guid ?? null,
        message: isInsert ? 'created' : 'updated',
        obj
      };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to upsert project with tasks.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * 2) REMOVE SINGLE TASK (hard delete only)
   * Calls TM.TM_PROJECT_PKG.REMOVE_PROJECT_TASK with p_hard_delete = 'Y'.
   */
  static async removeProjectTask(payload) {
    this.validateEnterpriseAndUser(payload.enterprise_id, null, { requireUserId: false });

    const projectId = this.optNum(payload.project_id ?? payload.projectId);
    if (projectId == null) {
      throw new DatabaseError('project_id is required for remove task.', null, 'project_id is required.');
    }

    const taskId = this.optNum(payload.task_id ?? payload.taskId);
    const taskGuidStr = this.optStr(payload.task_guid ?? payload.taskGuid);
    if (taskId == null && !taskGuidStr) {
      throw new DatabaseError('Either task_id or task_guid is required.', null, 'Either task_id or task_guid is required.');
    }
    const taskGuidBuffer = taskGuidStr ? this.hexStringToBuffer(taskGuidStr) : null;

    const userIdRaw = payload.user_id ?? payload.userId;
    const userIdNum = (userIdRaw != null && userIdRaw !== '') ? this.ensureNumericUserId(userIdRaw) : null;

    const binds = {
      p_project_id: projectId,
      p_task_id: taskId,
      p_task_guid: taskGuidBuffer,
      p_user_id: userIdNum,
      p_hard_delete: 'Y'
    };

    const plsqlBlock = `
      BEGIN
        TM.TM_PROJECT_PKG.REMOVE_PROJECT_TASK(
          p_project_id  => :p_project_id,
          p_task_id     => :p_task_id,
          p_task_guid   => :p_task_guid,
          p_user_id     => :p_user_id,
          p_hard_delete => :p_hard_delete
        );
      END;
    `;

    const enterpriseIdNum = this.ensureNumericEnterpriseId(payload.enterprise_id);
    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });
      await this.ensureProjectExists(connection, projectId, enterpriseIdNum);
      await this.ensureTaskExists(connection, projectId, taskId, taskGuidBuffer);
      const result = await connection.execute(plsqlBlock, binds, { autoCommit: false });
      await connection.commit();
      return { rowsAffected: result.rowsAffected ?? 1 };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof NotFoundError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to remove project task.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * 3) REMOVE MULTIPLE TASKS (hard delete only)
   * Calls TM.TM_PROJECT_PKG.REMOVE_PROJECT_TASKS_JSON with p_hard_delete = 'Y'.
   */
  static async removeProjectTasksJson(payload) {
    this.validateEnterpriseAndUser(payload.enterprise_id, null, { requireUserId: false });

    const projectId = this.optNum(payload.project_id ?? payload.projectId);
    if (projectId == null) {
      throw new DatabaseError('project_id is required for remove tasks.', null, 'project_id is required.');
    }

    const tasksJson = this.ensureTasksJson(payload.tasks ?? payload.tasks_json);
    const tasksArray = this.parseTasksArray(tasksJson);
    const enterpriseIdNum = this.ensureNumericEnterpriseId(payload.enterprise_id);
    const userIdRaw = payload.user_id ?? payload.userId;
    const userIdNum = (userIdRaw != null && userIdRaw !== '') ? this.ensureNumericUserId(userIdRaw) : null;

    const binds = {
      p_project_id: projectId,
      p_tasks_json: { type: oracledb.CLOB, dir: oracledb.BIND_IN, val: tasksJson },
      p_user_id: userIdNum,
      p_hard_delete: 'Y'
    };

    const plsqlBlock = `
      BEGIN
        TM.TM_PROJECT_PKG.REMOVE_PROJECT_TASKS_JSON(
          p_project_id  => :p_project_id,
          p_tasks_json  => :p_tasks_json,
          p_user_id     => :p_user_id,
          p_hard_delete => :p_hard_delete
        );
      END;
    `;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });
      await this.ensureProjectExists(connection, projectId, enterpriseIdNum);
      await this.ensureTasksExist(connection, projectId, tasksArray);
      const result = await connection.execute(plsqlBlock, binds, { autoCommit: false });
      await connection.commit();
      return { rowsAffected: result.rowsAffected ?? undefined };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof NotFoundError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to remove project tasks.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }

  /**
   * 4) REMOVE PROJECT (hard delete only – direct SQL)
   * DELETE FROM TM.TM_PROJECT_TASKS then TM.TM_PROJECTS.
   */
  static async removeProject(payload) {
    this.validateEnterpriseAndUser(payload.enterprise_id, null, { requireUserId: false });

    const projectId = this.optNum(payload.project_id ?? payload.projectId);
    if (projectId == null) {
      throw new DatabaseError('project_id is required for remove project.', null, 'project_id is required.');
    }

    const enterpriseIdNum = this.ensureNumericEnterpriseId(payload.enterprise_id);

    const bindsProject = {
      p_project_id: projectId,
      p_enterprise_id: enterpriseIdNum
    };
    const bindsTasks = {
      p_project_id: projectId
    };

    let connection;
    try {
      connection = await db.getConnection();
      await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${this.SCHEMA}`, [], { autoCommit: false });

      const obj = await this.fetchProjectById(connection, enterpriseIdNum, projectId);
      if (obj == null) {
        throw new NotFoundError('Project not found.');
      }

      const deleteTasksSql = `
        DELETE FROM TM.TM_PROJECT_TASKS
        WHERE PROJECT_ID = :p_project_id
      `;
      const deleteProjectSql = `
        DELETE FROM TM.TM_PROJECTS
        WHERE PROJECT_ID = :p_project_id
          AND ENTERPRISE_ID = :p_enterprise_id
      `;
      const r1 = await connection.execute(deleteTasksSql, bindsTasks, { autoCommit: false });
      const r2 = await connection.execute(deleteProjectSql, bindsProject, { autoCommit: false });
      const projectRowsDeleted = r2.rowsAffected ?? 0;
      if (projectRowsDeleted === 0) {
        await connection.rollback();
        throw new NotFoundError('Project not found.');
      }
      const totalRows = (r1.rowsAffected ?? 0) + projectRowsDeleted;
      await connection.commit();
      return { rowsAffected: totalRows, obj };
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }
      if (error instanceof NotFoundError) throw error;
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError('Failed to remove project.', error);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (_) {}
      }
    }
  }
}

export default ProjectModel;
