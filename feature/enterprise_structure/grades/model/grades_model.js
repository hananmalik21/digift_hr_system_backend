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
import { DEFAULT_GRADE_CURRENCY, resolveGradeCurrencyCode } from '../utils/gradeCurrency.js';

class GradeModel {
  static toListPayload(filters = {}) {
    const payload = { tenant_id: requireTenantId(filters.tenant_id ?? filters.tenantId) };
    if (filters.gradeId != null) payload.grade_id = Number(filters.gradeId);
    if (filters.search) payload.search = filters.search;
    if (filters.gradeNumber) payload.grade_number = filters.gradeNumber;
    if (filters.gradeCategory) payload.grade_category = filters.gradeCategory;
    applyListStatusFilters(payload, filters);
    applyPaginationToPayload(payload, filters.pagination);
    return payload;
  }

  static toPackagePayload(data, userId, tenantId, options = {}) {
    const currencyCode = resolveGradeCurrencyCode(
      data.CURRENCY_CODE ?? data.currency_code,
      options
    );

    const payload = entActorPayload(data, userId, {
      tenant_id: tenantId,
      grade_number: data.GRADE_NUMBER ?? data.grade_number,
      grade_category: data.GRADE_CATEGORY ?? data.grade_category,
      step_1_salary: data.STEP_1_SALARY ?? data.step_1_salary,
      step_2_salary: data.STEP_2_SALARY ?? data.step_2_salary,
      step_3_salary: data.STEP_3_SALARY ?? data.step_3_salary,
      step_4_salary: data.STEP_4_SALARY ?? data.step_4_salary,
      step_5_salary: data.STEP_5_SALARY ?? data.step_5_salary,
      description: data.DESCRIPTION ?? data.description,
      status: data.STATUS ?? data.status,
      last_update_login: data.LAST_UPDATE_LOGIN ?? data.last_update_login
    });

    // entActorPayload copies body keys as-is; force the normalized/omitted currency.
    if (currencyCode !== undefined) payload.currency_code = currencyCode;
    else delete payload.currency_code;

    return payload;
  }

  static async findAll(filters = {}) {
    try {
      const { rows, total } = await entListEnvelope('GRADES', this.toListPayload(filters));
      if (filters.pagination) {
        return { grades: rows, total };
      }
      return rows;
    } catch (error) {
      throw new Error(`Failed to fetch grades: ${error.message}`);
    }
  }

  static async findById(gradeId, tenantId) {
    try {
      const tenantIdNum = requireTenantId(tenantId);
      const row = await entGetRecord('GRADES', { grade_id: gradeId, tenant_id: tenantIdNum });
      return row ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch grade: ${error.message}`);
    }
  }

  static async create(data, userId) {
    const tenantIdNum = requireTenantId(data.tenant_id ?? data.TENANT_ID);
    try {
      return await entCreateRecord('GRADES', this.toPackagePayload(data, userId, tenantIdNum, {
        defaultCurrency: DEFAULT_GRADE_CURRENCY
      }));
    } catch (error) {
      rethrowEntError(error, 'Failed to create grade');
    }
  }

  static async update(gradeId, data, userId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    const payload = { ...data };
    delete payload.tenant_id;
    delete payload.TENANT_ID;
    try {
      return await entUpdateRecord('GRADES', {
        ...this.toPackagePayload(payload, userId, tenantIdNum),
        grade_id: gradeId
      });
    } catch (error) {
      rethrowEntError(error, 'Failed to update grade');
    }
  }

  static async softDelete(gradeId, userId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    await entUpdateRecord('GRADES', {
      grade_id: gradeId,
      tenant_id: tenantIdNum,
      status: 'INACTIVE',
      actor: userId || 'SYSTEM'
    });
    return true;
  }

  static async hardDelete(gradeId, tenantId) {
    const tenantIdNum = requireTenantId(tenantId);
    return await entDeleteRecord('GRADES', { grade_id: gradeId, tenant_id: tenantIdNum }, { hard: true });
  }
}

export default GradeModel;
