import {
  entActorPayload,
  entCreateRecord,
  entDeleteRecord,
  entGetRecord,
  entListEnvelope,
  entUpdateRecord,
  rethrowEntError
} from '../../shared/entModelBridge.js';
import { requireTenantId, applyListStatusFilters, applyPaginationToPayload } from '../../shared/entModelHelpers.js';

class JobLevelsModel {
  static toListPayload(filters = {}) {
    const payload = { tenant_id: requireTenantId(filters.tenant_id ?? filters.tenantId) };
    if (filters.jobLevelId != null) payload.job_level_id = Number(filters.jobLevelId);
    if (filters.search) payload.search = filters.search;
    if (filters.levelCode) payload.level_code = filters.levelCode;
    if (filters.levelName) payload.level_name = filters.levelName;
    applyListStatusFilters(payload, filters);
    applyPaginationToPayload(payload, filters.pagination);
    return payload;
  }

  static toPackagePayload(data, userId, tenantId) {
    return entActorPayload(data, userId, {
      tenant_id: tenantId,
      level_name_en: data.LEVEL_NAME_EN ?? data.level_name_en,
      level_code: data.LEVEL_CODE ?? data.level_code,
      description: data.DESCRIPTION ?? data.description,
      min_grade_id: data.MIN_GRADE_ID ?? data.min_grade_id,
      max_grade_id: data.MAX_GRADE_ID ?? data.max_grade_id,
      status: data.STATUS ?? data.status,
      last_update_login: data.LAST_UPDATE_LOGIN ?? data.last_update_login
    });
  }

  static async enrichWithGradeDetails(row, tenantId) {
    if (!row) return null;
    const tenantIdNum = Number(tenantId);
    const toGradeObj = (g) => g ? {
      grade_id: g.grade_id,
      grade_number: g.grade_number,
      grade_category: g.grade_category,
      currency_code: g.currency_code,
      step_1_salary: g.step_1_salary,
      step_2_salary: g.step_2_salary,
      step_3_salary: g.step_3_salary,
      step_4_salary: g.step_4_salary,
      step_5_salary: g.step_5_salary,
      status: g.status,
      description: g.description
    } : null;

    const [minGrade, maxGrade] = await Promise.all([
      row.min_grade_id
        ? entGetRecord('GRADES', { grade_id: row.min_grade_id, tenant_id: tenantIdNum })
        : null,
      row.max_grade_id
        ? entGetRecord('GRADES', { grade_id: row.max_grade_id, tenant_id: tenantIdNum })
        : null
    ]);

    return {
      ...row,
      min_grade: toGradeObj(minGrade),
      max_grade: toGradeObj(maxGrade)
    };
  }

  static async findAll(filters = {}) {
    const tenantIdNum = requireTenantId(filters.tenant_id ?? filters.tenantId);
    const { rows, total } = await entListEnvelope('JOB_LEVELS', this.toListPayload(filters));
    const enriched = await Promise.all(rows.map((row) => this.enrichWithGradeDetails(row, tenantIdNum)));

    if (filters.pagination) {
      return { job_levels: enriched, total };
    }
    return enriched;
  }

  static async findById(jobLevelId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    const row = await entGetRecord('JOB_LEVELS', {
      job_level_id: jobLevelId,
      tenant_id: tenantIdNum
    });
    if (!row) return null;
    return this.enrichWithGradeDetails(row, tenantIdNum);
  }

  static async create(data, userId) {
    const tenantIdNum = requireTenantId(data.tenant_id ?? data.TENANT_ID);
    const minGradeId = parseInt(data.MIN_GRADE_ID ?? data.min_grade_id, 10);
    const maxGradeId = parseInt(data.MAX_GRADE_ID ?? data.max_grade_id, 10);
    if (!Number.isFinite(minGradeId) || !Number.isFinite(maxGradeId)) {
      const e = new Error('min_grade_id and max_grade_id must be valid integers');
      e.code = 'VALIDATION_ERROR';
      e.statusCode = 400;
      throw e;
    }

    try {
      const created = await entCreateRecord('JOB_LEVELS', this.toPackagePayload(data, userId, tenantIdNum));
      return this.enrichWithGradeDetails(created, tenantIdNum);
    } catch (error) {
      rethrowEntError(error, 'Failed to create job level');
    }
  }

  static async update(jobLevelId, data, userId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    const payload = { ...data };
    delete payload.tenant_id;
    delete payload.TENANT_ID;

    try {
      const updated = await entUpdateRecord('JOB_LEVELS', {
        ...this.toPackagePayload(payload, userId, tenantIdNum),
        job_level_id: jobLevelId
      });
      return this.enrichWithGradeDetails(updated, tenantIdNum);
    } catch (error) {
      rethrowEntError(error, 'Failed to update job level');
    }
  }

  static async softDelete(jobLevelId, userId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    await entDeleteRecord('JOB_LEVELS', {
      job_level_id: jobLevelId,
      tenant_id: tenantIdNum,
      actor: userId || 'SYSTEM'
    });
    return true;
  }

  static async hardDelete(jobLevelId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    return await entDeleteRecord('JOB_LEVELS', {
      job_level_id: jobLevelId,
      tenant_id: tenantIdNum
    }, { hard: true });
  }
}

export default JobLevelsModel;
