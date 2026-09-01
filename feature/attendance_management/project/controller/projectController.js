import express from 'express';
import ProjectModel from '../model/projectModel.js';
import { sendSuccess, sendCreated, sendUpdated, sendDeleted, sendList } from '@digifyhr/common';
import { ValidationError, DatabaseError } from '../../../../utils/errors/index.js';
import { asyncHandler } from '@digifyhr/common';

const router = express.Router();

router.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

function getExecutionTimeMs(req) {
  return req._startTime != null ? Date.now() - req._startTime : null;
}

/** Build payload from body (enterprise_id, created_by on create, updated_by/last_updated_by on update). */
function buildPayload(body) {
  return {
    ...body,
    enterprise_id: body.enterprise_id ?? body.enterpriseId,
    created_by: body.created_by ?? body.createdBy,
    updated_by: body.updated_by ?? body.updatedBy ?? body.last_updated_by ?? body.lastUpdatedBy
  };
}

/** Apply created_by / last_updated_by from body to response so they are never null when sent. */
function applyAuditFromPayload(data, payload, isCreate) {
  if (data == null) return data;
  const createdBy = payload.created_by ?? payload.createdBy;
  const updatedBy = payload.updated_by ?? payload.updatedBy ?? payload.last_updated_by ?? payload.lastUpdatedBy;
  const out = { ...data };
  if (isCreate && createdBy != null) out.created_by = createdBy;
  if (updatedBy != null) out.last_updated_by = updatedBy;
  else if (isCreate && createdBy != null) out.last_updated_by = createdBy;
  return out;
}

/** Build response data for create/update: merge result.obj, audit fields, and tasks fallback. */
function buildUpsertResponseData(result, payload, isCreate) {
  let data = result.obj != null
    ? { ...result.obj, message: result.message }
    : { project_id: result.project_id, project_guid: result.project_guid, message: result.message };
  data = applyAuditFromPayload(data, payload, isCreate);
  if ((data.tasks == null && data.tasks_json == null) && Array.isArray(payload.tasks) && payload.tasks.length > 0) {
    data.tasks = payload.tasks;
    data.tasks_json = payload.tasks;
  }
  return data;
}

/** Validate upsert body: enterprise_id required only. user_id is not required (create or update). */
function validateUpsertPayload(payload) {
  const errors = [];
  if (payload.enterprise_id == null || payload.enterprise_id === '') {
    errors.push('enterprise_id is required');
  } else if (!Number.isFinite(Number(payload.enterprise_id)) || Number(payload.enterprise_id) <= 0) {
    errors.push('enterprise_id must be a valid positive number');
  }
  return errors;
}

function validateRemoveTaskPayload(payload) {
  const errors = validateUpsertPayload(payload);
  if (payload.project_id == null && payload.projectId == null) {
    errors.push('project_id is required');
  }
  const hasTaskId = payload.task_id != null || payload.taskId != null;
  const hasTaskGuid = payload.task_guid != null || payload.taskGuid != null;
  if (!hasTaskId && !hasTaskGuid) {
    errors.push('Either task_id or task_guid is required');
  }
  return errors;
}

function validateRemoveTasksPayload(payload) {
  const errors = validateUpsertPayload(payload);
  if (payload.project_id == null && payload.projectId == null) {
    errors.push('project_id is required');
  }
  const tasks = payload.tasks ?? payload.tasks_json;
  if (tasks == null) {
    errors.push('tasks or tasks_json is required');
  } else if (Array.isArray(tasks) && tasks.length === 0) {
    errors.push('tasks must be a non-empty array or JSON string');
  } else if (typeof tasks === 'string' && tasks.trim() === '') {
    errors.push('tasks_json must be non-empty');
  } else if (typeof tasks === 'string') {
    try {
      const arr = JSON.parse(tasks);
      if (!Array.isArray(arr) || arr.length === 0) {
        errors.push('tasks_json must be a non-empty JSON array');
      }
    } catch (_) {
      errors.push('tasks_json must be valid JSON array');
    }
  }
  return errors;
}

function validateRemoveProjectPayload(payload) {
  const errors = validateUpsertPayload(payload);
  if (payload.project_id == null && payload.projectId == null) {
    errors.push('project_id is required');
  }
  return errors;
}

const { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = ProjectModel;

/**
 * GET /api/tm/projects
 * List projects from TM.V_TM_PROJECTS_WITH_TASKS.
 * Query: enterprise_id (required), project_id?, project_guid?, status?, project_code?, search?, has_active_tasks?, page? (default 1), pageSize? (default 10).
 */
router.get('/', asyncHandler(async (req, res) => {
  const enterpriseId = req.query.enterprise_id ?? req.query.enterpriseId;
  if (enterpriseId == null || enterpriseId === '') {
    throw new ValidationError('enterprise_id is required');
  }
  const page = Math.max(DEFAULT_PAGE, parseInt(req.query.page, 10) || DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));

  const filters = {
    enterprise_id: enterpriseId,
    project_id: req.query.project_id ?? req.query.projectId,
    project_guid: req.query.project_guid ?? req.query.projectGuid,
    status: req.query.status,
    project_code: req.query.project_code ?? req.query.projectCode,
    search: req.query.search,
    has_active_tasks: req.query.has_active_tasks ?? req.query.hasActiveTasks,
    page,
    pageSize
  };

  const result = await ProjectModel.getProjects(filters);
  const { page: p, pageSize: ps, totalRecords, totalPages } = result.meta;
  const hasNext = p < totalPages;
  const hasPrevious = p > 1;
  const meta = {
    pagination: {
      page: p,
      pageSize: ps,
      total: totalRecords,
      totalPages,
      hasNext,
      hasPrevious
    }
  };
  const executionMs = getExecutionTimeMs(req);
  if (executionMs != null) meta.execution_time_ms = executionMs;

  sendList(res, {
    message: 'Fetched successfully',
    data: result.data,
    meta
  });
}));

/**
 * POST /api/tm/projects
 * Upsert project with tasks (INSERT if project_id and project_guid both null; else UPDATE).
 * Body: enterprise_id (required), project_id?, project_guid?, project_code?, project_name?, status?, tasks?, replace_tasks? (Y/N).
 */
router.post('/', asyncHandler(async (req, res) => {
  const payload = buildPayload(req.body);
  const errors = validateUpsertPayload(payload);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const result = await ProjectModel.upsertProjectWithTasks(payload);
  const isCreate = result.message === 'created';
  const data = buildUpsertResponseData(result, payload, isCreate);

  if (isCreate) {
    sendCreated(res, { message: 'Project created successfully', data });
  } else {
    sendUpdated(res, { message: 'Project updated successfully', data });
  }
}));

/**
 * PUT /api/tm/projects
 * Upsert project with tasks (same as POST).
 */
router.put('/', asyncHandler(async (req, res) => {
  const payload = buildPayload(req.body);
  const errors = validateUpsertPayload(payload);
  if (errors.length > 0) throw new ValidationError('Validation failed', errors);

  const result = await ProjectModel.upsertProjectWithTasks(payload);
  const data = buildUpsertResponseData(result, payload, false);

  sendUpdated(res, {
    message: result.message === 'created' ? 'Project created successfully' : 'Project updated successfully',
    data
  });
}));

/**
 * DELETE /api/tm/projects/task
 * Remove a single task (hard delete).
 * Body: enterprise_id, project_id, task_id OR task_guid.
 */
router.delete('/task', asyncHandler(async (req, res) => {
  const payload = buildPayload(req.body);
  const errors = validateRemoveTaskPayload(payload);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
  const result = await ProjectModel.removeProjectTask(payload);
  sendDeleted(res, {
    message: 'Task removed successfully',
    data: result
  });
}));

/**
 * DELETE /api/tm/projects/tasks
 * Remove multiple tasks (hard delete).
 * Body: enterprise_id, project_id, tasks (array of { taskId } or { taskGuid }).
 */
router.delete('/tasks', asyncHandler(async (req, res) => {
  const payload = buildPayload(req.body);
  const errors = validateRemoveTasksPayload(payload);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
  const result = await ProjectModel.removeProjectTasksJson(payload);
  sendDeleted(res, {
    message: 'Tasks removed successfully',
    data: result
  });
}));

/**
 * DELETE /api/tm/projects
 * Remove project (hard delete). No procedure – direct SQL with bind variables.
 * Body: enterprise_id, project_id.
 */
router.delete('/', asyncHandler(async (req, res) => {
  const payload = buildPayload(req.body);
  const errors = validateRemoveProjectPayload(payload);
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
  const result = await ProjectModel.removeProject(payload);
  sendDeleted(res, {
    message: 'Project deleted',
    data: result.obj ?? null
  });
}));

export default router;
