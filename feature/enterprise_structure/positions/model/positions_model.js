/**
 * Positions model (thin): all reads/writes go through ENT packages + views.
 * Keeps response shaping stable for controllers.
 */
import {
  POSITION_ALLOWED_EMPLOYMENT_TYPES,
  POSITION_ALLOWED_STATUS,
  POSITION_ORG_UNIT_SCOPE,
} from '../constants/positions_constants.js';
import {
  entCreateRecord,
  entDeleteRecord,
  entGetRecord,
  entListEnvelope,
  entInvokeAction,
  entUpdateRecord,
} from '../../shared/entModelBridge.js';
import { entInvokeWithConnection, toSnakeCaseDeep } from '../../shared/entDbClient.js';
import { paginateForExport } from '../../../../utils/excel/index.js';

/** @returns {Error & { code: string, statusCode: number }} */
function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.statusCode = 400;
  return err;
}

class PositionsModel {
  static ALLOWED_STATUS = new Set(POSITION_ALLOWED_STATUS);
  static ALLOWED_EMPLOYMENT_TYPES = new Set(POSITION_ALLOWED_EMPLOYMENT_TYPES);

  static toLowerCaseKeys(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date || obj instanceof Buffer) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((x) => this.toLowerCaseKeys(x));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = this.toLowerCaseKeys(v);
    return out;
  }

  static isMissing(v) {
    return v === undefined || v === null || v === '';
  }

  static normalizeGuidHex32(v) {
    return String(v ?? '').trim().replace(/-/g, '').toUpperCase();
  }

  static assertPositiveTenantId(raw, opts = {}) {
    const { requiredMessage = 'tenant_id is required' } = opts;
    if (raw === undefined || raw === null) throw validationError(requiredMessage);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) throw validationError('tenant_id must be a valid positive number');
    return n;
  }

  static numRequired(v, field) {
    if (this.isMissing(v)) throw validationError(`${field} is required and must be a valid number`);
    const n = Number(v);
    if (Number.isNaN(n)) throw validationError(`${field} must be a valid number`);
    return n;
  }

  static numOptional(v) {
    if (this.isMissing(v)) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  static normalizeStepNumbers(v, field = 'step_no') {
    if (this.isMissing(v)) return null;
    const values = Array.isArray(v) ? v : [v];
    if (!values.length) throw validationError(`${field} must contain at least one step value`);
    const out = values.map((item) => {
      const n = Number(item);
      if (!Number.isInteger(n) || n < 1) throw validationError(`${field} values must be positive integers (>= 1)`);
      return n;
    });
    return out;
  }

  static mapViewRowForShape(row) {
    if (!row) return row;
    return {
      ...row,
      org_structure_code_ref: row.org_structure_code,
      org_structure_name_ref: row.org_structure_name,
      org_unit_name_en_ref: row.org_unit_name_en,
      org_unit_name_ar_ref: row.org_unit_name_ar,
      org_unit_level_code_ref: row.org_unit_level_code,
      job_family_code_ref: row.job_family_code,
      job_family_name_en_ref: row.job_family_name_en,
      job_family_name_ar_ref: row.job_family_name_ar,
      job_level_code_ref: row.job_level_code,
      job_level_name_en_ref: row.job_level_name_en,
      job_level_min_grade_id_ref: row.job_level_min_grade_id,
      job_level_max_grade_id_ref: row.job_level_max_grade_id,
      grade_number_ref: row.grade_number,
      reports_to_code_ref: row.reports_to_code,
      reports_to_title_en_ref: row.reports_to_title_en
    };
  }

  static shape(row) {
    if (!row) return null;

    let org_path_json = row.org_path_json;
    if (typeof org_path_json === 'string') {
      try {
        org_path_json = JSON.parse(org_path_json);
      } catch (_) {}
    }

    let step_nos = row.step_nos_json;
    if (typeof step_nos === 'string' && step_nos.trim() !== '') {
      try {
        step_nos = JSON.parse(step_nos);
      } catch (_) {}
    }
    if (!Array.isArray(step_nos)) {
      const fallbackStep = Number(row.step_no);
      step_nos = Number.isInteger(fallbackStep) && fallbackStep > 0 ? [fallbackStep] : [];
    }

    const shaped = {
      ...row,
      org_path_json,
      step_nos,
      org_structure: {
        structure_id: row.org_structure_id,
        structure_code: row.org_structure_code_ref ?? null,
        structure_name: row.org_structure_name_ref ?? null,
      },
      org_unit: {
        org_unit_id: row.org_unit_id,
        name_en: row.org_unit_name_en_ref ?? null,
        name_ar: row.org_unit_name_ar_ref ?? null,
        level_code: row.org_unit_level_code_ref ?? null,
      },
      job_family: {
        job_family_id: row.job_family_id,
        job_family_code: row.job_family_code_ref ?? null,
        job_family_name_en: row.job_family_name_en_ref ?? null,
        job_family_name_ar: row.job_family_name_ar_ref ?? null,
      },
      job_level: {
        job_level_id: row.job_level_id,
        level_code: row.job_level_code_ref ?? null,
        level_name_en: row.job_level_name_en_ref ?? null,
        min_grade_id: row.job_level_min_grade_id_ref ?? null,
        max_grade_id: row.job_level_max_grade_id_ref ?? null,
      },
      grade: {
        grade_id: row.grade_id,
        grade_number: row.grade_number_ref ?? null,
      },
      reports_to: row.reports_to_position_id
        ? {
            position_id: row.reports_to_position_id,
            position_code: row.reports_to_code_ref ?? null,
            position_title_en: row.reports_to_title_en_ref ?? null,
          }
        : null,
    };

    // remove *_ref fields
    for (const k of Object.keys(shaped)) {
      if (k.endsWith('_ref')) delete shaped[k];
    }
    delete shaped.step_nos_json;

    return shaped;
  }

  static shapeMany(rows = []) {
    return rows.map((r) => this.shape(r));
  }

  static toPackagePayload(data, userId, tenantId) {
    const payload = this.toLowerCaseKeys(data);
    const requestedSteps = payload.step_nos !== undefined ? payload.step_nos : payload.step_no;
    const normalizedSteps = requestedSteps !== undefined
      ? this.normalizeStepNumbers(requestedSteps, 'step_no')
      : undefined;
    return {
      tenant_id: tenantId,
      position_code: payload.position_code,
      status: payload.status,
      position_title_en: payload.position_title_en,
      position_title_ar: payload.position_title_ar,
      org_structure_id: payload.org_structure_id ? this.normalizeGuidHex32(payload.org_structure_id) : undefined,
      org_unit_id: payload.org_unit_id ? this.normalizeGuidHex32(payload.org_unit_id) : undefined,
      org_path_json: payload.org_path_json ? JSON.stringify(payload.org_path_json) : payload.org_path_json,
      cost_center: payload.cost_center,
      location: payload.location,
      job_family_id: payload.job_family_id,
      job_level_id: payload.job_level_id,
      grade_id: payload.grade_id,
      step_no: normalizedSteps?.[0],
      step_nos_json: normalizedSteps ? JSON.stringify(normalizedSteps) : undefined,
      number_of_positions: payload.number_of_positions,
      filled_positions: payload.filled_positions,
      employment_type: payload.employment_type,
      budgeted_min_kd: payload.budgeted_min_kd,
      budgeted_max_kd: payload.budgeted_max_kd,
      actual_avg_kd: payload.actual_avg_kd,
      reports_to_position_id: payload.reports_to_position_id
        ? this.normalizeGuidHex32(payload.reports_to_position_id)
        : payload.reports_to_position_id,
      last_update_login: payload.last_update_login,
      actor: userId || 'SYSTEM'
    };
  }

  // ----------------------------
  // GET ALL (paginated)
  // ----------------------------
  static async findAll(filters = {}) {
    const tenantIdNum = this.assertPositiveTenantId(filters.tenant_id ?? filters.tenantId);
    const page = Number(filters?.pagination?.page || 1);
    const pageSize = Math.min(100, Number(filters?.pagination?.pageSize || 10));

    const { rows, total } = await entListEnvelope('POSITIONS', {
      tenant_id: tenantIdNum,
      search: filters.search,
      status: filters.status,
      org_structure_id: filters.org_structure_id
        ? this.normalizeGuidHex32(filters.org_structure_id)
        : undefined,
      org_unit_id: filters.org_unit_id ? this.normalizeGuidHex32(filters.org_unit_id) : undefined,
      org_unit_scope: filters.org_unit_scope,
      job_family_id: filters.job_family_id,
      job_level_id: filters.job_level_id,
      grade_id: filters.grade_id,
      page,
      page_size: pageSize
    });

    const shaped = this.shapeMany(rows.map((r) => this.mapViewRowForShape(r)));
    return { positions: shaped, total };
  }

  /**
   * Fetch all positions matching filters for Excel export (paginates internally).
   * @param {Record<string, unknown>} filters
   * @param {{ pageSize?: number, maxRows?: number }} [options]
   */
  static async findAllForExport(filters = {}, options = {}) {
    const tenantIdNum = this.assertPositiveTenantId(filters.tenant_id ?? filters.tenantId);
    const basePayload = {
      tenant_id: tenantIdNum,
      search: filters.search,
      status: filters.status,
      org_structure_id: filters.org_structure_id
        ? this.normalizeGuidHex32(filters.org_structure_id)
        : undefined,
      org_unit_id: filters.org_unit_id ? this.normalizeGuidHex32(filters.org_unit_id) : undefined,
      org_unit_scope: filters.org_unit_scope,
      job_family_id: filters.job_family_id,
      job_level_id: filters.job_level_id,
      grade_id: filters.grade_id,
    };

    const { rows, total } = await paginateForExport({
      exportOptions: options,
      fetchPage: (page, pageSize) => entListEnvelope('POSITIONS', {
        ...basePayload,
        page,
        page_size: pageSize,
      }),
      getRows: (result) => this.shapeMany(
        (result.rows ?? []).map((r) => this.mapViewRowForShape(r))
      )
    });

    return { positions: rows, total };
  }

  /**
   * Positions for an org unit and all descendants (dynamic hierarchy depth).
   */
  static async findByOrgUnitSubtree(tenantId, orgUnitIdHex32, pagination = {}) {
    return this.findAll({
      tenant_id: tenantId,
      org_unit_id: orgUnitIdHex32,
      org_unit_scope: POSITION_ORG_UNIT_SCOPE.SUBTREE,
      pagination,
    });
  }

  // ----------------------------
  // GET BY ID
  // ----------------------------
  static async findById(positionIdHex32, tenantId) {
    const tenantIdNum = this.assertPositiveTenantId(tenantId);
    const positionId = this.normalizeGuidHex32(positionIdHex32);

    const row = await entGetRecord('POSITIONS', {
      position_id: positionId,
      tenant_id: tenantIdNum
    });
    if (!row) return null;

    return this.shape(this.mapViewRowForShape(row));
  }

  // ----------------------------
  // CREATE
  // ----------------------------
  static async create(data, userId = 'SYSTEM') {
    const payload = this.toLowerCaseKeys(data);
    const tenantIdNum = this.assertPositiveTenantId(payload.tenant_id, {
      requiredMessage: 'tenant_id is required in request body',
    });

    const requestedStepsInput = payload.step_nos !== undefined ? payload.step_nos : payload.step_no;
    const normalizedSteps = this.normalizeStepNumbers(requestedStepsInput, 'step_no');
    const minKd = this.numRequired(payload.budgeted_min_kd, 'budgeted_min_kd');
    const maxKd = this.numRequired(payload.budgeted_max_kd, 'budgeted_max_kd');
    if (minKd > maxKd) throw validationError('budgeted_min_kd must be <= budgeted_max_kd');

    const totalPos = this.numOptional(payload.number_of_positions) ?? 1;
    const filled = this.numOptional(payload.filled_positions) ?? 0;
    if (totalPos < 1) throw validationError('number_of_positions must be >= 1');
    if (filled < 0) throw validationError('filled_positions must be >= 0');
    if (filled > totalPos) throw validationError('filled_positions must be <= number_of_positions');

    try {
      const created = await entCreateRecord('POSITIONS', this.toPackagePayload(data, userId, tenantIdNum));
      return this.shape(this.mapViewRowForShape(created));
    } catch (error) {
      if (error?.code === 'ENT_API_ERROR') {
        if (error.message?.includes('already exists')) {
          const err = new Error('position_code already exists');
          err.code = 'UNIQUE_CONSTRAINT_VIOLATION';
          err.statusCode = 409;
          throw err;
        }
        if (error.message?.includes('Referenced')) {
          const err = new Error(
            'Referenced record does not exist (org_structure_id/org_unit_id/job_family_id/job_level_id/grade_id/reports_to_position_id)'
          );
          err.code = 'FOREIGN_KEY_CONSTRAINT';
          err.statusCode = 400;
          throw err;
        }
      }
      throw error;
    }
  }

  // ----------------------------
  // UPDATE
  // ----------------------------
  static async update(positionIdHex32, data, userId = 'SYSTEM', tenantId) {
    const tenantIdNum = this.assertPositiveTenantId(tenantId);
    const positionId = this.normalizeGuidHex32(positionIdHex32);
    const payload = this.toLowerCaseKeys(data);
    delete payload.tenant_id;

    const updated = await entUpdateRecord('POSITIONS', {
      ...this.toPackagePayload(payload, userId, tenantIdNum),
      position_id: positionId
    });
    if (!updated) return null;
    return this.shape(this.mapViewRowForShape(updated));
  }

  static async softDelete(positionIdHex32, userId = 'SYSTEM', tenantId) {
    const tenantIdNum = this.assertPositiveTenantId(tenantId);
    const positionId = this.normalizeGuidHex32(positionIdHex32);
    const { data } = await entInvokeWithConnection('POSITIONS', 'DELETE', {
      position_id: positionId,
      tenant_id: tenantIdNum,
      actor: userId || 'SYSTEM',
      hard: 0
    });
    if (!data) return null;
    return this.shape(this.mapViewRowForShape(toSnakeCaseDeep(data)));
  }

  static async hardDelete(positionIdHex32, tenantId) {
    const tenantIdNum = this.assertPositiveTenantId(tenantId);
    const positionId = this.normalizeGuidHex32(positionIdHex32);
    const result = await entDeleteRecord('POSITIONS', {
      position_id: positionId,
      tenant_id: tenantIdNum
    }, { hard: true });
    return result ? { success: true } : null;
  }

  static async findReportingRelationships(tenantId, positionIdHex32 = null, includeHierarchy = true) {
    const tenantIdNum = this.assertPositiveTenantId(tenantId);
    const flat = await entInvokeAction('POSITIONS', 'REPORTING_TREE', { tenant_id: tenantIdNum });
    const all = Array.isArray(flat) ? flat : (Array.isArray(flat?.data) ? flat.data : []);

    const childrenByParent = new Map();
    const byId = new Map();
    for (const p of all) {
      byId.set(p.position_id, p);
      const parent = p.reports_to_position_id || null;
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(p);
    }

    const build = (parentId) => {
      const kids = childrenByParent.get(parentId) || [];
      return kids.map((pos) => ({
        position_id: pos.position_id,
        position_code: pos.position_code,
        position_title_en: pos.position_title_en,
        position_title_ar: pos.position_title_ar,
        status: pos.status,
        reports_to: pos.reports_to_position_id
          ? {
              position_id: pos.reports_to_position_id,
              position_code: pos.reports_to_code ?? null,
              position_title_en: pos.reports_to_title_en ?? null
            }
          : null,
        direct_reports: includeHierarchy ? build(pos.position_id) : []
      }));
    };

    if (positionIdHex32) {
      const rootHex = this.normalizeGuidHex32(positionIdHex32);
      const root = byId.get(rootHex);
      if (!root) return [];
      return [{
        position_id: root.position_id,
        position_code: root.position_code,
        position_title_en: root.position_title_en,
        position_title_ar: root.position_title_ar,
        status: root.status,
        reports_to: root.reports_to_position_id
          ? {
              position_id: root.reports_to_position_id,
              position_code: root.reports_to_code ?? null,
              position_title_en: root.reports_to_title_en ?? null
            }
          : null,
        direct_reports: includeHierarchy ? build(root.position_id) : []
      }];
    }

    return build(null);
  }
}

export default PositionsModel;
