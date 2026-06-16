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

class JobFamilyModel {
  static toListPayload(filters = {}) {
    const payload = { tenant_id: requireTenantId(filters.tenant_id ?? filters.tenantId) };
    if (filters.jobFamilyId != null) payload.job_family_id = Number(filters.jobFamilyId);
    if (filters.search) payload.search = filters.search;
    if (filters.jobFamilyCode) payload.job_family_code = filters.jobFamilyCode;
    if (filters.jobFamilyName) payload.job_family_name = filters.jobFamilyName;
    applyListStatusFilters(payload, filters);
    applyPaginationToPayload(payload, filters.pagination);
    return payload;
  }

  static toPackagePayload(data, userId, tenantId) {
    return entActorPayload(data, userId, {
      tenant_id: tenantId,
      job_family_code: data.JOB_FAMILY_CODE ?? data.job_family_code,
      job_family_name_en: data.JOB_FAMILY_NAME_EN ?? data.job_family_name_en,
      job_family_name_ar: data.JOB_FAMILY_NAME_AR ?? data.job_family_name_ar,
      description: data.DESCRIPTION ?? data.description,
      status: data.STATUS ?? data.status
    });
  }

  static async findAll(filters = {}) {
    try {
      const { rows, total } = await entListEnvelope('JOB_FAMILIES', this.toListPayload(filters));
      if (filters.pagination) {
        return { job_families: rows, total };
      }
      return rows;
    } catch (error) {
      throw new Error(`Failed to fetch job families: ${error.message}`);
    }
  }

  static async findById(jobFamilyId, tenantId) {
    try {
      const tenantIdNum = requireTenantId(tenantId);
      const row = await entGetRecord('JOB_FAMILIES', {
        job_family_id: jobFamilyId,
        tenant_id: tenantIdNum
      });
      return row ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch job family: ${error.message}`);
    }
  }

  static async create(data, userId) {
    try {
      const tenantIdNum = requireTenantId(data.tenant_id ?? data.TENANT_ID);
      return await entCreateRecord('JOB_FAMILIES', this.toPackagePayload(data, userId, tenantIdNum));
    } catch (error) {
      rethrowEntError(error, 'Failed to create job family');
    }
  }

  static async update(jobFamilyId, data, userId, tenantId) {
    try {
      const tenantIdNum = requireTenantId(tenantId);
      return await entUpdateRecord('JOB_FAMILIES', {
        ...this.toPackagePayload(data, userId, tenantIdNum),
        job_family_id: jobFamilyId
      });
    } catch (error) {
      rethrowEntError(error, 'Failed to update job family');
    }
  }

  static async softDelete(jobFamilyId, userId, tenantId) {
    try {
      const tenantIdNum = requireTenantId(tenantId);
      await entUpdateRecord('JOB_FAMILIES', {
        job_family_id: jobFamilyId,
        tenant_id: tenantIdNum,
        status: 'INACTIVE',
        actor: userId || 'SYSTEM'
      });
      return true;
    } catch (error) {
      throw new Error(`Failed to delete job family: ${error.message}`);
    }
  }

  static async hardDelete(jobFamilyId, tenantId) {
    try {
      const tenantIdNum = requireTenantId(tenantId);
      return await entDeleteRecord('JOB_FAMILIES', {
        job_family_id: jobFamilyId,
        tenant_id: tenantIdNum
      }, { hard: true });
    } catch (error) {
      if (error.message?.includes('referenced')) {
        const e = new Error('Cannot delete job family: This record is referenced by other records.');
        e.code = 'FOREIGN_KEY_CONSTRAINT';
        e.suggestion = 'Use soft delete to deactivate this record instead of permanently deleting it.';
        throw e;
      }
      throw new Error(`Failed to delete job family: ${error.message}`);
    }
  }
}

export default JobFamilyModel;
